import { Bot, FileStorage } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
  groupStateStorage: new FileStorage(".cygnet-group-state.example.json"),
});

bot.on("group_update", async (ctx) => {
  const details = await ctx.inspectGroupUpdate();
  console.log("[group_update]", details);

  if (!details) return;
  if (details.kind === "stale" || details.kind === "unknown") return;

  if (details.kind === "joined") {
    await ctx.reply(`Thanks for adding me to ${details.groupName ?? "the group"}.`);
    return;
  }

  if (details.kind === "renamed") {
    console.log(
      `[group_update] ${details.previousName ?? "(unknown)"} -> ${details.groupName ?? "(unknown)"}`,
    );
  }
});

bot.command("group-status", async (ctx) => {
  if (!ctx.isGroup) {
    await ctx.reply("Use this command inside a group chat.");
    return;
  }

  const details = await ctx.inspectGroupUpdate();
  await ctx.reply(`Latest group update classification: ${details?.kind ?? "none"}`);
});

bot.catch((err) => {
  console.error("[group-updates]", err.error);
});

bot.start().catch(console.error);
