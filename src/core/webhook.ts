import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "http";
import { defaultLogger } from "./logger.ts";
import type { Logger } from "./logger.ts";
import type { RawUpdate } from "../types.ts";
import type { UpdateSource } from "./source.ts";

export interface WebhookListenerOptions {
  /** Port to listen on. Default: 9080 */
  port?: number;
  /** Host/IP to bind to. Default: "0.0.0.0" */
  host?: string;
  /** URL path to accept POSTs on. Default: "/webhook" */
  path?: string;
  /** Logger instance. Defaults to the built-in default logger. */
  logger?: Logger;
}

/**
 * WebhookListener runs a lightweight HTTP server that receives updates
 * from signal-cli-rest-api's `RECEIVE_WEBHOOK_URL` mechanism.
 *
 * signal-cli-rest-api (json-rpc mode) POSTs each incoming message as
 * a JSON body (`{ envelope, account }`) to the configured webhook URL.
 *
 * Usage:
 * 1. Start your bot with `transport: "webhook"`.
 * 2. Set signal-cli-rest-api's `RECEIVE_WEBHOOK_URL` env var to
 *    `http://<bot-host>:<port><path>` (e.g. `http://bot:9080/webhook`).
 *
 * The server accepts both the raw JSON-RPC wrapper
 * (`{ "method": "receive", "params": { "envelope": ... } }`) and
 * a plain RawUpdate (`{ "envelope": ... }`).
 *
 * Responds 200 on successful parse, 400 on bad JSON,
 * and 404 on any path other than the configured webhook path.
 */
export class WebhookListener implements UpdateSource {
  readonly #port: number;
  readonly #host: string;
  readonly #path: string;
  readonly #logger: Logger;

  #server: Server | null = null;
  #stopped = false;

  // Queued updates + resolve function for the async iterator
  #queue: RawUpdate[] = [];
  #resolve: (() => void) | null = null;

  constructor(options: WebhookListenerOptions = {}) {
    this.#port = options.port ?? 9080;
    this.#host = options.host ?? "0.0.0.0";
    this.#path = options.path ?? "/webhook";
    this.#logger = options.logger ?? defaultLogger;
  }

  /** The port the server is configured to listen on. */
  get port(): number {
    return this.#port;
  }

  /** The webhook path the server accepts POSTs on. */
  get path(): string {
    return this.#path;
  }

  stop(): void {
    this.#stopped = true;
    this.#resolve?.();
    this.#resolve = null;
    if (this.#server) {
      this.#server.close();
      this.#server = null;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<RawUpdate> {
    this.#stopped = false;
    await this.#startServer();

    try {
      while (!this.#stopped) {
        // Drain the queue
        while (this.#queue.length > 0) {
          yield this.#queue.shift()!;
        }

        if (this.#stopped) break;

        // Wait for next update
        await new Promise<void>((res) => {
          this.#resolve = res;
          // Check if something arrived while setting up the promise
          if (this.#queue.length > 0 || this.#stopped) {
            this.#resolve = null;
            res();
          }
        });
      }
    } finally {
      this.stop();
    }
  }

  #startServer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => this.#handleRequest(req, res));
      this.#server = server;

      server.on("error", (err) => {
        this.#logger.error("Webhook server error:", err);
        reject(err);
      });

      server.listen(this.#port, this.#host, () => {
        this.#logger.debug(
          `Webhook server listening on ${this.#host}:${this.#port}${
            this.#path
          }`,
        );
        resolve();
      });
    });
  }

  #handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Only accept POST to the configured path
    if (req.method !== "POST" || req.url !== this.#path) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        const parsed = JSON.parse(body);

        // signal-cli-rest-api sends the raw JSON-RPC message:
        //   { "method": "receive", "params": { "envelope": ..., "account": ... } }
        // Unwrap if needed; also accept a plain RawUpdate for direct use.
        const update: RawUpdate = parsed?.params?.envelope
          ? parsed.params
          : parsed?.envelope
          ? parsed
          : null;

        if (!update) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "Missing envelope — expected JSON-RPC message or RawUpdate",
            }),
          );
          return;
        }

        // Enqueue the update and wake the iterator
        this.#queue.push(update);
        this.#resolve?.();
        this.#resolve = null;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        this.#logger.warn("Failed to parse webhook body:", body.slice(0, 200));
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  }
}
