import { Composer, flatten, run } from "../../composer.ts";
import type { Middleware, MiddlewareFn } from "../../composer.ts";
import type { Context } from "../../context.ts";
import type {
  SceneContext,
  SceneContextFlavor,
  SceneController,
  SceneSessionData,
} from "./context.ts";
import { BaseScene } from "./base.ts";

/**
 * Scene manager middleware. While a scene is active, only that scene's
 * handlers run — bot-level handlers registered after `bot.use(stage)` are
 * skipped. To add global commands (e.g. /cancel) that work inside scenes,
 * register them BEFORE the stage using the instance helpers:
 *
 *   const stage = new Stage([scene]);
 *   bot.command("cancel", stage.leave());  // works inside scenes
 *   bot.use(stage);
 */
export class Stage<C extends SceneContext> extends Composer<C> {
  readonly #scenes: Map<string, BaseScene<C>>;

  constructor(scenes: BaseScene<C>[]) {
    super();
    this.#scenes = new Map(scenes.map((s) => [s.id, s]));
  }

  override middleware(): MiddlewareFn<C> {
    const scenes = this.#scenes;

    return async (ctx, next) => {
      const sceneCtrl = getOrCreateSceneController(ctx, scenes);

      // If currently in a scene, route to that scene's handler
      const current = sceneCtrl.current;
      if (current) {
        // Check TTL expiry
        const expires = ctx.session.__scenes?.expires;
        if (expires && Date.now() > expires) {
          await sceneCtrl.leave();
          return next();
        }
        await run(flatten(current), ctx);
        return;
      }

      await next();
    };
  }

  /** Middleware factory bound to this stage: enter a scene by ID. */
  enter(sceneId: string): MiddlewareFn<C> {
    return (ctx) => getOrCreateSceneController(ctx, this.#scenes).enter(sceneId);
  }

  /** Middleware factory bound to this stage: leave the current scene. */
  leave(): MiddlewareFn<C> {
    return (ctx) => getOrCreateSceneController(ctx, this.#scenes).leave();
  }

  /** Middleware factory bound to this stage: re-enter the current scene. */
  reenter(): MiddlewareFn<C> {
    return (ctx) => getOrCreateSceneController(ctx, this.#scenes).reenter();
  }

  /** Middleware factory: enter a scene by ID. */
  static enter<C extends SceneContext>(sceneId: string): MiddlewareFn<C> {
    return (ctx) => {
      const scene = ctx.scene;
      if (!scene) {
        throw new Error(
          `[cygnet] ctx.scene is not attached. Use a Stage instance helper (stage.enter("${sceneId}")) or register bot.use(stage) before this middleware.`,
        );
      }
      return scene.enter(sceneId);
    };
  }

  /** Middleware factory: leave the current scene. */
  static leave<C extends SceneContext>(): MiddlewareFn<C> {
    return (ctx) => {
      const scene = ctx.scene;
      if (!scene) {
        throw new Error(
          "[cygnet] ctx.scene is not attached. Use a Stage instance helper (stage.leave()) or register bot.use(stage) before this middleware.",
        );
      }
      return scene.leave();
    };
  }

  /** Middleware factory: re-enter the current scene. */
  static reenter<C extends SceneContext>(): MiddlewareFn<C> {
    return (ctx) => {
      const scene = ctx.scene;
      if (!scene) {
        throw new Error(
          "[cygnet] ctx.scene is not attached. Use a Stage instance helper (stage.reenter()) or register bot.use(stage) before this middleware.",
        );
      }
      return scene.reenter();
    };
  }
}

function getOrCreateSceneController<C extends SceneContext>(
  ctx: C,
  scenes: Map<string, BaseScene<C>>,
): SceneController {
  const flavored = ctx as unknown as SceneContextFlavor & { scene?: SceneController };
  if (flavored.scene) return flavored.scene;

  const sceneCtrl = createSceneController(ctx, scenes);
  flavored.scene = sceneCtrl;
  return sceneCtrl;
}

function createSceneController<C extends SceneContext>(
  ctx: C,
  scenes: Map<string, BaseScene<C>>,
): SceneController {
  const ctrl: SceneController = {
    get id(): string | undefined {
      return ctx.session.__scenes?.current;
    },
    get current(): BaseScene<C> | undefined {
      const id = ctx.session.__scenes?.current;
      return id ? scenes.get(id) : undefined;
    },
    get state(): Record<string, unknown> {
      return ctx.session.__scenes?.state ?? {};
    },
    set state(val: Record<string, unknown>) {
      if (!ctx.session.__scenes) ctx.session.__scenes = {};
      ctx.session.__scenes.state = val;
    },
    async enter(sceneId: string, initialState?: Record<string, unknown>): Promise<void> {
      // Leave current scene first
      const current = scenes.get(ctx.session.__scenes?.current ?? "");
      if (current) {
        await run(flatten(current.leaveMiddleware()), ctx);
      }

      const next = scenes.get(sceneId);
      if (!next) throw new Error(`[cygnet] Scene "${sceneId}" not found`);

      const ttl = next.ttl;
      ctx.session.__scenes = {
        current: sceneId,
        state: initialState ?? {},
        cursor: 0,
        expires: ttl ? Date.now() + ttl : undefined,
      };

      await run(flatten(next.enterMiddleware()), ctx);
    },
    async leave(): Promise<void> {
      const id = ctx.session.__scenes?.current;
      if (!id) return;
      const scene = scenes.get(id);
      if (scene) {
        await run(flatten(scene.leaveMiddleware()), ctx);
      }
      ctx.session.__scenes = undefined;
    },
    async reenter(): Promise<void> {
      const id = ctx.session.__scenes?.current;
      if (!id) return;
      await ctrl.enter(id, ctrl.state);
    },
  };
  return ctrl;
}
