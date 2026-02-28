import {
  Bot,
  Context,
  Stage,
  WizardScene,
  session,
} from "./src/mod.ts";
import type {
  SceneSessionData,
  SessionFlavor,
  WizardContextFlavor,
} from "./src/mod.ts";

// --- Context type ---

interface MySession extends SceneSessionData {
  count: number;
}

type MyContext = Context & SessionFlavor<MySession> & WizardContextFlavor;

// --- Wizard scene: ask name and age ---

const registerWizard = new WizardScene<MyContext>(
  "register",
  // Step 0: ask for name
  async (ctx) => {
    await ctx.reply("What's your name?");
    ctx.wizard.next();
  },
  // Step 1: ask for age
  async (ctx) => {
    await ctx.reply(`Nice to meet you, ${ctx.text}! How old are you?`);
    ctx.wizard.next();
  },
  // Step 2: done
  async (ctx) => {
    await ctx.reply(`Got it! You are ${ctx.text} years old. Registration complete.`);
    await ctx.scene.leave();
  },
);

// --- Bot setup ---

const bot = new Bot<MyContext>({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

const stage = new Stage<MyContext>([registerWizard]);

bot.use(session<MySession, MyContext>({ initial: () => ({ count: 0 }) }));
bot.use(stage);

bot.command("start", (ctx) => ctx.reply("Welcome! Try /help"));
bot.command("help", (ctx) =>
  ctx.reply([
    "Commands:",
    "/start  - Welcome message",
    "/help   - This message",
    "/count  - Count your messages",
    "/register - Start registration wizard",
  ].join("\n"))
);

bot.command("count", (ctx) => {
  ctx.session.count++;
  return ctx.reply(`You have sent ${ctx.session.count} messages.`);
});

bot.command("register", Stage.enter("register"));

bot.on("message:text", (ctx) => {
  // ctx.text is narrowed to string here
  return ctx.reply(`Echo: ${ctx.text}`);
});

bot.on("message:reaction", (ctx) => {
  console.log(`Got reaction: ${ctx.reaction?.emoji}`);
});

bot.catch((err) => {
  console.error("Bot error:", err.error, "\nContext:", err.ctx.update);
});

bot.start().catch(console.error);
