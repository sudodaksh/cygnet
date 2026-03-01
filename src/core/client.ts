import { SignalError } from "./error.ts";

export interface ClientConfig {
  baseUrl: string; // e.g. "http://localhost:8080"
  phoneNumber: string; // URL-encoded when used in paths
}

export class HttpClient {
  readonly baseUrl: string;
  readonly phoneNumber: string;

  constructor(config: ClientConfig) {
    // Normalize baseUrl: strip trailing slash, ensure scheme
    let url = config.baseUrl;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "http://" + url;
    }
    this.baseUrl = url.replace(/\/$/, "");
    this.phoneNumber = config.phoneNumber;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    return this.#handleResponse<T>(res);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.#handleResponse<T>(res);
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.#handleResponse<T>(res);
  }

  async #handleResponse<T>(res: Response): Promise<T> {
    if (res.ok) {
      const text = await res.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    let description: string;
    try {
      const body = await res.json() as { error?: string; message?: string };
      description = body.error ?? body.message ?? res.statusText;
    } catch {
      description = res.statusText;
    }
    throw new SignalError(res.status, description);
  }

  /** WebSocket URL for receiving messages */
  wsReceiveUrl(): string {
    const wsBase = this.baseUrl
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://");
    return `${wsBase}/v1/receive/${encodeURIComponent(this.phoneNumber)}`;
  }
}
