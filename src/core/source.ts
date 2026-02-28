import type { RawUpdate } from "../types.ts";

/**
 * Common interface for update sources (WebSocket, REST polling, etc.).
 * Any object that yields RawUpdate objects and can be stopped.
 */
export interface UpdateSource {
  [Symbol.asyncIterator](): AsyncIterator<RawUpdate>;
  stop(): void;
}
