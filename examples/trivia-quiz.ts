/**
 * Trivia Quiz Bot
 *
 * A fun interactive trivia game using WizardScene. Picks 5 random questions,
 * reacts ✅/❌ to each answer, tracks score across rounds, and remembers
 * your high score between games.
 *
 * Commands:
 *   /trivia   — start a new quiz
 *   /cancel   — quit mid-quiz
 *   /score    — see your stats
 *
 * Environment variables:
 *   SIGNAL_SERVICE   — signal-cli-rest-api URL (default: localhost:8080)
 *   PHONE_NUMBER     — bot's registered phone number
 *   TRIVIA_DEBUG     — set to "1" to log incoming update summaries
 *   TRIVIA_DEBUG_RAW — set to "1" to additionally log full raw update JSON
 *
 * Run:
 *   PHONE_NUMBER=+1234567890 bun run examples/trivia-quiz.ts
 */

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Question {
  q: string;
  options: [string, string, string, string];
  answer: number; // 0-based index into options
  fact: string;   // fun fact shown after answering
}

interface QuizSession extends SceneSessionData {
  highScore?: number;
  gamesPlayed?: number;
  totalCorrect?: number;
}

type QuizContext = Context & SessionFlavor<QuizSession> & WizardContextFlavor;

// ---------------------------------------------------------------------------
// Question bank (12 questions — 5 picked at random per game)
// ---------------------------------------------------------------------------

const QUESTIONS: Question[] = [
  {
    q: "How many hearts does an octopus have?",
    options: ["1", "2", "3", "4"],
    answer: 2,
    fact: "🐙 Two pump blood to the gills, one to the rest of the body!",
  },
  {
    q: "What is the national animal of Scotland?",
    options: ["Highland Cow", "Unicorn", "Red Deer", "Golden Eagle"],
    answer: 1,
    fact: "🦄 The unicorn has been a Scottish heraldic symbol since the 12th century!",
  },
  {
    q: "What does HTTP status code 418 mean?",
    options: ["Rate Limited", "I'm a Teapot", "Gone Fishing", "Ask Again Later"],
    answer: 1,
    fact: "🫖 Defined in RFC 2324 as an April Fools' joke — but many servers actually implement it!",
  },
  {
    q: "What colour is a giraffe's tongue?",
    options: ["Pink", "Red", "Purple / Blue-Black", "Orange"],
    answer: 2,
    fact: "🦒 The dark pigment protects against sunburn — they spend all day eating from treetops!",
  },
  {
    q: "What is the smallest country in the world by area?",
    options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"],
    answer: 1,
    fact: "🇻🇦 Vatican City is only 0.44 km² — about 1/8 the size of Central Park!",
  },
  {
    q: "How many keys are on a standard piano?",
    options: ["76", "84", "88", "92"],
    answer: 2,
    fact: "🎹 52 white keys and 36 black keys, spanning 7¼ octaves!",
  },
  {
    q: "Which planet has the shortest day?",
    options: ["Mercury", "Mars", "Jupiter", "Saturn"],
    answer: 2,
    fact: "⚡ Jupiter completes a full rotation in just 9 hours 56 minutes — the fastest in our solar system!",
  },
  {
    q: "What year was the Signal messaging app first released?",
    options: ["2012", "2014", "2016", "2018"],
    answer: 1,
    fact: "📱 Signal was created by Moxie Marlinspike and Brian Acton. The protocol also powers WhatsApp encryption!",
  },
  {
    q: "Which of these fruits is technically a berry?",
    options: ["Strawberry", "Raspberry", "Banana", "Cherry"],
    answer: 2,
    fact: "🍌 Botanically, bananas are berries — but strawberries and raspberries are NOT!",
  },
  {
    q: "Honey found in Egyptian tombs is still…",
    options: ["Toxic", "Edible", "Crystallised beyond use", "Fermented into mead"],
    answer: 1,
    fact: "🍯 3,000-year-old honey from pharaohs' tombs was perfectly preserved and still safe to eat!",
  },
  {
    q: "On which planet does it rain diamonds?",
    options: ["Venus", "Jupiter", "Neptune", "Mars"],
    answer: 2,
    fact: "💎 Extreme pressure on Neptune and Saturn compresses carbon into literal diamond rain!",
  },
  {
    q: "What was the first programming language?",
    options: ["COBOL", "Fortran", "Lisp", "Assembly"],
    answer: 1,
    fact: "💻 Fortran (FORmula TRANslation) was created by IBM in 1957 and is still used in scientific computing!",
  },
];

const LABELS = ["A", "B", "C", "D"] as const;
const NUM_QUESTIONS = 5;
const styled = { textMode: "styled" as const };

const TRIVIA_DEBUG = process.env.TRIVIA_DEBUG === "1";
const TRIVIA_DEBUG_RAW = process.env.TRIVIA_DEBUG_RAW === "1";

function debugUpdate(ctx: QuizContext, tag: string): void {
  if (!TRIVIA_DEBUG) return;

  const env = ctx.update.envelope;
  const dm = env.dataMessage;
  const compact = {
    tag,
    account: ctx.update.account,
    source: env.source,
    sourceNumber: env.sourceNumber,
    sourceUuid: env.sourceUuid,
    from: ctx.from,
    sender: ctx.sender,
    me: ctx.me,
    isGroup: ctx.isGroup,
    chat: ctx.chat,
    hasSync: !!env.syncMessage,
    hasData: !!dm,
    text: ctx.text,
    hasReaction: !!dm?.reaction,
    hasRemoteDelete: !!dm?.remoteDelete,
    hasPollVote: !!dm?.pollVote,
    hasPollClose: !!dm?.pollTerminate,
    groupUpdateType: dm?.groupInfo?.type,
    activeScene: ctx.session.__scenes?.current,
    wizardCursor: ctx.session.__scenes?.cursor,
  };

  console.log("[trivia-debug]", JSON.stringify(compact));
  if (TRIVIA_DEBUG_RAW) {
    console.log("[trivia-debug][raw]", JSON.stringify(ctx.update));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pickQuestions(): number[] {
  return shuffle(QUESTIONS.map((_, i) => i)).slice(0, NUM_QUESTIONS);
}

function formatQuestion(num: number, total: number, q: Question): string {
  return [
    `**Q${num}/${total}: ${q.q}**`,
    "",
    ...q.options.map((opt, i) => `  ${LABELS[i]})  ${opt}`),
  ].join("\n");
}

function parseAnswer(text: string): number | null {
  const t = text.trim().toUpperCase();
  const letterIdx = (LABELS as readonly string[]).indexOf(t);
  if (letterIdx !== -1) return letterIdx;

  // Strict numeric answers only ("1".."4"), no prefixes/suffixes.
  if (!/^[1-4]$/.test(t)) return null;
  return Number(t) - 1;
}

function scoreBar(score: number, total: number): string {
  return "█".repeat(score) + "░".repeat(total - score);
}

function scoreRating(score: number, total: number): string {
  const pct = score / total;
  if (pct === 1) return "🏆 PERFECT! You're a genius!";
  if (pct >= 0.8) return "🌟 Impressive! Almost flawless!";
  if (pct >= 0.6) return "👍 Solid! You know your stuff!";
  if (pct >= 0.4) return "🤔 Not bad — room to grow!";
  return "💪 Better luck next time!";
}

// ---------------------------------------------------------------------------
// Wizard scene
// ---------------------------------------------------------------------------

const triviaWizard = new WizardScene<QuizContext>(
  "trivia",

  // ── Step 0: Welcome + first question ──────────────────────────────────
  async (ctx) => {
    const questions = pickQuestions();
    ctx.wizard.state = { questions, current: 0, score: 0 };

    const q = QUESTIONS[questions[0]!]!;
    await ctx.reply(
      `🎯 **Signal Trivia Challenge!**\n\n` +
      `${NUM_QUESTIONS} questions — reply with **A**, **B**, **C**, or **D**.\n` +
      `Type /cancel to quit anytime.\n\n` +
      formatQuestion(1, NUM_QUESTIONS, q),
      styled,
    );
    await ctx.wizard.advance();
  },

  // ── Step 1: Answer loop (stays here until all questions done) ─────────
  async (ctx) => {
    const state = ctx.wizard.state;
    const questions = state.questions as number[];
    const current = state.current as number;
    const score = state.score as number;

    const qIdx = questions[current];
    if (qIdx === undefined) {
      await ctx.reply("Something went wrong — /trivia to start over.");
      await ctx.scene.leave();
      return;
    }
    const question = QUESTIONS[qIdx]!;

    // Parse answer
    const raw = ctx.text.trim();
    const choice = parseAnswer(raw);
    if (choice === null) {
      debugUpdate(ctx, `quiz:ignore-non-answer:${JSON.stringify(raw)}`);

      // Ignore non-answer text silently to avoid self-reply loops when
      // signal-cli forwards the bot's own outgoing messages back as updates.
      // Show a hint only for short single-line user-like inputs.
      if (raw && raw.length <= 12 && !raw.includes("\n")) {
        await ctx.reply("↩️ Reply with **A**, **B**, **C**, or **D**!", styled);
      }
      return; // stay on step 1 — same question again
    }

    debugUpdate(ctx, `quiz:accepted-answer:${LABELS[choice]}`);

    // Score it
    const correct = choice === question.answer;
    const newScore = correct ? score + 1 : score;
    const correctLabel = LABELS[question.answer];
    const correctText = `${correctLabel}) ${question.options[question.answer]}`;

    // React to their message
    try {
      await ctx.react(correct ? "✅" : "❌");
    } catch {
      // reactions may fail in some setups — that's fine
    }

    // Build feedback line
    const feedback = correct
      ? `✅ **Correct!**`
      : `❌ Nope — the answer was **${correctText}**`;

    const next = current + 1;

    if (next >= questions.length) {
      // ── Quiz complete ──
      const bar = scoreBar(newScore, questions.length);
      const rating = scoreRating(newScore, questions.length);

      await ctx.reply(
        `${feedback}\n${question.fact}\n\n` +
        `**Quiz Complete!**\n\n` +
        `Score: **${newScore}/${questions.length}**  ${bar}\n\n` +
        `${rating}\n\n` +
        `Send /trivia to play again!`,
        styled,
      );

      // Update session stats
      const prev = ctx.session.highScore ?? 0;
      if (newScore > prev) {
        ctx.session.highScore = newScore;
        if (prev > 0) {
          await ctx.reply(`🏆 **New high score!** ${prev} → ${newScore}`, styled);
        }
      }
      ctx.session.gamesPlayed = (ctx.session.gamesPlayed ?? 0) + 1;
      ctx.session.totalCorrect = (ctx.session.totalCorrect ?? 0) + newScore;

      await ctx.scene.leave();
      return;
    }

    // ── Next question ──
    const nextQ = QUESTIONS[questions[next]!]!;
    ctx.wizard.state = { ...state, current: next, score: newScore };

    await ctx.reply(
      `${feedback}\n${question.fact}\n\n` +
      formatQuestion(next + 1, questions.length, nextQ),
      styled,
    );
    // Don't advance — stay on step 1 for the next answer
  },
);

// ---------------------------------------------------------------------------
// Bot setup
// ---------------------------------------------------------------------------

const bot = new Bot<QuizContext>({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

const stage = new Stage<QuizContext>([triviaWizard]);

bot.use(
  session<QuizSession, QuizContext>({ initial: () => ({}) }),
);

// Debug logger (optional)
bot.use((ctx, next) => {
  debugUpdate(ctx, "incoming");
  return next();
});

// Global commands — registered before stage so they work mid-quiz
bot.command("cancel", async (ctx) => {
  if (ctx.session.__scenes?.current) {
    await stage.leave()(ctx, async () => {});
    await ctx.reply("Quiz cancelled. Send /trivia to play again!");
  } else {
    await ctx.reply("No active quiz. Send /trivia to start one!");
  }
});

bot.command("trivia", stage.enter("trivia"));

bot.command("score", (ctx) => {
  const games = ctx.session.gamesPlayed ?? 0;
  if (games === 0) {
    return ctx.reply("You haven't played yet! Send /trivia to start.");
  }
  const high = ctx.session.highScore ?? 0;
  const total = ctx.session.totalCorrect ?? 0;
  const bar = scoreBar(high, NUM_QUESTIONS);
  return ctx.reply(
    `📊 **Your Stats**\n\n` +
    `Games played: **${games}**\n` +
    `High score:   **${high}/${NUM_QUESTIONS}**  ${bar}\n` +
    `Total correct: **${total}**\n` +
    `Accuracy:     **${games > 0 ? Math.round((total / (games * NUM_QUESTIONS)) * 100) : 0}%**`,
    styled,
  );
});

bot.use(stage);

// Fallback for messages outside the quiz
bot.on("message:text", (ctx) =>
  ctx.reply(
    `🎯 **Trivia Quiz Bot**\n\n` +
    `/trivia — Start a quiz\n` +
    `/score  — See your stats\n` +
    `/cancel — Quit mid-quiz`,
    styled,
  ),
);

bot.catch((err) => {
  console.error("[trivia-quiz]", err.error);
});

bot.start().catch(console.error);
