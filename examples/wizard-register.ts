import {
  Bot,
  Context,
  Stage,
  WizardScene,
  session,
} from "../index.ts";
import type {
  SceneSessionData,
  SessionFlavor,
  WizardContextFlavor,
} from "../index.ts";

interface RegistrationSession extends SceneSessionData {
  profile?: {
    name: string;
    age: number;
  };
}

type RegistrationContext =
  & Context
  & SessionFlavor<RegistrationSession>
  & WizardContextFlavor;

const registerWizard = new WizardScene<RegistrationContext>(
  "register",
  async (ctx) => {
    ctx.wizard.state = {};
    await ctx.reply("What is your name?");
    await ctx.wizard.advance();
  },
  async (ctx) => {
    const name = ctx.text.trim();
    if (!name) {
      await ctx.reply("Please send a non-empty name.");
      return;
    }

    ctx.wizard.state = {
      ...ctx.wizard.state,
      name,
    };
    await ctx.reply("How old are you?");
    await ctx.wizard.advance();
  },
  async (ctx) => {
    const age = Number.parseInt(ctx.text.trim(), 10);
    if (!Number.isFinite(age)) {
      await ctx.reply("Please send your age as a number.");
      return;
    }

    const storedName = ctx.wizard.state.name;
    const name = typeof storedName === "string" && storedName
      ? storedName
      : "friend";

    ctx.session.profile = { name, age };
    await ctx.reply(`Saved your profile: ${name}, age ${age}.`);
    await ctx.scene.leave();
  },
);

const bot = new Bot<RegistrationContext>({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});
const stage = new Stage<RegistrationContext>([registerWizard]);

bot.use(session<RegistrationSession, RegistrationContext>({ initial: () => ({}) }));

bot.command("cancel", stage.leave());
bot.command("register", stage.enter("register"));
bot.command("profile", (ctx) => {
  const profile = ctx.session.profile;
  if (!profile) {
    return ctx.reply("No saved profile yet. Run /register.");
  }
  return ctx.reply(`Saved profile: ${profile.name}, age ${profile.age}.`);
});

bot.use(stage);

bot.catch((err) => {
  console.error("[wizard-register]", err.error);
});

bot.start().catch(console.error);
