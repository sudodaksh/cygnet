import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

bot.command("start", (ctx) => ctx.reply("Hello from cygnet."));

bot.on("message:text", (ctx) => {
  return ctx.reply(`You said: ${ctx.text}`);
});

bot.catch((err) => {
  console.error("[hello-world]", err.error);
});

bot.start().catch(console.error);
