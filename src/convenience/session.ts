import { readFile, writeFile } from "fs/promises";

import type { Context } from "../context.ts";
import type { MaybePromise } from "../types.ts";
import type { MiddlewareFn } from "../composer.ts";

// --- StorageAdapter ---

export interface StorageAdapter<T> {
  read(key: string): MaybePromise<T | undefined>;
  write(key: string, value: T): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
}

/**
 * Branded storage adapter for state that must not be wrapped or transformed.
 * `enhanceStorage()` returns a plain StorageAdapter, so it is intentionally not
 * assignable to this type.
 */
export const directStorageBrand: unique symbol = Symbol("cygnet.directStorage");

export interface DirectStorageAdapter<T> extends StorageAdapter<T> {
  readonly [directStorageBrand]: true;
}

// --- SessionFlavor ---

/**
 * Context flavor that adds a `session` property.
 * Usage:
 *   type MyContext = Context & SessionFlavor<{ count: number }>;
 */
export interface SessionFlavor<S> {
  session: S;
}

// --- Session options ---

export interface SessionOptions<S, C extends Context> {
  /**
   * Factory for a fresh session object when none exists.
   * Required unless undefined sessions are acceptable.
   */
  initial?: () => S;
  /**
   * Derive the session storage key from context.
   * Defaults to ctx.chat (group ID or phone number).
   * Return undefined to skip session loading for this update.
   */
  getSessionKey?: (ctx: C) => MaybePromise<string | undefined>;
  /**
   * Storage backend. Defaults to MemoryStorage (in-process, lost on restart).
   */
  storage?: StorageAdapter<S>;
  /**
   * Prefix prepended to all session keys. Useful when multiple bots share
   * the same storage backend. Default: "" (no prefix).
   */
  keyPrefix?: string;
}

// --- session() middleware ---

export function session<S, C extends Context = Context>(
  options: SessionOptions<S, C> = {},
): MiddlewareFn<C & SessionFlavor<S>> {
  const storage: StorageAdapter<S> = options.storage ?? new MemoryStorage<S>();
  const getKey = options.getSessionKey ?? ((ctx: C) => ctx.chat);
  const initial = options.initial;
  const prefix = options.keyPrefix ?? "";

  return async (ctx, next) => {
    const rawKey = await getKey(ctx as C);
    const key = rawKey === undefined ? undefined : prefix + rawKey;
    if (key === undefined) {
      // No session key — skip session for this update
      return next();
    }

    // Load session
    let data: S | undefined = (await storage.read(key)) as S | undefined;
    if (data === undefined && initial) {
      data = initial();
    }

    // Expose as ctx.session
    (ctx as unknown as SessionFlavor<S>).session = data as S;

    await next();

    // Persist session after middleware chain
    const updated = (ctx as unknown as SessionFlavor<S>).session;
    if (updated === null || updated === undefined) {
      await storage.delete(key);
    } else {
      await storage.write(key, updated);
    }
  };
}

// --- MemoryStorage ---

export class MemoryStorage<T> implements DirectStorageAdapter<T> {
  readonly [directStorageBrand] = true as const;
  readonly #store = new Map<string, T>();

  read(key: string): T | undefined {
    return this.#store.get(key);
  }

  write(key: string, value: T): void {
    this.#store.set(key, value);
  }

  delete(key: string): void {
    this.#store.delete(key);
  }

  /** Return all keys (useful for debugging / migrations). */
  keys(): IterableIterator<string> {
    return this.#store.keys();
  }
}

/**
 * JSON-file-backed storage adapter.
 *
 * Stores all keys in a single JSON object on disk. Simple and durable, but not
 * intended for high write volume or concurrent writers.
 */
export class FileStorage<T> implements DirectStorageAdapter<T> {
  readonly [directStorageBrand] = true as const;
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async read(key: string): Promise<T | undefined> {
    const store = await this.#readStore();
    return store[key];
  }

  async write(key: string, value: T): Promise<void> {
    const store = await this.#readStore();
    store[key] = value;
    await this.#writeStore(store);
  }

  async delete(key: string): Promise<void> {
    const store = await this.#readStore();
    if (!(key in store)) return;
    delete store[key];
    await this.#writeStore(store);
  }

  async #readStore(): Promise<Record<string, T>> {
    try {
      const text = await readFile(this.#path, "utf8");
      if (!text) return {};
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, T>;
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
      if (code === "ENOENT") return {};
      throw err;
    }
  }

  async #writeStore(store: Record<string, T>): Promise<void> {
    await writeFile(this.#path, JSON.stringify(store), "utf8");
  }
}

// --- enhanceStorage ---

/** Wrapper type for storage entries with TTL metadata. */
export interface EnhancedEntry<T> {
  value: T;
  /** Unix ms expiry timestamp, or undefined for no expiry. */
  expires?: number;
}

export interface EnhanceStorageOptions<T> {
  /** The underlying storage adapter to wrap. */
  storage: StorageAdapter<EnhancedEntry<T>>;
  /** Time-to-live in milliseconds. Entries expire this many ms after their last write. */
  ttl: number;
}

/**
 * Wrap any StorageAdapter with TTL support. The underlying adapter stores
 * `EnhancedEntry<T>` (value + expiry metadata). Expired entries are lazily
 * evicted on read.
 *
 * @example
 * bot.use(session({
 *   storage: enhanceStorage({
 *     storage: new MemoryStorage(),
 *     ttl: 5 * 60 * 1000, // 5 minutes
 *   }),
 * }));
 */
export function enhanceStorage<T>(
  options: EnhanceStorageOptions<T>,
): StorageAdapter<T> {
  const { storage, ttl: ttl } = options;
  return {
    async read(key) {
      const entry = await storage.read(key);
      if (!entry) return undefined;
      if (entry.expires !== undefined && Date.now() > entry.expires) {
        await storage.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async write(key, value) {
      await storage.write(key, {
        value,
        expires: Date.now() + ttl,
      });
    },
    async delete(key) {
      await storage.delete(key);
    },
  };
}

// Re-export MiddlewareFn so callers can type-annotate session return value
export type { MiddlewareFn } from "../composer.ts";
