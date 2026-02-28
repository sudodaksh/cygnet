# cygnet

A TypeScript framework for building [Signal](https://signal.org) bots. API modeled after [grammY](https://grammy.dev) — the same Composer-based middleware, type-safe filter queries, and context flavoring pattern, but talking to Signal instead of Telegram.

Requires [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) as a sidecar.

## Starting the service automatically

signal can start [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) for you before the bot launches. Two modes are supported: **Docker** (default) and a **local binary**.

### Docker (recommended)

```typescript
import { Bot, startSignalService } from "./src/mod.ts";

const svc = await startSignalService({
  configDir: "~/.local/share/signal-cli",  // host path with your Signal credentials
});

const bot = new Bot({
  signalService: svc.url,                  // "http://localhost:8080"
  phoneNumber: "+491234567890",
});

// Clean up on exit
process.once("SIGTERM", () => { bot.stop(); svc.stop(); });
process.once("SIGINT",  () => { bot.stop(); svc.stop(); });

bot.command("start", (ctx) => ctx.reply("Hello!"));
await bot.start();
```

`startSignalService()` will:
1. Check if the container already exists (reuses it if stopped, skips creation if running)
2. Otherwise run `docker run -d -p 8080:8080 -v configDir:/home/.local/share/signal-cli bbernhard/signal-cli-rest-api`
3. Poll `GET /v1/health` until the service is ready (default timeout: 30 s)
4. Resolve with a `ServiceHandle` containing `url` and `stop()`

### Local binary

```typescript
const svc = await startSignalService({
  mode: "binary",
  binaryPath: "./bin/signal-cli-rest-api",
  configDir: "~/.local/share/signal-cli",
});
```

### All options

```typescript
const svc = await startSignalService({
  // Required
  configDir: "~/.local/share/signal-cli",

  // Optional
  mode: "docker",                        // "docker" (default) | "binary"
  port: 8080,                            // default: 8080
  signalMode: "native",                  // "native" (default) | "normal" | "json-rpc"

  // Docker-specific
  image: "bbernhard/signal-cli-rest-api",  // default image
  containerName: "signal-service",       // default container name
  removeOnStop: true,                      // remove container on stop() (default: true)
                                           // set false to keep it for faster restarts

  // Binary-specific
  binaryPath: "./bin/signal-cli-rest-api", // required for mode: "binary"
  attachmentTmpDir: "/tmp",
  avatarTmpDir: "/tmp",

  // Health check
  startupTimeout: 30_000,     // ms to wait for /v1/health (default: 30s)
  healthCheckInterval: 500,   // ms between health poll attempts (default: 500ms)
});

console.log(svc.url); // "http://localhost:8080"
await svc.stop();     // stops + removes the container (or kills the process)
```

> **Note:** Your Signal account must already be registered and linked before starting the service. The `configDir` must contain valid signal-cli credentials. See the [signal-cli-rest-api docs](https://github.com/bbernhard/signal-cli-rest-api) for registration steps.

---

## Prerequisites

- [Bun](https://bun.sh) (or Node.js with ESM)
- A running [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) instance with your Signal number registered

## Quick start

```typescript
import { Bot } from "./src/mod.ts";

const bot = new Bot({
  signalService: "localhost:8080",
  phoneNumber: "+491234567890",
});

bot.command("start", (ctx) => ctx.reply("Hello!"));
bot.on("message:text", (ctx) => ctx.reply(`You said: ${ctx.text}`));

bot.start();
```

```bash
bun run index.ts
```

---

## Table of contents

- [Bot setup](#bot-setup)
- [Handling updates](#handling-updates)
  - [Commands](#commands)
  - [Text matching](#text-matching)
  - [Filter queries](#filter-queries)
  - [Arbitrary filters](#arbitrary-filters)
- [Context](#context)
  - [Sending messages](#sending-messages)
  - [Reactions](#reactions)
  - [Other actions](#other-actions)
- [Middleware](#middleware)
- [Session](#session)
- [Scenes](#scenes)
  - [BaseScene](#basescene)
  - [WizardScene](#wizardscene)
- [Error handling](#error-handling)
- [Context flavoring](#context-flavoring)
- [API reference](#api-reference)

---

## Bot setup

```typescript
import { Bot } from "./src/mod.ts";

const bot = new Bot({
  signalService: "localhost:8080", // signal-cli-rest-api URL (scheme optional)
  phoneNumber: "+491234567890",    // the bot's registered number
});

bot.start(); // connects via WebSocket, auto-reconnects on disconnect
bot.stop();  // graceful shutdown
```

`bot.start()` calls `GET /v1/health` on startup and then opens a WebSocket to `ws://{signalService}/v1/receive/{phoneNumber}`. Updates are processed sequentially.

---

## Handling updates

### Commands

Matches `/command` (and `/command@anything`) at the start of a message:

```typescript
bot.command("start", (ctx) => ctx.reply("Welcome!"));
bot.command("help",  (ctx) => ctx.reply("Help text here."));
bot.command(["yes", "no"], (ctx) => ctx.reply("Got a yes/no"));
```

### Text matching

```typescript
// Exact string
bot.hears("ping", (ctx) => ctx.reply("pong"));

// Regular expression — ctx.match holds the RegExpExecArray
bot.hears(/order (\d+)/i, (ctx) => {
  const orderId = ctx.match![1];
  ctx.reply(`Looking up order ${orderId}…`);
});

// Array of strings and/or regexes
bot.hears(["hi", "hello", /hey+/i], (ctx) => ctx.reply("Hey there!"));
```

### Filter queries

Filter queries are type-safe strings that narrow the context type at compile time. After `.on("message:text")`, TypeScript knows `ctx.text` is `string` (not `string | undefined`).

| Query | Matches |
|---|---|
| `"message"` | Any regular message (not a reaction) |
| `"message:text"` | Message with non-empty text |
| `"message:attachments"` | Message with one or more attachments |
| `"message:quote"` | Message that quotes another |
| `"message:reaction"` | A reaction to a message |
| `"message:group"` | Message sent in a group |
| `"message:private"` | Message sent in a 1-on-1 DM |
| `"message:sticker"` | Message with a sticker |
| `"edit_message"` | An edited message |
| `"delete_message"` | A deleted message |
| `"receipt"` | Read or delivery receipt |
| `"typing"` | Typing indicator |
| `"call"` | Incoming call |
| `"sync_message"` | Sync from a linked device |

```typescript
bot.on("message:text", (ctx) => {
  ctx.text; // string — guaranteed by the filter
});

bot.on("message:reaction", (ctx) => {
  ctx.reaction?.emoji; // the emoji that was reacted with
});

bot.on("message:group", (ctx) => {
  ctx.update.envelope.dataMessage?.groupInfo?.groupId;
});

// Multiple filters — matches any of them
bot.on(["message:text", "edit_message"], (ctx) => { /* ... */ });
```

### Arbitrary filters

```typescript
// Predicate function
bot.filter(
  (ctx) => ctx.from === "+491234567890",
  (ctx) => ctx.reply("Hello, boss!"),
);

// Type guard — narrows the context type
bot.filter(
  (ctx): ctx is typeof ctx & { text: string } => ctx.text !== undefined,
  (ctx) => { /* ctx.text is string here */ },
);

// Drop updates that match (don't process further)
bot.drop((ctx) => ctx.isGroup); // ignore all group messages
```

---

## Context

Every handler receives a `Context` object. It wraps the raw update and provides shortcuts for the most common operations.

### Update getters

```typescript
ctx.update          // RawUpdate — the full raw envelope from signal-cli-rest-api
ctx.me              // string   — bot's own phone number

ctx.dataMessage     // DataMessage | undefined — any data message (incl. reactions)
ctx.message         // DataMessage | undefined — data message that is NOT a reaction
ctx.reaction        // Reaction   | undefined — the reaction, if this is a reaction update
ctx.editMessage     // EditMessage   | undefined
ctx.deleteMessage   // DeleteMessage | undefined
ctx.receipt         // ReceiptMessage | undefined
ctx.typingMessage   // TypingMessage  | undefined
ctx.callMessage     // CallMessage    | undefined
ctx.syncMessage     // SyncMessage    | undefined

ctx.from            // string | undefined — sender phone number
ctx.fromName        // string | undefined — sender display name
ctx.fromUuid        // string | undefined — sender UUID
ctx.chat            // string — group ID (for groups) or sender phone (for DMs)
ctx.isGroup         // boolean
ctx.text            // string | undefined — message text or edited text
ctx.msgTimestamp    // number | undefined — Unix ms
ctx.match           // RegExpExecArray | null | undefined — set by bot.hears(RegExp)
```

### Sending messages

```typescript
// Send to the same chat (group or DM) the update came from
await ctx.reply("Hello!");

// With options
await ctx.reply("Hello!", {
  base64Attachments: ["..."],
  mentions: [{ number: "+49...", start: 0, length: 5 }],
  textMode: "styled",
  viewOnce: true,
});

// Quote the current message
await ctx.quote("Good point!");

// Edit a previously sent message
await ctx.api.editMessage(ctx.chat, previousTimestamp, "corrected text");
```

### Reactions

```typescript
// React to the current message
await ctx.react("👍");

// Remove a reaction
await ctx.unreact("👍");
```

### Other actions

```typescript
// Typing indicator
await ctx.typing();        // "started typing"
await ctx.typing(true);    // "stopped typing"

// Delete the current message
await ctx.deleteMsg();

// Delete a specific message by timestamp
await ctx.deleteMsg(timestamp);
```

### Direct API access

For anything not covered by context shortcuts:

```typescript
await ctx.api.send(recipient, text, options);
await ctx.api.react(recipient, { reaction: "❤️", targetAuthor: "+49...", targetTimestamp: ts });
await ctx.api.getGroups();
await ctx.api.checkHealth();
```

---

## Middleware

cygnet uses Koa-style `(ctx, next)` middleware, identical to grammY.

```typescript
// Runs for every update
bot.use(async (ctx, next) => {
  console.log("Update from:", ctx.from);
  await next(); // pass to the next handler
});

// Branching
bot.branch(
  (ctx) => ctx.isGroup,
  (ctx) => ctx.reply("Hi group!"),
  (ctx) => ctx.reply("Hi DM!"),
);

// Background — runs concurrently, does not block the chain
bot.fork(async (ctx) => {
  await logToDatabase(ctx.update);
});

// Lazy — select middleware at runtime
bot.lazy((ctx) => {
  return ctx.isGroup ? groupMiddleware : dmMiddleware;
});

// Isolated error handling
bot.errorBoundary(
  (err, ctx) => console.error("caught:", err),
  riskyMiddleware,
);
```

`Composer` instances can be used as sub-routers:

```typescript
import { Composer } from "./src/mod.ts";

const admin = new Composer<MyContext>();
admin.command("ban", (ctx) => { /* ... */ });
admin.command("kick", (ctx) => { /* ... */ });

bot.filter((ctx) => admins.includes(ctx.from!), admin);
```

---

## Session

Store per-chat data across messages. Requires a `SessionFlavor` on your context type.

```typescript
import { Bot, Context, session, MemoryStorage } from "./src/mod.ts";
import type { SessionFlavor } from "./src/mod.ts";

interface MySession {
  count: number;
  lastSeen?: number;
}

type MyContext = Context & SessionFlavor<MySession>;

const bot = new Bot<MyContext>({ signalService: "...", phoneNumber: "..." });

bot.use(session<MySession, MyContext>({
  initial: () => ({ count: 0 }),  // called when no session exists yet
}));

bot.on("message:text", (ctx) => {
  ctx.session.count++;                          // read/write
  ctx.reply(`Message #${ctx.session.count}`);
});
```

### Custom storage

Implement `StorageAdapter<T>` to plug in any backend:

```typescript
import type { StorageAdapter } from "./src/mod.ts";

class RedisStorage<T> implements StorageAdapter<T> {
  async read(key: string): Promise<T | undefined> { /* ... */ }
  async write(key: string, value: T): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
}

bot.use(session({ storage: new RedisStorage(), initial: () => ({ count: 0 }) }));
```

The built-in `MemoryStorage` keeps data in-process and loses it on restart. Use a persistent adapter for production.

### Session key

By default the key is `ctx.chat` (group ID or phone number). Override it:

```typescript
bot.use(session({
  getSessionKey: (ctx) => ctx.fromUuid, // per-user instead of per-chat
  initial: () => ({}),
}));
```

---

## Scenes

Scenes let you build stateful multi-step conversations. They require `session` middleware.

```typescript
import { Bot, Context, Stage, BaseScene, session } from "./src/mod.ts";
import type { SessionFlavor, SceneContextFlavor, SceneSessionData } from "./src/mod.ts";

interface MySession extends SceneSessionData { /* your fields */ }
type MyContext = Context & SessionFlavor<MySession> & SceneContextFlavor;

const greetScene = new BaseScene<MyContext>("greet");

greetScene.enter((ctx) => ctx.reply("You entered the greet scene!"));
greetScene.on("message:text", async (ctx) => {
  await ctx.reply(`Hello, ${ctx.text}!`);
  await ctx.scene.leave(); // exit the scene
});
greetScene.leave((ctx) => ctx.reply("Bye!"));

const stage = new Stage<MyContext>([greetScene]);

const bot = new Bot<MyContext>({ signalService: "...", phoneNumber: "..." });
bot.use(session<MySession, MyContext>({ initial: () => ({}) }));
bot.use(stage);

bot.command("greet", Stage.enter("greet"));    // enter scene
bot.command("cancel", Stage.leave());          // leave scene
bot.command("restart", Stage.reenter());       // re-enter (reset state)
```

While inside a scene, only that scene's handlers run. Updates do not reach bot-level handlers.

### Scene state

```typescript
greetScene.enter((ctx) => {
  ctx.scene.state.attempts = 0;
});

greetScene.on("message:text", async (ctx) => {
  ctx.scene.state.attempts = (ctx.scene.state.attempts as number ?? 0) + 1;
});
```

State is persisted in the session automatically.

### WizardScene

A `WizardScene` is a scene that executes a sequence of steps one at a time. Each step handles exactly one update, then waits.

```typescript
import { WizardScene } from "./src/mod.ts";
import type { WizardContext, WizardContextFlavor, SceneSessionData } from "./src/mod.ts";

interface MySession extends SceneSessionData {}
type MyContext = Context & SessionFlavor<MySession> & WizardContextFlavor;

const registerWizard = new WizardScene<MyContext>(
  "register",

  // Step 0
  async (ctx) => {
    await ctx.reply("What's your name?");
    await ctx.wizard.next(); // advance to step 1
  },

  // Step 1
  async (ctx) => {
    await ctx.reply(`Nice to meet you, ${ctx.text}! How old are you?`);
    await ctx.wizard.next();
  },

  // Step 2
  async (ctx) => {
    await ctx.reply(`Got it! Registration complete.`);
    await ctx.scene.leave();
  },
);
```

Wizard controller:

```typescript
ctx.wizard.next()              // advance one step
ctx.wizard.back()              // go back one step
ctx.wizard.selectStep(n)       // jump to step n (0-based)
ctx.wizard.cursor              // current step index
ctx.wizard.state               // per-wizard state object (persisted)
```

---

## Error handling

```typescript
bot.catch((err) => {
  console.error("Unhandled error:", err.error);
  console.error("Update that caused it:", err.ctx.update);
});
```

`BotError` wraps the original error with the context that was being processed when it was thrown. The default handler logs and rethrows.

For localised error handling, use `errorBoundary`:

```typescript
bot.errorBoundary(
  (err, ctx) => ctx.reply("Something went wrong, sorry!"),
  dangerousHandler,
);
```

---

## Context flavoring

Plugins extend the context type using TypeScript intersection types — no subclassing required.

```typescript
// Define your flavor
interface TimingFlavor {
  startedAt: number;
}

// Intersect with Context
type MyContext = Context & TimingFlavor & SessionFlavor<MySession>;

// Build the bot with your context type
const bot = new Bot<MyContext>({ signalService: "...", phoneNumber: "..." });

// Add middleware that sets the flavor property
bot.use((ctx, next) => {
  ctx.startedAt = Date.now();
  return next();
});

// ctx.startedAt is now typed as number everywhere
bot.on("message:text", (ctx) => {
  console.log("Handled in", Date.now() - ctx.startedAt, "ms");
});
```

Plugins like `session`, `Stage`, and `WizardScene` all use this pattern via their `*Flavor` types.

---

## API reference

### `Bot<C>`

| Member | Description |
|---|---|
| `new Bot(config)` | `config.signalService`, `config.phoneNumber`, optional `config.ContextConstructor` |
| `bot.start()` | Start WebSocket polling. Resolves only after `bot.stop()` is called. |
| `bot.stop()` | Gracefully stop the bot. |
| `bot.handleUpdate(update)` | Process a single `RawUpdate` manually (useful for custom transports). |
| `bot.catch(handler)` | Override the top-level error handler. |
| `bot.api` | The `SignalAPI` instance. |

### `Composer<C>` methods

| Method | Description |
|---|---|
| `use(...mw)` | Register middleware for all updates |
| `on(filter, ...mw)` | Filter by `FilterQuery` string(s), type-narrows context |
| `hears(trigger, ...mw)` | Match text by string or RegExp |
| `command(cmd, ...mw)` | Match `/command` |
| `filter(pred, ...mw)` | Arbitrary predicate filter |
| `drop(pred)` | Stop chain if predicate matches |
| `branch(pred, t, f)` | if/else routing |
| `fork(...mw)` | Run middleware in background |
| `lazy(factory)` | Select middleware at runtime |
| `errorBoundary(handler, ...mw)` | Isolated error scope |

### `SignalAPI`

| Method | Description |
|---|---|
| `send(to, text, options?)` | Send a message |
| `react(to, payload)` | Send or remove a reaction |
| `typing(to, stop?)` | Send typing indicator |
| `editMessage(to, timestamp, text)` | Edit a sent message |
| `deleteMessage(to, timestamp)` | Delete a sent message |
| `getGroups()` | List groups the bot is in |
| `checkHealth()` | Returns `true` if signal-cli-rest-api is reachable |

### Filter queries

See the [filter queries table](#filter-queries) above.
