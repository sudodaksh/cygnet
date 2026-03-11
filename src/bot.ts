import { Composer, run } from "./composer.ts";
import {
  Context,
  primeGroupStateCache,
  restoreGroupStateCache,
  snapshotGroupStateCache,
} from "./context.ts";
import { SignalAPI } from "./core/api.ts";
import { BotError, CygnetError } from "./core/error.ts";
import { createLogger } from "./core/logger.ts";
import { PollingListener } from "./core/polling.ts";
import { WebhookListener } from "./core/webhook.ts";
import { WebSocketListener } from "./core/websocket.ts";
import type { UpdateSource } from "./core/source.ts";
import type { WebhookListenerOptions } from "./core/webhook.ts";
import type { Logger, LogLevel } from "./core/logger.ts";
import type { RawUpdate, MaybePromise } from "./types.ts";
import type { GroupStateSnapshot } from "./context.ts";
import type { DirectStorageAdapter } from "./convenience/session.ts";

export interface BotConfig {
  /** URL of the signal-cli-rest-api service, e.g. "localhost:8080" or "http://localhost:8080" */
  signalService: string;
  /** The bot's registered phone number, e.g. "+491234567890" */
  phoneNumber: string;
  /**
   * Whether to pass the bot's own outgoing/sync updates through middleware.
   * Default: false.
   *
   * This aligns cygnet with grammY/Telegram, where bot listeners only receive
   * incoming user updates by default and do not react to the bot's own sends.
   */
  includeOwnMessages?: boolean;
  /**
   * Custom Context subclass to use. Supports context flavoring.
   * Defaults to the base Context class.
   */
  ContextConstructor?: new (update: RawUpdate, api: SignalAPI, me: string) => Context;
  /**
   * Transport for receiving updates.
   * - "websocket" (default): persistent WebSocket connection, works with all signal-cli modes
   * - "polling": REST polling via GET /v1/receive, works with normal/native modes only
   * - "webhook": HTTP server that receives POSTs from signal-cli-rest-api's
   *   `RECEIVE_WEBHOOK_URL` mechanism (json-rpc mode only)
   */
  transport?: "websocket" | "polling" | "webhook";
  /**
   * Polling interval in ms (default: 1000). Only used with transport: "polling".
   */
  pollingInterval?: number;
  /**
   * Webhook server options. Only used with transport: "webhook".
   * Set `RECEIVE_WEBHOOK_URL` on signal-cli-rest-api to point to this server.
   */
  webhook?: Omit<WebhookListenerOptions, "logger">;
  /** Optional storage adapter for persisting group state across restarts. */
  groupStateStorage?: DirectStorageAdapter<GroupStateSnapshot>;
  /** Storage key for group state. Defaults to the bot phone number. */
  groupStateKey?: string;
  /**
   * Minimum log level. Default: "info".
   * Set to "silent" to suppress all framework output.
   * Ignored if a custom `logger` is provided.
   */
  logLevel?: LogLevel;
  /**
   * Custom logger instance. Must implement `debug`, `info`, `warn`, `error`.
   * Compatible with pino, consola, winston, or any object with those methods.
   * When provided, `logLevel` is ignored (filtering is your logger's job).
   */
  logger?: Logger;
}

function isOwnUpdate(update: RawUpdate, me: string): boolean {
  const env = update.envelope;

  // signal-cli-rest-api echoes the bot's own outgoing messages back via sync
  // updates, and in some setups also as regular envelopes where the sender is
  // the bot's registered number.
  if (env.syncMessage != null) return true;
  if (env.sourceNumber === me) return true;
  if (env.source === me) return true; // older payloads may put the number here
  return false;
}

export class Bot<C extends Context = Context> extends Composer<C> {
  readonly api: SignalAPI;
  readonly config: BotConfig;
  /** The bot's logger. Use this in your own middleware for consistent output. */
  readonly logger: Logger;

  #me: string = "";
  #stopped = false;
  #listener: UpdateSource | null = null;
  #errorHandler: (err: BotError<C>) => MaybePromise<void>;

  constructor(config: BotConfig) {
    super();
    this.config = config;
    this.logger = config.logger ?? createLogger(config.logLevel ?? "info");
    this.api = new SignalAPI({
      baseUrl: config.signalService,
      phoneNumber: config.phoneNumber,
    });

    // Default error handler — logs and continues (does NOT stop the bot).
    // Follows Express/Koa convention: log clearly, keep running.
    this.#errorHandler = (err: BotError<C>) => {
      this.logger.error("Unhandled error:", err.error);
      this.logger.error("Set bot.catch() to handle errors");
    };

    // Route forked middleware errors through the bot error handler
    this._onForkError = (err, ctx) => {
      const botError = new BotError<C>(err, ctx);
      Promise.resolve(this.#errorHandler(botError)).catch((handlerErr) => {
        this.logger.error("Error in error handler:", handlerErr);
      });
    };
  }

  /**
   * Override the default error handler.
   */
  catch(handler: (err: BotError<C>) => MaybePromise<void>): this {
    this.#errorHandler = handler;
    return this;
  }

  /**
   * Verify configuration and check that signal-cli-rest-api is reachable.
   * Called automatically by start().
   *
   * Throws `CygnetError` for configuration/connectivity problems.
   * These produce clean, stack-free output when unhandled.
   */
  async init(): Promise<void> {
    // --- Config validation (fail fast, clear messages) ---
    if (!this.config.signalService) {
      throw new CygnetError(
        'signalService is required — provide the URL of your signal-cli-rest-api instance (e.g. "localhost:8080")',
      );
    }
    if (!this.config.phoneNumber) {
      throw new CygnetError(
        'phoneNumber is required — provide the bot\'s registered phone number (e.g. "+491234567890")',
      );
    }

    // --- Health check ---
    const healthy = await this.api.checkHealth();
    if (!healthy) {
      throw new CygnetError(
        `Cannot reach signal-cli-rest-api at ${this.api.httpClient.baseUrl} — is it running?`,
      );
    }

    this.#me = this.config.phoneNumber;

    // --- Restore + prime group state cache ---
    await this.#restoreGroupStateCache();

    try {
      const groups = await this.api.getGroups();
      primeGroupStateCache(this.#me, groups);
      await this.#persistGroupStateCache();
    } catch (err) {
      this.logger.warn("Failed to prime group state cache:", err);
    }
  }

  /**
   * Start the bot: verify health, then begin receiving updates.
   * Processes updates sequentially. Reconnects automatically on disconnect.
   */
  async start(): Promise<void> {
    this.#stopped = false;
    await this.init();

    const transport = this.config.transport ?? "websocket";

    if (transport === "polling") {
      this.#listener = new PollingListener(this.api.httpClient, {
        interval: this.config.pollingInterval,
        logger: this.logger,
      });
      this.logger.info(`Bot started as ${this.#me} (polling)`);
    } else if (transport === "webhook") {
      const wh = new WebhookListener({
        ...this.config.webhook,
        logger: this.logger,
      });
      this.#listener = wh;
      this.logger.info(`Bot started as ${this.#me} (webhook on ${wh.port}${wh.path})`);
    } else {
      const wsUrl = this.api.httpClient.wsReceiveUrl();
      this.#listener = new WebSocketListener(wsUrl, {
        logger: this.logger,
      });
      this.logger.info(`Bot started as ${this.#me} (websocket)`);
    }

    for await (const update of this.#listener) {
      if (this.#stopped) break;
      await this.handleUpdate(update);
    }
  }

  /**
   * Stop the bot gracefully.
   */
  stop(): void {
    this.#stopped = true;
    this.#listener?.stop();
    this.logger.info("Bot stopped.");
  }

  /**
   * Process a single RawUpdate through the middleware stack.
   * Can be used directly for custom transport (e.g. webhooks).
   */
  async handleUpdate(update: RawUpdate): Promise<void> {
    if (!(this.config.includeOwnMessages ?? false) && isOwnUpdate(update, this.#me)) {
      return;
    }

    const ContextClass = this.config.ContextConstructor ?? Context;
    const ctx = new ContextClass(update, this.api, this.#me) as C;
    (ctx as Context)._logger = this.logger;
    try {
      await run(this.middleware(), ctx);
    } catch (err) {
      const botError = new BotError<C>(err, ctx);
      try {
        await this.#errorHandler(botError);
      } catch (handlerErr) {
        this.logger.error("Error in error handler:", handlerErr);
      }
    }

    if (update.envelope.dataMessage?.groupInfo?.type === "UPDATE") {
      await this.#persistGroupStateCache();
    }
  }

  async #restoreGroupStateCache(): Promise<void> {
    const storage = this.config.groupStateStorage;
    if (!storage) return;

    try {
      const snapshot = await storage.read(this.#groupStateKey());
      if (!snapshot) return;
      if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
        this.logger.warn("Ignoring invalid group state snapshot.");
        return;
      }
      restoreGroupStateCache(this.#me, snapshot);
    } catch (err) {
      this.logger.warn("Failed to restore group state cache:", err);
    }
  }

  async #persistGroupStateCache(): Promise<void> {
    const storage = this.config.groupStateStorage;
    if (!storage) return;

    try {
      const snapshot = snapshotGroupStateCache(this.#me);
      await storage.write(this.#groupStateKey(), snapshot);
    } catch (err) {
      this.logger.warn("Failed to persist group state cache:", err);
    }
  }

  #groupStateKey(): string {
    return this.config.groupStateKey ?? this.#me;
  }
}
