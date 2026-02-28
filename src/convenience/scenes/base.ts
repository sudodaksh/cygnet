import { Composer } from "../../composer.ts";
import type { Context } from "../../context.ts";
import type { Middleware } from "../../composer.ts";
import type { SceneContextFlavor } from "./context.ts";

export type SceneMiddlewareContext = Context & SceneContextFlavor;

/**
 * A BaseScene is a Composer with a unique ID and lifecycle hooks.
 * Handlers registered on a scene are only active while the scene is current.
 */
export class BaseScene<C extends SceneMiddlewareContext> extends Composer<C> {
  readonly id: string;
  #ttl?: number;

  #enterHandlers: Middleware<C>[] = [];
  #leaveHandlers: Middleware<C>[] = [];

  constructor(id: string, ttl?: number) {
    super();
    this.id = id;
    this.#ttl = ttl;
  }

  /** TTL in milliseconds for session expiry. Optional. */
  get ttl(): number | undefined {
    return this.#ttl;
  }

  /**
   * Register middleware to run when the scene is entered.
   */
  enter(...middleware: Middleware<C>[]): this {
    this.#enterHandlers.push(...middleware);
    return this;
  }

  /**
   * Register middleware to run when the scene is left.
   */
  leave(...middleware: Middleware<C>[]): this {
    this.#leaveHandlers.push(...middleware);
    return this;
  }

  /** Returns the composed enter handler. */
  enterMiddleware(): Middleware<C> {
    if (this.#enterHandlers.length === 0) return (_ctx, next) => next();
    const handlers = this.#enterHandlers;
    return (ctx, next) => {
      let i = 0;
      const dispatch = async (): Promise<void> => {
        if (i >= handlers.length) return next();
        const mw = handlers[i++];
        if (!mw) return next();
        if (typeof mw === "function") await mw(ctx, dispatch);
        else await mw.middleware()(ctx, dispatch);
      };
      return dispatch();
    };
  }

  /** Returns the composed leave handler. */
  leaveMiddleware(): Middleware<C> {
    if (this.#leaveHandlers.length === 0) return (_ctx, next) => next();
    const handlers = this.#leaveHandlers;
    return (ctx, next) => {
      let i = 0;
      const dispatch = async (): Promise<void> => {
        if (i >= handlers.length) return next();
        const mw = handlers[i++];
        if (!mw) return next();
        if (typeof mw === "function") await mw(ctx, dispatch);
        else await mw.middleware()(ctx, dispatch);
      };
      return dispatch();
    };
  }
}
