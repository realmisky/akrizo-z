import fs from "fs";
import path from "path";
import { HttpClient } from "./client";
import { applyTemplate, getDeep } from "./utils";
import { log } from "./logger";
import type { NullFeeConfig, CredentialEnv } from "./config";

interface AuthState {
  /** Bearer token (if API uses Authorization header) */
  token?:   string | null;
  /** Serialized Cookie header (if API uses session cookies, e.g. NullFee `nullfee.sid`) */
  cookies?: string | null;
  /** Login identifier this session belongs to */
  account: string;
  savedAt: number;
}

const SESSION_FILE = "session.json";
/** Cached token validity (clientside heuristic). Server may invalidate earlier. */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function statePath(stateDir: string): string {
  return path.join(stateDir, SESSION_FILE);
}

export function loadStoredSession(creds: CredentialEnv): AuthState | null {
  try {
    const file = statePath(creds.stateDir);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as AuthState;
    if (data.account !== creds.login) return null;
    if (Date.now() - data.savedAt > SESSION_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveSession(creds: CredentialEnv, state: Omit<AuthState, "savedAt" | "account">): void {
  fs.mkdirSync(creds.stateDir, { recursive: true });
  const data: AuthState = { ...state, account: creds.login, savedAt: Date.now() };
  fs.writeFileSync(statePath(creds.stateDir), JSON.stringify(data, null, 2));
}

export function clearSession(creds: CredentialEnv): void {
  const file = statePath(creds.stateDir);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export async function login(
  cfg: NullFeeConfig,
  creds: CredentialEnv,
  client: HttpClient
): Promise<void> {
  log.step(`Logging in as ${creds.login}...`);

  // Reset any prior session before logging in fresh.
  client.setToken(null);
  client.setCookieHeader(null);

  const body = applyTemplate(cfg.auth.loginBodyTemplate, {
    LOGIN:    creds.login,
    USERNAME: creds.login,
    EMAIL:    creds.login,   // alias — same value, supports any field name
    PASSWORD: creds.password,
  });

  const res = await client.request(cfg.endpoints.login, body);

  // Optional: extract a Bearer token from the JSON response (only if configured).
  const tokenPath = cfg.endpoints.login.tokenPath;
  if (tokenPath) {
    const token = getDeep(res, tokenPath);
    if (typeof token === "string" && token.length > 0) {
      client.setToken(token);
    }
  }

  // Cookie jar is auto-populated by HttpClient.request() via Set-Cookie parsing.
  if (!client.hasSession()) {
    throw new Error(
      "Login returned 200 but no session was established (no token & no cookie). " +
      "Check `endpoints.login.tokenPath` if the API uses a Bearer token."
    );
  }

  saveSession(creds, {
    token:   client.getToken(),
    cookies: client.getCookieHeader(),
  });
  log.ok("Login OK, session cached");
}

export async function ensureAuthed(
  cfg: NullFeeConfig,
  creds: CredentialEnv,
  client: HttpClient
): Promise<void> {
  const stored = loadStoredSession(creds);
  if (stored) {
    if (stored.token)   client.setToken(stored.token);
    if (stored.cookies) client.setCookieHeader(stored.cookies);
    if (client.hasSession()) {
      log.dim("Reusing cached session");
      return;
    }
  }
  await login(cfg, creds, client);
}

// Backwards-compat aliases (old names used elsewhere in the codebase)
export const loadStoredToken = loadStoredSession;
export const saveToken      = (creds: CredentialEnv, token: string) =>
  saveSession(creds, { token, cookies: null });
export const clearToken     = clearSession;
