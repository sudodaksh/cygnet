import type { MaybePromise } from "./types.ts";
import type { FilterQuery, Filter } from "./filter.ts";
import type { Context } from "./context.ts";
import { BotError } from "./core/error.ts";
import { defaultLogger } from "./core/logger.ts";

// --- Core middleware types ---

export type NextFunction = () => Promise<void>;

export type MiddlewareFn<C> = (
  ctx: C,
  next: NextFunction,
) => MaybePromise<unknown>;

export interface MiddlewareObj<C> {
  middleware(): MiddlewareFn<C>;
}

export type Middleware<C> = MiddlewareFn<C> | MiddlewareObj<C>;

/** A trigger can be a string (exact match), RegExp, or a function predicate. */
export type Trigger<C> =
  | string
  | RegExp
  | ((ctx: C) => MaybePromise<boolean>);

/** Narrowed context after chatType() filter. */
export type ChatTypeContext<C, T extends "group" | "private"> =
  T extends "group" ? C & { isGroup: true } : C & { isGroup: false };

// --- Internal helpers ---

/** Unwrap MiddlewareObj to MiddlewareFn */
export function flatten<C>(mw: Middleware<C>): MiddlewareFn<C> {
  return typeof mw === "function" ? mw : (ctx, next) => mw.middleware()(ctx, next);
}

/**
 * Compose two middleware in sequence.
 * `first` runs; if it calls next, `then` runs.
 */
export function concat<C>(
  first: MiddlewareFn<C>,
  then: MiddlewareFn<C>,
): MiddlewareFn<C> {
  return async (ctx, next) => {
    let called = false;
    await first(ctx, async () => {
      if (called) throw new Error("next() called multiple times");
      called = true;
      await then(ctx, next);
    });
  };
}

/** Run a middleware with a no-op next. */
export function run<C>(mw: MiddlewareFn<C>, ctx: C): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    Promise.resolve(mw(ctx, async () => {})).then(() => resolve(), reject);
  });
}

/** Compose an array of middleware into one. */
function compose<C>(middlewares: Middleware<C>[]): MiddlewareFn<C> {
  const fns = middlewares.map(flatten);
  return fns.reduce(concat, (_ctx, next) => next());
}

// --- Composer ---

export class Composer<C extends Context> implements MiddlewareObj<C> {
  #handler: MiddlewareFn<C>;

  /** Error handler for background middleware (fork). Bot overrides to route through bot.catch(). */
  protected _onForkError: (err: unknown, ctx: C) => void =
    (err) => defaultLogger.error("Error in forked middleware:", err);

  constructor(...middleware: Middleware<C>[]) {
    this.#handler = middleware.length > 0
      ? compose(middleware)
      : (_ctx, next) => next();
  }

  middleware(): MiddlewareFn<C> {
    return this.#handler;
  }

  /**
   * Register middleware for all updates.
   */
  use(...middleware: Middleware<C>[]): this {
    const mw = compose(middleware);
    this.#handler = concat(this.#handler, mw);
    return this;
  }

  /**
   * Filter updates by a FilterQuery string (type-safe) or a predicate.
   * The resulting middleware's context is narrowed to the matching type.
   */
  on<Q extends FilterQuery>(
    filter: Q | Q[],
    ...middleware: Middleware<Filter<C, Q>>[]
  ): this {
    const filters = Array.isArray(filter) ? filter : [filter];
    return this.filter(
      (ctx): ctx is Filter<C, Q> =>
        filters.some((q) => matchFilter(ctx, q)),
      ...middleware,
    );
  }

  /**
   * Filter updates by chat type: "group" or "private".
   * Works across all update types (messages, edits, typing, etc.).
   */
  chatType<T extends "group" | "private">(
    type: T,
    ...middleware: Middleware<ChatTypeContext<C, T>>[]
  ): this {
    return this.filter(
      (ctx): ctx is ChatTypeContext<C, T> =>
        type === "group" ? ctx.isGroup : !ctx.isGroup,
      ...middleware,
    );
  }

  /**
   * Match message text against string(s) or RegExp(s).
   * Sets ctx.match on RegExp matches.
   */
  hears(
    trigger: string | RegExp | (string | RegExp)[],
    ...middleware: Middleware<C>[]
  ): this {
    const triggers = Array.isArray(trigger) ? trigger : [trigger];
    return this.filter((ctx) => {
      const text = ctx.text;
      if (!text) return false;
      for (const t of triggers) {
        if (typeof t === "string") {
          if (text.includes(t)) {
            (ctx as Record<string, unknown>).match = t;
            return true;
          }
        } else {
          const m = t.exec(text);
          if (m) {
            (ctx as Record<string, unknown>).match = m;
            return true;
          }
        }
      }
      return false;
    }, ...middleware);
  }

  /**
   * Match Signal text commands: "/command" at the start of message text.
   * Handles "/command@botname" format.
   */
  command(
    command: string | string[],
    ...middleware: Middleware<C>[]
  ): this {
    const commands = Array.isArray(command) ? command : [command];
    const normalized = commands.map((c) => c.replace(/^\//, "").toLowerCase());
    return this.filter((ctx) => {
      const text = ctx.text;
      if (!text?.startsWith("/")) return false;
      // "/cmd", "/cmd arg", "/cmd@botname arg" (arg may span multiple lines)
      const match = /^\/([a-z0-9_]+)(@\S+)?(?:\s([\s\S]*))?$/i.exec(text);
      if (!match) return false;
      const cmd = (match[1] ?? "").toLowerCase();
      if (!normalized.includes(cmd)) return false;
      (ctx as Record<string, unknown>).match = (match[3] ?? "").trim();
      return true;
    }, ...middleware);
  }

  /**
   * Filter updates by an arbitrary predicate. If the predicate is a type guard,
   * the context type is narrowed.
   */
  filter<D extends C>(
    predicate: (ctx: C) => ctx is D,
    ...middleware: Middleware<D>[]
  ): this;
  filter(
    predicate: (ctx: C) => MaybePromise<boolean>,
    ...middleware: Middleware<C>[]
  ): this;
  filter(
    predicate: (ctx: C) => MaybePromise<boolean>,
    ...middleware: Middleware<C>[]
  ): this {
    const mw = compose(middleware);
    return this.use(async (ctx, next) => {
      if (await predicate(ctx)) {
        await mw(ctx, next);
      } else {
        await next();
      }
    });
  }

  /**
   * Stop processing if predicate matches (does NOT call next).
   */
  drop(predicate: (ctx: C) => MaybePromise<boolean>): this {
    return this.use(async (ctx, next) => {
      if (!(await predicate(ctx))) await next();
    });
  }

  /**
   * if/else routing.
   */
  branch(
    predicate: (ctx: C) => MaybePromise<boolean>,
    trueMiddleware: Middleware<C>,
    falseMiddleware: Middleware<C>,
  ): this {
    return this.use(async (ctx, next) => {
      if (await predicate(ctx)) {
        await flatten(trueMiddleware)(ctx, next);
      } else {
        await flatten(falseMiddleware)(ctx, next);
      }
    });
  }

  /**
   * Run middleware in the background — does NOT block the chain.
   * Errors in forked middleware are silently ignored (catch them yourself).
   */
  fork(...middleware: Middleware<C>[]): this {
    const mw = compose(middleware);
    return this.use((ctx, next) => {
      run(mw, ctx).catch((err) => this._onForkError(err, ctx));
      return next();
    });
  }

  /**
   * Defer middleware selection to runtime based on context.
   */
  lazy(
    factory: (ctx: C) => MaybePromise<Middleware<C> | Middleware<C>[]>,
  ): this {
    return this.use(async (ctx, next) => {
      const result = await factory(ctx);
      const middlewares = Array.isArray(result) ? result : [result];
      const mw = compose(middlewares);
      await mw(ctx, next);
    });
  }

  /**
   * Isolated error boundary: errors thrown inside are caught by `errorHandler`.
   * The handler receives a BotError and `next`. Call `next()` to continue
   * downstream; omit it to swallow the error and stop propagation.
   */
  errorBoundary(
    errorHandler: (err: BotError<C>, next: NextFunction) => MaybePromise<void>,
    ...middleware: Middleware<C>[]
  ): this {
    const mw = compose(middleware);
    return this.use(async (ctx, next) => {
      try {
        await run(mw, ctx);
      } catch (err) {
        await errorHandler(new BotError<C>(err, ctx), next);
        return;
      }
      await next();
    });
  }
}

// --- Filter matching (runtime) ---

import { matchFilter } from "./filter.ts";
