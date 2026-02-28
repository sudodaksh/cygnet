import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

bot.on("message:attachments", async (ctx) => {
  const audioFiles = (ctx.message.attachments ?? []).filter((file) =>
    file.contentType.startsWith("audio/")
  );

  if (audioFiles.length === 0) return;

  const lines = audioFiles.map((file, index) => {
    const label = file.filename ?? `audio-${index + 1}`;
    const sizeKb = Math.max(1, Math.ceil(file.size / 1024));
    return `${label} (${file.contentType}, ${sizeKb} KB)`;
  });

  await ctx.reply([
    `Received ${audioFiles.length} audio file${audioFiles.length === 1 ? "" : "s"}:`,
    ...lines,
  ].join("\n"));
});

bot.command("audio-help", (ctx) =>
  ctx.reply("Send an audio attachment and I will list its metadata.")
);

bot.catch((err) => {
  console.error("[audio-files]", err.error);
});

bot.start().catch(console.error);
