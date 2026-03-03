import { Bot } from "../index.ts";
import type { Context, SendOptions } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

const styled: SendOptions = { textMode: "styled" };

// Show all supported formatting
bot.command("styles", (ctx) =>
  ctx.reply([
    "Signal supports these styles:",
    "",
    "**bold text**",
    "*italic text*",
    "~strikethrough text~",
    "||spoiler text||",
    "`inline monospace`",
    "",
    "You can also \\*\\*escape\\*\\* formatting with backslashes.",
  ].join("\n"), styled)
);

// Demonstrate combining styles
bot.command("fancy", (ctx) => {
  const text = typeof ctx.match === "string" ? ctx.match : "";
  if (!text) {
    return ctx.reply("Usage: /fancy <text>\n\nI'll show it in every style.", styled);
  }
  return ctx.reply([
    `**${text}** (bold)`,
    `*${text}* (italic)`,
    `~${text}~ (strikethrough)`,
    `||${text}|| (spoiler)`,
    `\`${text}\` (monospace)`,
  ].join("\n"), styled);
});

// Individual style commands
bot.command("bold", (ctx) => {
  const text = typeof ctx.match === "string" ? ctx.match : "";
  if (!text) return ctx.reply("Usage: /bold <text>");
  return ctx.reply(`**${text}**`, styled);
});

bot.command("italic", (ctx) => {
  const text = typeof ctx.match === "string" ? ctx.match : "";
  if (!text) return ctx.reply("Usage: /italic <text>");
  return ctx.reply(`*${text}*`, styled);
});

bot.command("spoiler", (ctx) => {
  const text = typeof ctx.match === "string" ? ctx.match : "";
  if (!text) return ctx.reply("Usage: /spoiler <text>");
  return ctx.reply(`||${text}||`, styled);
});

bot.command("code", (ctx) => {
  const text = typeof ctx.match === "string" ? ctx.match : "";
  if (!text) return ctx.reply("Usage: /code <text>");
  return ctx.reply(`\`${text}\``, styled);
});

bot.command("help", (ctx) =>
  ctx.reply([
    "Styled text commands:",
    "/styles - Show all supported formatting",
    "/fancy <text> - Show text in every style",
    "/bold <text> - Bold text",
    "/italic <text> - Italic text",
    "/spoiler <text> - Spoiler text",
    "/code <text> - Monospace text",
  ].join("\n"))
);

bot.catch((err) => {
  console.error("[styled-text]", err.error);
});

bot.start().catch(console.error);
