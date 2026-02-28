import type { RawUpdate } from "../types.ts";
import type { UpdateSource } from "./source.ts";

export interface WebSocketListenerOptions {
  /** Max reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Initial reconnect delay in ms (default: 1000) */
  initialReconnectDelay?: number;
}

/**
 * WebSocketListener connects to signal-cli-rest-api's WebSocket endpoint
 * and yields RawUpdate objects via an async generator.
 * It auto-reconnects on disconnect with exponential backoff.
 */
export class WebSocketListener implements UpdateSource {
  readonly #url: string;
  readonly #maxDelay: number;
  readonly #initialDelay: number;
  #stopped = false;
  #ws: WebSocket | null = null;

  constructor(wsUrl: string, options: WebSocketListenerOptions = {}) {
    this.#url = wsUrl;
    this.#maxDelay = options.maxReconnectDelay ?? 30_000;
    this.#initialDelay = options.initialReconnectDelay ?? 1_000;
  }

  stop(): void {
    this.#stopped = true;
    this.#ws?.close();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<RawUpdate> {
    let delay = this.#initialDelay;

    while (!this.#stopped) {
      try {
        yield* this.#connect();
        delay = this.#initialDelay; // reset on clean disconnect
      } catch (err) {
        if (this.#stopped) break;
        console.error(`[cygnet] WebSocket error, reconnecting in ${delay}ms:`, err);
        await sleep(delay);
        delay = Math.min(delay * 2, this.#maxDelay);
      }
    }
  }

  async *#connect(): AsyncGenerator<RawUpdate> {
    const ws = new WebSocket(this.#url);
    this.#ws = ws;

    // Queue incoming messages; resolve waiting promises
    const queue: RawUpdate[] = [];
    let resolve: (() => void) | null = null;
    let closed = false;
    let closeError: Error | null = null;

    ws.addEventListener("message", (event: MessageEvent) => {
      try {
        const data: RawUpdate = JSON.parse(event.data as string);
        queue.push(data);
        resolve?.();
        resolve = null;
      } catch (err) {
        console.error("[cygnet] Failed to parse WebSocket message:", err);
      }
    });

    ws.addEventListener("close", (event: CloseEvent) => {
      closed = true;
      if (!event.wasClean && event.code !== 1000) {
        closeError = new Error(`WebSocket closed with code ${event.code}: ${event.reason}`);
      }
      resolve?.();
      resolve = null;
    });

    ws.addEventListener("error", (event: Event) => {
      closeError = new Error(`WebSocket error: ${(event as ErrorEvent).message ?? "unknown"}`);
      resolve?.();
      resolve = null;
    });

    // Wait for connection open
    await new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => res());
      ws.addEventListener("error", (e) => rej(new Error(`Failed to connect: ${(e as ErrorEvent).message ?? "unknown"}`)));
    });

    try {
      while (!this.#stopped) {
        // Drain the queue first
        while (queue.length > 0) {
          yield queue.shift()!;
        }

        if (closed) break;

        // Wait for next message or close
        await new Promise<void>((res) => {
          resolve = res;
          // If something arrived while we were setting up the promise
          if (queue.length > 0 || closed) {
            resolve = null;
            res();
          }
        });
      }
    } finally {
      ws.close();
      this.#ws = null;
    }

    if (closeError) throw closeError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
