/**
 * Webhook transport example.
 *
 * Instead of cygnet connecting to signal-cli-rest-api via WebSocket or
 * polling, signal-cli-rest-api pushes updates to this bot's HTTP server.
 *
 * Setup:
 * 1. Run signal-cli-rest-api in json-rpc mode with:
 *      RECEIVE_WEBHOOK_URL=http://<bot-host>:9080/webhook
 *    (adjust host/port to match where this bot runs)
 *
 * 2. Run this example:
 *      bun run examples/webhook.ts
 *
 * The bot starts an HTTP server on port 9080 (configurable) and processes
 * updates as they arrive via POST.
 */

import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
  transport: "webhook",
  webhook: {
    port: Number(process.env.WEBHOOK_PORT ?? 9080),
    host: process.env.WEBHOOK_HOST ?? "0.0.0.0",
    path: process.env.WEBHOOK_PATH ?? "/webhook",
  },
});

bot.command("start", (ctx) => ctx.reply("Hello! I'm running on webhook transport."));

bot.command("ping", (ctx) => ctx.reply("pong"));

bot.on("message:text", (ctx) => {
  return ctx.reply(`You said: ${ctx.text}`);
});

bot.catch((err) => {
  console.error("[webhook]", err.error);
});

bot.start().catch(console.error);
