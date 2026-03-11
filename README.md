
<div align="center"><img src="./images/header.png"></div>
<div align="center">

# a modern framework for building [signal](https://signal.org) bots

![NPM Version](https://img.shields.io/npm/v/cygnet)
![NPM Downloads](https://img.shields.io/npm/dm/cygnet)
![NPM License](https://img.shields.io/npm/l/cygnet)

</div>

## Install

```bash
npm install cygnet
```

## Prerequisites

- [Bun](https://bun.sh) (or Node.js with ESM)
- A running [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) instance with your Signal number registered ([setup guide](#setting-up-signal-cli-rest-api))

## Quick start

```typescript
import { Bot } from "cygnet";

const bot = new Bot({
  signalService: "localhost:8080",
  phoneNumber: "+491234567890",
});

bot.command("start", (ctx) => ctx.reply("Hello!"));
bot.on("message:text", (ctx) => ctx.reply(`You said: ${ctx.text}`));

bot.start();
```

```bash
bun run examples/hello-world.ts
```

---

## Examples

Runnable examples live in [examples/README.md](./examples/README.md):

- [hello-world](./examples/hello-world.ts): minimal bot setup and basic text replies
- [commands](./examples/commands.ts): command parsing and `ctx.match`
- [reactions](./examples/reactions.ts): react to messages, handle incoming reactions
- [quotes-and-replies](./examples/quotes-and-replies.ts): quote messages, handle incoming quotes
- [typing-and-receipts](./examples/typing-and-receipts.ts): typing indicators, delivery/read receipts
- [edit-and-delete](./examples/edit-and-delete.ts): edit and delete sent messages, handle edits/deletes
- [group-updates](./examples/group-updates.ts): best-effort `group_update` handling with persisted state
- [audio-files](./examples/audio-files.ts): handling incoming audio attachments
- [wizard-register](./examples/wizard-register.ts): a session-backed multi-step registration flow
- [styled-text](./examples/styled-text.ts): bold, italic, strikethrough, spoiler, and monospace formatting
- [polls](./examples/polls.ts): create, vote, close, and track Signal polls
- [webhook](./examples/webhook.ts): receive updates via HTTP webhook instead of WebSocket
- [contacts](./examples/contacts.ts): list, look up, and update Signal contacts

---

## Table of contents

- [Examples](#examples)
- [Bot setup](#bot-setup)
- [Handling updates](#handling-updates)
  - [Commands](#commands)
  - [Text matching](#text-matching)
  - [Filter queries](#filter-queries)
  - [Arbitrary filters](#arbitrary-filters)
- [Context](#context)
  - [Sending messages](#sending-messages)
  - [Link previews](#link-previews)
  - [Styled text](#styled-text)
  - [Reactions](#reactions)
  - [Polls](#polls)
  - [Contacts](#contacts)
  - [Other actions](#other-actions)
- [Middleware](#middleware)
- [Session](#session)
- [Scenes](#scenes)
  - [Scene state](#scene-state)
  - [WizardScene](#wizardscene)
- [Error handling](#error-handling)
- [Logging](#logging)
- [Context flavoring](#context-flavoring)
- [Webhook transport](#webhook-transport)
- [API reference](#api-reference)
- [Setting up signal-cli-rest-api](#setting-up-signal-cli-rest-api)
- [Releasing](#releasing)

---

## Bot setup

```typescript
import { Bot, FileStorage } from "cygnet";

const bot = new Bot({
  signalService: "localhost:8080", // signal-cli-rest-api URL (scheme optional)
  phoneNumber: "+491234567890",    // the bot's registered number
  includeOwnMessages: false,        // optional, default false
  groupStateStorage: new FileStorage(".cygnet-group-state.json"), // optional
  logLevel: "info",     // optional: "debug" | "info" | "warn" | "error" | "silent"
  transport: "websocket", // optional: "websocket" (default) | "polling" | "webhook"
});

bot.start(); // connects via WebSocket, auto-reconnects on disconnect
bot.stop();  // graceful shutdown
```

`bot.start()` calls `GET /v1/health` on startup and then opens a WebSocket to `ws://{signalService}/v1/receive/{phoneNumber}`. Updates are processed sequentially.

By default, cygnet does **not** pass the bot's own outgoing/sync updates through middleware. This aligns with grammY / Telegram-style bot behavior and avoids self-reply loops. Set `includeOwnMessages: true` if you explicitly want those updates.

See [Webhook transport](#webhook-transport) for the `"webhook"` option.

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
| `"message:poll_create"` | A new poll |
| `"message:poll_vote"` | A vote on a poll |
| `"message:poll_close"` | A closed/terminated poll |
| `"group_update"` | Group metadata or membership change |
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
ctx.message         // DataMessage | undefined — regular message (not reaction, not group_update)
ctx.groupUpdate     // DataMessage | undefined — group metadata/membership update
ctx.reaction        // Reaction   | undefined — the reaction, if this is a reaction update
ctx.editMessage     // EditMessage   | undefined
ctx.deleteMessage   // DeleteMessage | undefined
ctx.receipt         // ReceiptMessage | undefined
ctx.typingMessage   // TypingMessage  | undefined
ctx.callMessage     // CallMessage    | undefined
ctx.syncMessage     // SyncMessage    | undefined
ctx.pollCreate      // PollCreate     | undefined — poll creation details
ctx.pollVote        // PollVote       | undefined — poll vote details
ctx.pollTerminate   // PollTerminate  | undefined — poll closed/terminated

ctx.from            // string | undefined — sender phone number
ctx.fromName        // string | undefined — sender display name
ctx.fromUuid        // string | undefined — sender UUID
ctx.chat            // string — group ID (for groups) or sender phone (for DMs)
ctx.isGroup         // boolean
ctx.text            // string — message text or edited text ("" if none)
ctx.msgTimestamp    // number | undefined — Unix ms
ctx.match           // string | RegExpExecArray | undefined — set by bot.hears()/bot.command()
```

### Group state changes

`signal-cli-rest-api` collapses group membership and metadata changes into the
same `group_update` payload shape (`groupInfo.type === "UPDATE"`). Treat it as
an eventually consistent state signal, not a perfect event log.

cygnet keeps a per-bot group state cache (name, membership, last revision) and
`ctx.inspectGroupUpdate()` uses that cache to classify updates as best-effort
`joined`, `left`, `renamed`, `updated`, `stale`, or `unknown`.

```typescript
bot.on("group_update", async (ctx) => {
  const details = await ctx.inspectGroupUpdate();
  console.log(details);
});
```

Notes:
- `groupInfo.revision` is treated as the ordering key. Older or duplicate
  revisions are returned as `stale`.
- If a revision jump is detected, cygnet logs a gap warning and reconciles
  against `getGroups()`.
- `groupStateStorage` accepts a stricter direct-storage type. Built-in
  `MemoryStorage` and `FileStorage` work, but wrappers like `enhanceStorage()`
  intentionally do not.
- This keeps group state on the same adapter family as sessions, while
  preventing TTL wrappers from being used for revision tracking.
- Even with the cache, missed upstream events mean cygnet can recover current
  state, but not reconstruct the exact history of what happened while offline.

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

### Link previews

Attach a rich URL preview to a message. The `url` must start with `https://` and must appear in the message text.

```typescript
await ctx.reply("Check out https://signal.org", {
  linkPreview: {
    url: "https://signal.org",
    title: "Signal",
    description: "Speak freely.",
    base64Thumbnail: "...", // optional
  },
});
```

### Styled text

Use `textMode: "styled"` to enable Signal's Markdown-like formatting:

```typescript
await ctx.reply("**bold**, *italic*, ~strikethrough~, ||spoiler||, `monospace`", {
  textMode: "styled",
});
```

| Syntax | Renders as |
|---|---|
| `**text**` | **bold** |
| `*text*` | *italic* |
| `~text~` | ~~strikethrough~~ |
| `\|\|text\|\|` | spoiler |
| `` `text` `` | `monospace` |

See [`examples/styled-text.ts`](./examples/styled-text.ts) for more.

### Reactions

```typescript
// React to the current message
await ctx.react("👍");

// Remove a reaction
await ctx.unreact("👍");
```

### Polls

Create, vote in, and close Signal polls:

```typescript
// Create a poll
const result = await ctx.createPoll("What's for lunch?", ["Pizza", "Sushi", "Tacos"], {
  allowMultipleSelections: true,
});
// result.timestamp — identifies this poll for voting/closing

// Vote in a poll (answer indices are 1-based)
await ctx.voteInPoll({
  pollAuthor: "+491234567890",
  pollTimestamp: result.timestamp,
  selectedAnswers: [1, 3], // Pizza and Tacos
});

// Close a poll
await ctx.closePoll(result.timestamp);
```

Handle incoming poll events:

```typescript
bot.on("message:poll_create", (ctx) => {
  const poll = ctx.pollCreate; // PollCreate — guaranteed
  console.log(poll.question, poll.options, poll.allowMultiple);
});

bot.on("message:poll_vote", (ctx) => {
  const vote = ctx.pollVote; // PollVote — guaranteed
  console.log(vote.optionIndexes, vote.voteCount); // 0-based indices
});

bot.on("message:poll_close", (ctx) => {
  console.log("Poll closed:", ctx.pollTerminate.targetSentTimestamp);
});
```

> **Note:** Incoming `pollVote.optionIndexes` are **0-based** (from signal-cli), but outgoing `selectedAnswers` are **1-based** (the REST API subtracts 1 internally).

See [`examples/polls.ts`](./examples/polls.ts) for a full working example with live vote tallying.

### Contacts

List, look up, and update Signal contacts:

```typescript
// List all contacts
const contacts = await ctx.api.listContacts();

// Include non-contact recipients (anyone you've messaged)
const everyone = await ctx.api.listContacts(true);

// Look up a single contact by UUID
const contact = await ctx.api.getContact("uuid-here");
console.log(contact.profileName, contact.profile.about);

// Update a contact
await ctx.api.updateContact({
  recipient: "+491234567890",
  name: "Alice",
  expirationInSeconds: 3600,
});

// Get a contact's avatar (binary)
const avatar = await ctx.api.getContactAvatar("uuid-here");
```

See [`examples/contacts.ts`](./examples/contacts.ts) for more.

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

cygnet uses Koa-style `(ctx, next)` middleware.

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
import { Composer } from "cygnet";

const admin = new Composer<MyContext>();
admin.command("ban", (ctx) => { /* ... */ });
admin.command("kick", (ctx) => { /* ... */ });

bot.filter((ctx) => admins.includes(ctx.from!), admin);
```

---

## Session

Store per-chat data across messages. Requires a `SessionFlavor` on your context type.

```typescript
import { Bot, Context, session, MemoryStorage } from "cygnet";
import type { SessionFlavor } from "cygnet";

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
import type { StorageAdapter } from "cygnet";

class RedisStorage<T> implements StorageAdapter<T> {
  async read(key: string): Promise<T | undefined> { /* ... */ }
  async write(key: string, value: T): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
}

bot.use(session({ storage: new RedisStorage(), initial: () => ({ count: 0 }) }));
```

The built-in `MemoryStorage` keeps data in-process and loses it on restart. Use a persistent adapter for production. `FileStorage` is a simple built-in JSON file adapter:

```typescript
import { FileStorage } from "cygnet";

bot.use(session({
  storage: new FileStorage(".cygnet-session.json"),
  initial: () => ({ count: 0 }),
}));
```

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
import { Bot, Context, Stage, BaseScene, session } from "cygnet";
import type { SessionFlavor, SceneContextFlavor, SceneSessionData } from "cygnet";

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

bot.command("greet", stage.enter("greet"));    // enter scene
bot.command("cancel", stage.leave());          // leave scene
bot.command("restart", stage.reenter());       // re-enter (reset state)

bot.use(stage);
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

A `WizardScene` is a scene that executes a sequence of steps one at a time. Step 0 runs immediately when the scene is entered, and each later step handles exactly one incoming update.

```typescript
import { WizardScene } from "cygnet";
import type { WizardContext, WizardContextFlavor, SceneSessionData } from "cygnet";

interface MySession extends SceneSessionData {}
type MyContext = Context & SessionFlavor<MySession> & WizardContextFlavor;

const registerWizard = new WizardScene<MyContext>(
  "register",

  // Step 0
  async (ctx) => {
    await ctx.reply("What's your name?");
    await ctx.wizard.advance(); // advance to step 1
  },

  // Step 1
  async (ctx) => {
    await ctx.reply(`Nice to meet you, ${ctx.text}! How old are you?`);
    await ctx.wizard.advance();
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
ctx.wizard.advance()           // advance one step
ctx.wizard.retreat()           // go back one step
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

`BotError` wraps the original error with the context that was being processed when it was thrown.
By default, cygnet logs unhandled runtime errors and continues running.

Startup and config errors throw `CygnetError` with clean, actionable messages and no noisy stack traces:

```
CygnetError: signalService is required — provide the URL of your signal-cli-rest-api instance (e.g. "localhost:8080")
```

```typescript
import { CygnetError } from "cygnet";

bot.start().catch((err) => {
  if (err instanceof CygnetError) {
    // Config or connectivity issue — message is already clean
    console.error(err.message);
    process.exit(1);
  }
  throw err;
});
```

For localised error handling within middleware, use `errorBoundary`:

```typescript
bot.errorBoundary(
  async (err) => {
    await err.ctx.reply("Something went wrong, sorry!");
  },
  dangerousHandler,
);
```

---

## Logging

cygnet has a built-in structured logger with level filtering and colored output.

### Log level

```typescript
const bot = new Bot({
  signalService: "localhost:8080",
  phoneNumber: "+491234567890",
  logLevel: "debug", // "debug" | "info" | "warn" | "error" | "silent"
});
```

Default is `"info"`. Set to `"silent"` to suppress all framework output.

### Custom logger

Pass any object with `debug`, `info`, `warn`, and `error` methods — compatible with pino, consola, winston, and similar libraries:

```typescript
import pino from "pino";

const bot = new Bot({
  signalService: "localhost:8080",
  phoneNumber: "+491234567890",
  logger: pino(), // or console, or any { debug, info, warn, error } object
});
```

When a custom `logger` is provided, `logLevel` is ignored — filtering is your logger's responsibility.

### Using the logger in middleware

The bot's logger is exposed as `bot.logger`:

```typescript
bot.use((ctx, next) => {
  bot.logger.info(`Update from ${ctx.from}`);
  return next();
});
```

### Output format

In a TTY with color support:

```
[cygnet] Bot started as +491234567890 (websocket)     ← cyan
[cygnet] Failed to prime group state cache             ← yellow
[cygnet] Cannot reach signal-cli-rest-api              ← red
```

Colors are disabled automatically when piping to a file, or when `NO_COLOR` is set. `FORCE_COLOR` forces colors on.

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

## Webhook transport

Instead of connecting via WebSocket, the bot can receive updates via HTTP. signal-cli-rest-api POSTs each incoming message to your bot's URL when `RECEIVE_WEBHOOK_URL` is set.

```typescript
const bot = new Bot({
  signalService: "localhost:8080",
  phoneNumber: "+491234567890",
  transport: "webhook",
  webhook: {
    port: 9080,           // default: 9080
    host: "0.0.0.0",      // default: "0.0.0.0"
    path: "/webhook",     // default: "/webhook"
  },
});

bot.start();
```

On the signal-cli-rest-api side, set the environment variable:

```bash
docker run -d --name signal-api \
  -p 8080:8080 \
  -e 'MODE=json-rpc' \
  -e 'RECEIVE_WEBHOOK_URL=http://host.docker.internal:9080/webhook' \
  -v $HOME/.local/share/signal-api:/home/.local/share/signal-cli \
  bbernhard/signal-cli-rest-api
```

The webhook listener accepts both JSON-RPC wrapped payloads (what signal-cli-rest-api actually sends) and plain `RawUpdate` objects.

See [`examples/webhook.ts`](./examples/webhook.ts) for a complete setup.

---

## API reference

### `Bot<C>`

| Member | Description |
|---|---|
| `new Bot(config)` | `config.signalService`, `config.phoneNumber`, optional `config.includeOwnMessages` (default `false`), `config.logLevel`, `config.logger`, `config.ContextConstructor`, `config.transport` (`"websocket"` \| `"polling"` \| `"webhook"`), `config.pollingInterval`, `config.webhook` (`{ port?, host?, path? }`), `config.groupStateStorage`, `config.groupStateKey` |
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
| `send(to, text, options?)` | Send a message (supports `linkPreview`, `textMode`, etc.) |
| `react(to, payload)` | Send or remove a reaction |
| `typing(to, stop?)` | Send typing indicator |
| `editMessage(to, timestamp, text)` | Edit a sent message |
| `deleteMessage(to, timestamp)` | Delete a sent message |
| `createPoll(to, poll)` | Create a poll → `{ timestamp }` |
| `voteInPoll(to, vote)` | Vote in a poll (1-based answer indices) |
| `closePoll(to, timestamp)` | Close/terminate a poll |
| `listContacts(allRecipients?)` | List contacts (pass `true` to include all recipients) |
| `getContact(uuid)` | Look up a single contact by UUID |
| `updateContact(options)` | Update a contact's name or expiration |
| `getContactAvatar(uuid)` | Get a contact's avatar as `Uint8Array` |
| `getGroups()` | List groups the bot is in |
| `checkHealth()` | Returns `true` if signal-cli-rest-api is reachable |

### Filter queries

See the [filter queries table](#filter-queries) above.

---

## Setting up signal-cli-rest-api

### 1. Start the Docker container

```bash
docker run -d --name signal-api --restart=always \
  -p 8080:8080 \
  -v $HOME/.local/share/signal-api:/home/.local/share/signal-cli \
  -e 'MODE=json-rpc' \
  bbernhard/signal-cli-rest-api
```

`MODE=json-rpc` is required for WebSocket support. Other modes (`native`, `normal`) only support REST polling.

### 2. Register your phone number

```bash
curl -X POST 'http://localhost:8080/v1/register/+1234567890'
```

If you get a captcha error:

1. Open https://signalcaptchas.org/registration/generate.html
2. Open your browser's developer console (F12)
3. Complete the captcha
4. In the console, find the line: `Prevented navigation to "signalcaptcha://signal-hcaptcha-short.xxxxx..."`
5. Copy the value after `signalcaptcha://` and pass it:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"captcha":"signal-hcaptcha-short.xxxxx..."}' \
  'http://localhost:8080/v1/register/+1234567890'
```

### 3. Verify with the SMS code

```bash
curl -X POST 'http://localhost:8080/v1/register/+1234567890/verify/123456'
```

### 4. Confirm it's working

```bash
curl http://localhost:8080/v1/health
```

You're now ready to run a bot.


## Releasing

> Maintainer section. If you're just building bots, you can ignore this.

cygnet uses **Changesets** + GitHub Actions for versioning, changelogs, and npm publish.

1. Add a changeset for user-facing changes:
   ```bash
   bun run changeset
   ```
2. Merge your PR into `main`.
3. The `changesets.yml` workflow opens/updates a release PR (`chore(release): version packages`).
4. Merge that release PR.
5. If `ENABLE_AUTO_PUBLISH=true`, GitHub publishes to npm automatically.

Notes:
- CI workflow: `.github/workflows/ci.yml`
- Release workflow: `.github/workflows/changesets.yml`
- Publishing uses npm **Trusted Publishing** (OIDC), so `NPM_TOKEN` is not required.
- If Actions cannot create release PRs, set `CHANGESETS_GITHUB_TOKEN` with `contents` + `pull-requests` write scope.
