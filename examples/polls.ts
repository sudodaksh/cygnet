import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

// Track active polls so we can display results
const activePolls = new Map<number, { question: string; options: string[]; votes: Map<string, number[]> }>();

// /poll Question | Option 1 | Option 2 | Option 3
bot.command("poll", async (ctx) => {
  const args = typeof ctx.match === "string" ? ctx.match : "";
  const parts = args.split("|").map((s) => s.trim()).filter(Boolean);

  if (parts.length < 3) {
    return ctx.reply("Usage: /poll Question | Option 1 | Option 2 | ...\nNeed at least 2 options.");
  }

  const [question, ...answers] = parts;
  const result = await ctx.createPoll(question!, answers);
  activePolls.set(result.timestamp, { question: question!, options: answers, votes: new Map() });
  console.log(`[polls] Created poll "${question}" (timestamp: ${result.timestamp})`);
});

// /singlepoll Question | Option 1 | Option 2 — single-choice poll
bot.command("singlepoll", async (ctx) => {
  const args = typeof ctx.match === "string" ? ctx.match : "";
  const parts = args.split("|").map((s) => s.trim()).filter(Boolean);

  if (parts.length < 3) {
    return ctx.reply("Usage: /singlepoll Question | Option 1 | Option 2 | ...");
  }

  const [question, ...answers] = parts;
  const result = await ctx.createPoll(question!, answers, { allowMultipleSelections: false });
  activePolls.set(result.timestamp, { question: question!, options: answers, votes: new Map() });
  console.log(`[polls] Created single-choice poll "${question}" (timestamp: ${result.timestamp})`);
});

// Handle incoming poll votes
bot.on("message:poll_vote", async (ctx) => {
  const vote = ctx.pollVote;
  const voter = ctx.fromName ?? ctx.sender;
  const pollTs = vote.targetSentTimestamp;
  const poll = activePolls.get(pollTs);

  if (poll) {
    // Track the vote
    poll.votes.set(ctx.sender, vote.optionIndexes);

    // Show what they picked (optionIndexes are 0-based)
    const picked = vote.optionIndexes
      .map((i) => poll.options[i] ?? `#${i + 1}`)
      .join(", ");
    console.log(`[polls] ${voter} voted for: ${picked} in "${poll.question}"`);

    // Send a tally update
    const tally = poll.options.map((opt, i) => {
      const count = [...poll.votes.values()].filter((idxs) => idxs.includes(i)).length;
      return `  ${opt}: ${count} vote${count === 1 ? "" : "s"}`;
    });
    await ctx.reply(`${voter} voted!\n\nCurrent tally for "${poll.question}":\n${tally.join("\n")}`);
  } else {
    console.log(`[polls] ${voter} voted in unknown poll (timestamp: ${pollTs})`);
  }
});

// Handle incoming poll creations from others
bot.on("message:poll_create", (ctx) => {
  const poll = ctx.pollCreate;
  const creator = ctx.fromName ?? ctx.sender;
  console.log(`[polls] ${creator} created a poll: "${poll.question}" with options: ${poll.options.join(", ")}`);

  // Track it so we can tally votes
  const ts = ctx.msgTimestamp;
  if (ts) {
    activePolls.set(ts, { question: poll.question, options: poll.options, votes: new Map() });
  }
});

// Handle poll closures
bot.on("message:poll_close", async (ctx) => {
  const close = ctx.pollTerminate;
  const who = ctx.fromName ?? ctx.sender;
  const poll = activePolls.get(close.targetSentTimestamp);

  if (poll) {
    // Show final results
    const tally = poll.options.map((opt, i) => {
      const count = [...poll.votes.values()].filter((idxs) => idxs.includes(i)).length;
      return `  ${opt}: ${count} vote${count === 1 ? "" : "s"}`;
    });
    await ctx.reply(`Poll "${poll.question}" was closed by ${who}.\n\nFinal results:\n${tally.join("\n")}`);
    activePolls.delete(close.targetSentTimestamp);
  } else {
    console.log(`[polls] ${who} closed unknown poll (timestamp: ${close.targetSentTimestamp})`);
  }
});

// /closepoll <timestamp> — close a poll the bot created
bot.command("closepoll", async (ctx) => {
  const ts = Number(typeof ctx.match === "string" ? ctx.match : "");
  if (!Number.isFinite(ts) || ts <= 0) {
    // If no timestamp given, close the most recent poll
    const latest = [...activePolls.keys()].pop();
    if (!latest) return ctx.reply("No active polls to close.");
    await ctx.closePoll(latest);
    return ctx.reply(`Closed the most recent poll (timestamp: ${latest}).`);
  }
  await ctx.closePoll(ts);
  await ctx.reply(`Poll closed (timestamp: ${ts}).`);
});

bot.command("help", (ctx) =>
  ctx.reply([
    "Poll commands:",
    "/poll Question | Opt1 | Opt2 | ... — Create a multi-choice poll",
    "/singlepoll Question | Opt1 | Opt2 | ... — Create a single-choice poll",
    "/closepoll [timestamp] — Close a poll (latest if no timestamp)",
  ].join("\n"))
);

bot.catch((err) => {
  console.error("[polls]", err.error);
});

bot.start().catch(console.error);
