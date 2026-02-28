import { Composer, run } from "./composer.ts";
import {
  Context,
  primeGroupStateCache,
  restoreGroupStateCache,
  snapshotGroupStateCache,
} from "./context.ts";
import { SignalAPI } from "./core/api.ts";
import { BotError } from "./core/error.ts";
import { PollingListener } from "./core/polling.ts";
import { WebSocketListener } from "./core/websocket.ts";
import type { UpdateSource } from "./core/source.ts";
import type { RawUpdate, MaybePromise } from "./types.ts";
import type { GroupStateSnapshot } from "./context.ts";
import type { DirectStorageAdapter } from "./convenience/session.ts";

export interface BotConfig {
  /** URL of the signal-cli-rest-api service, e.g. "localhost:8080" or "http://localhost:8080" */
  signalService: string;
  /** The bot's registered phone number, e.g. "+491234567890" */
  phoneNumber: string;
  /**
   * Custom Context subclass to use. Supports context flavoring.
   * Defaults to the base Context class.
   */
  ContextConstructor?: new (update: RawUpdate, api: SignalAPI, me: string) => Context;
  /**
   * Transport for receiving updates.
   * - "websocket" (default): persistent WebSocket connection, works with all signal-cli modes
   * - "polling": REST polling via GET /v1/receive, works with normal/native modes only
   */
  transport?: "websocket" | "polling";
  /**
   * Polling interval in ms (default: 1000). Only used with transport: "polling".
   */
  pollingInterval?: number;
  /** Optional storage adapter for persisting group state across restarts. */
  groupStateStorage?: DirectStorageAdapter<GroupStateSnapshot>;
  /** Storage key for group state. Defaults to the bot phone number. */
  groupStateKey?: string;
}

export class Bot<C extends Context = Context> extends Composer<C> {
  readonly api: SignalAPI;
  readonly config: BotConfig;

  #me: string = "";
  #stopped = false;
  #listener: UpdateSource | null = null;
  #errorHandler: (err: BotError<C>) => MaybePromise<void> = defaultErrorHandler;

  constructor(config: BotConfig) {
    super();
    this.config = config;
    this.api = new SignalAPI({
      baseUrl: config.signalService,
      phoneNumber: config.phoneNumber,
    });
    // Route forked middleware errors through the bot error handler
    this._onForkError = (err, ctx) => {
      const botError = new BotError<C>(err, ctx);
      Promise.resolve(this.#errorHandler(botError)).catch((handlerErr) => {
        console.error("[cygnet] Error in error handler:", handlerErr);
      });
    };
  }

  /**
   * Override the default error handler.
   * The default handler logs the error and re-throws it.
   */
  catch(handler: (err: BotError<C>) => MaybePromise<void>): this {
    this.#errorHandler = handler;
    return this;
  }

  /**
   * Verify signal-cli-rest-api is reachable.
   * Called automatically by start().
   */
  async init(): Promise<void> {
    const healthy = await this.api.checkHealth();
    if (!healthy) {
      throw new Error(
        `[cygnet] Cannot reach signal-cli-rest-api at ${this.config.signalService}. Is it running?`,
      );
    }
    this.#me = this.config.phoneNumber;

    await this.#restoreGroupStateCache();

    try {
      const groups = await this.api.getGroups();
      primeGroupStateCache(this.#me, groups);
      await this.#persistGroupStateCache();
    } catch (err) {
      console.warn("[cygnet] Failed to prime group state cache:", err);
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
      });
      console.log(`[cygnet] Bot started as ${this.#me} (polling)`);
    } else {
      const wsUrl = this.api.httpClient.wsReceiveUrl();
      this.#listener = new WebSocketListener(wsUrl);
      console.log(`[cygnet] Bot started as ${this.#me} (websocket)`);
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
    console.log("[cygnet] Bot stopped.");
  }

  /**
   * Process a single RawUpdate through the middleware stack.
   * Can be used directly for custom transport (e.g. webhooks).
   */
  async handleUpdate(update: RawUpdate): Promise<void> {
    const ContextClass = this.config.ContextConstructor ?? Context;
    const ctx = new ContextClass(update, this.api, this.#me) as C;
    try {
      await run(this.middleware(), ctx);
    } catch (err) {
      const botError = new BotError<C>(err, ctx);
      try {
        await this.#errorHandler(botError);
      } catch (handlerErr) {
        console.error("[cygnet] Error in error handler:", handlerErr);
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
        console.warn("[cygnet] Ignoring invalid group state snapshot.");
        return;
      }
      restoreGroupStateCache(this.#me, snapshot);
    } catch (err) {
      console.warn("[cygnet] Failed to restore group state cache:", err);
    }
  }

  async #persistGroupStateCache(): Promise<void> {
    const storage = this.config.groupStateStorage;
    if (!storage) return;

    try {
      const snapshot = snapshotGroupStateCache(this.#me);
      await storage.write(this.#groupStateKey(), snapshot);
    } catch (err) {
      console.warn("[cygnet] Failed to persist group state cache:", err);
    }
  }

  #groupStateKey(): string {
    return this.config.groupStateKey ?? this.#me;
  }
}

function defaultErrorHandler(err: BotError): void {
  console.error("[cygnet] Unhandled error:", err.error);
  console.error("[cygnet] Set bot.catch() to handle errors");
}
