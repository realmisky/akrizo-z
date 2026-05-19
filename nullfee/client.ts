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
  /** name → value cookie jar (single domain — nullfee.io) */
  private cookies = new Map<string, string>();

  constructor(private cfg: NullFeeConfig, initialToken?: string) {
    if (initialToken) this.token = initialToken;
  }

  setToken(t: string | null): void { this.token = t; }
  getToken(): string | null         { return this.token; }

  /** Restore cookie jar from a saved Cookie header string. */
  setCookieHeader(cookieHeader: string | null | undefined): void {
    this.cookies.clear();
    if (!cookieHeader) return;
    for (const piece of cookieHeader.split(";")) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }

  /** Serialize cookie jar as a single Cookie header value. */
  getCookieHeader(): string | null {
    if (this.cookies.size === 0) return null;
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  hasSession(): boolean {
    return this.token !== null || this.cookies.size > 0;
  }

  /** Update jar from a Set-Cookie header list (one entry per cookie). */
  private absorbSetCookies(setCookies: string[]): void {
    for (const c of setCookies) {
      const firstAttr = c.split(";")[0].trim();  // "name=value"
      const eq = firstAttr.indexOf("=");
      if (eq === -1) continue;
      const name = firstAttr.slice(0, eq);
      const value = firstAttr.slice(eq + 1);
      // Honor "expires=… ; Max-Age=0" delete pattern
      if (/(?:^|;\s*)max-age=0\b/i.test(c)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  async request<T = any>(
    endpoint: EndpointDef,
    body?: any,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const url = this.cfg.apiBase.replace(/\/$/, "") + endpoint.path;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/126.0.0.0 Safari/537.36 NullFeeCLI/1.0",
      ...(this.cfg.defaultHeaders ?? {}),
      ...extraHeaders,
    };

    if (body && (endpoint.method === "POST" || endpoint.method === "PUT")) {
      headers["Content-Type"] = "application/json";
    }

    // Bearer token (if explicitly set / extracted from a JSON token response)
    if (this.token) {
      headers[this.cfg.auth.authHeader] = this.cfg.auth.authPrefix + this.token;
    }

    // Cookie jar (NullFee uses HttpOnly session cookie `nullfee.sid`)
    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    const init: any = { method: endpoint.method, headers };
    if (body && endpoint.method !== "GET") {
      init.body = JSON.stringify(body);
    }

    let lastErr: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, init);

        // capture any Set-Cookie BEFORE we possibly retry-or-throw
        const setCookies =
          (res.headers as any).getSetCookie?.() ??
          // older Node: split header (lossy if cookies contain commas — unlikely for session)
          (res.headers.get("set-cookie")
            ? res.headers.get("set-cookie")!.split(/,(?=\s*\w+=)/g)
            : []);
        if (setCookies.length) this.absorbSetCookies(setCookies);

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
