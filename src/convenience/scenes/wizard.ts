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
      const step = this.#currentStep(ctx);
      if (!step) return next();
      this.#attachWizard(ctx);

      if (typeof step === "function") return step(ctx, next);
      return step.middleware()(ctx, next);
    });
  }

  override enterMiddleware(): Middleware<C> {
    const enter = super.enterMiddleware();

    return async (ctx, next) => {
      const runFirstStep = async () => {
        const step = this.#steps[0];
        if (!step) {
          await next();
          return;
        }

        this.#attachWizard(ctx);

        if (typeof step === "function") {
          await step(ctx, next);
          return;
        }

        await step.middleware()(ctx, next);
      };

      if (typeof enter === "function") {
        await enter(ctx, runFirstStep);
        return;
      }

      await enter.middleware()(ctx, runFirstStep);
    };
  }

  get stepCount(): number {
    return this.#steps.length;
  }

  #currentStep(ctx: C): Middleware<C> | undefined {
    const cursor = ctx.scene.current?.id === this.id
      ? (ctx.session.__scenes?.cursor ?? 0)
      : 0;
    return this.#steps[cursor];
  }

  #attachWizard(ctx: C): WizardController {
    const self = this;
    const wizard: WizardController = {
      get cursor() {
        return ctx.session.__scenes?.cursor ?? 0;
      },
      selectStep(index: number) {
        if (!ctx.session.__scenes) ctx.session.__scenes = {};
        ctx.session.__scenes.cursor = Math.max(0, Math.min(index, self.#steps.length - 1));
      },
      async advance() {
        wizard.selectStep(wizard.cursor + 1);
      },
      async retreat() {
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
    return wizard;
  }
}
