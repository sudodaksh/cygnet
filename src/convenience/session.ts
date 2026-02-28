import type { Context } from "../context.ts";
import type { MaybePromise } from "../types.ts";
import type { MiddlewareFn } from "../composer.ts";

// --- StorageAdapter ---

export interface StorageAdapter<T> {
  read(key: string): MaybePromise<T | undefined>;
  write(key: string, value: T): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
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

export class MemoryStorage<T> implements StorageAdapter<T> {
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

// Re-export MiddlewareFn so callers can type-annotate session return value
export type { MiddlewareFn } from "../composer.ts";
