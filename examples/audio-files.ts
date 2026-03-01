import { Bot, encodeAttachmentBuffer } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

// Handle any message with attachments
bot.on("message:attachments", async (ctx) => {
  // ctx.attachments is narrowed to Attachment[] here
  const audioFiles = ctx.attachments.filter((file) =>
    file.contentType.startsWith("audio/")
  );

  if (audioFiles.length === 0) {
    // Not audio — list what was received
    const lines = ctx.attachments.map((file) => {
      const label = file.filename ?? file.id;
      const sizeKb = Math.max(1, Math.ceil(file.size / 1024));
      return `${label} (${file.contentType}, ${sizeKb} KB)`;
    });
    await ctx.reply(`Received ${ctx.attachments.length} file(s):\n${lines.join("\n")}`);
    return;
  }

  // List audio metadata
  const lines = audioFiles.map((file, index) => {
    const label = file.filename ?? `audio-${index + 1}`;
    const sizeKb = Math.max(1, Math.ceil(file.size / 1024));
    return `${label} (${file.contentType}, ${sizeKb} KB)`;
  });
  await ctx.reply(
    `Received ${audioFiles.length} audio file${audioFiles.length === 1 ? "" : "s"}:\n${lines.join("\n")}`
  );

  // Download and echo back the first audio file
  const first = audioFiles[0];
  if (first) {
    const data = await ctx.downloadAttachment(first.id);
    const attachment = encodeAttachmentBuffer(
      data,
      first.contentType,
      first.filename ?? "audio",
    );
    await ctx.reply("Here it is back:", { base64Attachments: [attachment] });
  }
});

bot.command("audio-help", (ctx) =>
  ctx.reply("Send an audio attachment and I will list its metadata and echo it back.")
);

bot.catch((err) => {
  console.error("[audio-files]", err.error);
});

bot.start().catch(console.error);
