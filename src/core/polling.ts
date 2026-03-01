import { defaultLogger } from "./logger.ts";
import type { Logger } from "./logger.ts";
import type { RawUpdate } from "../types.ts";
import type { UpdateSource } from "./source.ts";
import type { HttpClient } from "./client.ts";

export interface PollingListenerOptions {
  /** Polling interval in ms (default: 1000) */
  interval?: number;
  /** Logger instance. Defaults to the built-in default logger. */
  logger?: Logger;
}

/**
 * PollingListener fetches messages from signal-cli-rest-api's REST endpoint
 * (GET /v1/receive/{number}) on a configurable interval and yields them
 * as an async generator.
 *
 * Use this when running signal-cli-rest-api in normal or native mode.
 * For json-rpc mode, use WebSocketListener instead.
 */
export class PollingListener implements UpdateSource {
  readonly #client: HttpClient;
  readonly #receivePath: string;
  readonly #interval: number;
  readonly #logger: Logger;
  #stopped = false;

  constructor(client: HttpClient, options: PollingListenerOptions = {}) {
    this.#client = client;
    this.#receivePath = `/v1/receive/${encodeURIComponent(client.phoneNumber)}`;
    this.#interval = options.interval ?? 1_000;
    this.#logger = options.logger ?? defaultLogger;
  }

  stop(): void {
    this.#stopped = true;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<RawUpdate> {
    while (!this.#stopped) {
      try {
        const updates = await this.#client.get<RawUpdate[]>(this.#receivePath);
        if (Array.isArray(updates)) {
          for (const update of updates) {
            if (this.#stopped) return;
            yield update;
          }
        }
      } catch (err) {
        if (this.#stopped) return;
        this.#logger.warn("Polling error:", err);
      }
      if (!this.#stopped) {
        await sleep(this.#interval);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
