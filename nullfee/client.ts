import { log } from "./logger";
import { sleep } from "./utils";
import type { NullFeeConfig, EndpointDef } from "./config";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: any
  ) {
    super(`[${status}] ${message}`);
    this.name = "HttpError";
  }
}

export class HttpClient {
  private token: string | null = null;

  constructor(private cfg: NullFeeConfig, initialToken?: string) {
    if (initialToken) this.token = initialToken;
  }

  setToken(t: string | null): void { this.token = t; }
  getToken(): string | null         { return this.token; }

  async request<T = any>(
    endpoint: EndpointDef,
    body?: any,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const url = this.cfg.apiBase.replace(/\/$/, "") + endpoint.path;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "NullFeeCLI/1.0 (akrizo-z)",
      ...(this.cfg.defaultHeaders ?? {}),
      ...extraHeaders,
    };

    if (body && (endpoint.method === "POST" || endpoint.method === "PUT")) {
      headers["Content-Type"] = "application/json";
    }

    if (this.token) {
      headers[this.cfg.auth.authHeader] = this.cfg.auth.authPrefix + this.token;
    }

    const init: any = { method: endpoint.method, headers };
    if (body && endpoint.method !== "GET") {
      init.body = JSON.stringify(body);
    }

    let lastErr: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, init);

        if (res.status === 429) {
          const wait = 5_000 * attempt;
          log.warn(`429 rate-limited; backing off ${wait / 1000}s`);
          await sleep(wait);
          continue;
        }
        if (res.status >= 500) {
          const wait = 3_000 * attempt;
          log.warn(`HTTP ${res.status} server error; retrying in ${wait / 1000}s`);
          await sleep(wait);
          continue;
        }

        const text = await res.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }

        if (!res.ok) {
          const msg =
            (data && (data.message || data.error || data.msg)) ||
            `HTTP ${res.status}`;
          throw new HttpError(String(msg), res.status, data);
        }
        return data as T;
      } catch (err: any) {
        lastErr = err;
        if (err instanceof HttpError) throw err;
        const wait = 2_000 * attempt;
        log.warn(`Network error: ${err.message}; retry in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
    throw lastErr ?? new Error("request failed after retries");
  }
}
