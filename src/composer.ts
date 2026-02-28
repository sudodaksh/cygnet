import type { MaybePromise } from "./types.ts";
import type { FilterQuery, Filter } from "./filter.ts";
import type { Context } from "./context.ts";

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
      if (text === undefined) return false;
      for (const t of triggers) {
        if (typeof t === "string") {
          if (text === t) return true;
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
      // "/cmd", "/cmd arg", "/cmd@botname"
      const match = /^\/([a-z0-9_]+)(@\S+)?(?:\s|$)/i.exec(text);
      if (!match) return false;
      const cmd = (match[1] ?? "").toLowerCase();
      return normalized.includes(cmd);
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
        await run(mw, ctx);
      }
      await next();
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
        await run(flatten(trueMiddleware), ctx);
      } else {
        await run(flatten(falseMiddleware), ctx);
      }
      await next();
    });
  }

  /**
   * Run middleware in the background — does NOT block the chain.
   * Errors in forked middleware are silently ignored (catch them yourself).
   */
  fork(...middleware: Middleware<C>[]): this {
    const mw = compose(middleware);
    return this.use((ctx, next) => {
      run(mw, ctx).catch(() => {}); // background
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
   */
  errorBoundary(
    errorHandler: (err: unknown, ctx: C) => MaybePromise<void>,
    ...middleware: Middleware<C>[]
  ): this {
    const mw = compose(middleware);
    return this.use(async (ctx, next) => {
      try {
        await run(mw, ctx);
      } catch (err) {
        await errorHandler(err, ctx);
      }
      await next();
    });
  }
}

// --- Filter matching (runtime) ---

import { matchFilter } from "./filter.ts";
