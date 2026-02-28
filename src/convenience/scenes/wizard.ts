import { BaseScene } from "./base.ts";
import type { Middleware } from "../../composer.ts";
import type { WizardContext, WizardContextFlavor, WizardController } from "./context.ts";

export class WizardScene<C extends WizardContext> extends BaseScene<C> {
  readonly #steps: Middleware<C>[];

  constructor(id: string, ...steps: Middleware<C>[]) {
    super(id);
    this.#steps = steps;

    // Override the main handler: dispatch to the current step
    this.use((ctx, next) => {
      const cursor = ctx.scene.current?.id === this.id
        ? (ctx.session.__scenes?.cursor ?? 0)
        : 0;

      const step = this.#steps[cursor];
      if (!step) return next();

      // Attach wizard controller to ctx
      const self = this;
      const wizard: WizardController = {
        get cursor() {
          return ctx.session.__scenes?.cursor ?? 0;
        },
        selectStep(index: number) {
          if (!ctx.session.__scenes) ctx.session.__scenes = {};
          ctx.session.__scenes.cursor = Math.max(0, Math.min(index, self.#steps.length - 1));
        },
        async next() {
          wizard.selectStep(wizard.cursor + 1);
        },
        async back() {
          wizard.selectStep(wizard.cursor - 1);
        },
        get state() {
          return ctx.session.__scenes?.state ?? {};
        },
        set state(val: Record<string, unknown>) {
          if (!ctx.session.__scenes) ctx.session.__scenes = {};
          ctx.session.__scenes.state = val;
        },
      };

      (ctx as unknown as WizardContextFlavor).wizard = wizard;

      if (typeof step === "function") return step(ctx, next);
      return step.middleware()(ctx, next);
    });
  }

  get stepCount(): number {
    return this.#steps.length;
  }
}
