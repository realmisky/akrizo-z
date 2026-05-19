import fs from "fs";
import path from "path";
import { HttpClient } from "./client";
import { applyTemplate, getDeep } from "./utils";
import { log } from "./logger";
import type { NullFeeConfig, CredentialEnv } from "./config";

interface AuthState {
  token:   string;
  email:   string;
  savedAt: number;
}

const SESSION_FILE = "session.json";
/** Cached token validity (clientside heuristic). Server may invalidate earlier. */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function statePath(stateDir: string): string {
  return path.join(stateDir, SESSION_FILE);
}

export function loadStoredToken(creds: CredentialEnv): string | null {
  try {
    const file = statePath(creds.stateDir);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as AuthState;
    if (data.email !== creds.email) return null;
    if (Date.now() - data.savedAt > SESSION_TTL_MS) return null;
    return data.token;
  } catch {
    return null;
  }
}

export function saveToken(creds: CredentialEnv, token: string): void {
  fs.mkdirSync(creds.stateDir, { recursive: true });
  const data: AuthState = { token, email: creds.email, savedAt: Date.now() };
  fs.writeFileSync(statePath(creds.stateDir), JSON.stringify(data, null, 2));
}

export function clearToken(creds: CredentialEnv): void {
  const file = statePath(creds.stateDir);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export async function login(
  cfg: NullFeeConfig,
  creds: CredentialEnv,
  client: HttpClient
): Promise<string> {
  log.step(`Logging in as ${creds.email}...`);
  const body = applyTemplate(cfg.auth.loginBodyTemplate, {
    EMAIL:    creds.email,
    PASSWORD: creds.password,
  });
  const res = await client.request(cfg.endpoints.login, body);
  const token = getDeep(res, cfg.endpoints.login.tokenPath || "token");
  if (!token || typeof token !== "string") {
    throw new Error(
      `Login response did not contain a string token at "${cfg.endpoints.login.tokenPath ?? "token"}". ` +
      `Top-level keys: ${Object.keys(res || {}).join(", ") || "(none)"}`
    );
  }
  client.setToken(token);
  saveToken(creds, token);
  log.ok("Login OK, session cached");
  return token;
}

export async function ensureAuthed(
  cfg: NullFeeConfig,
  creds: CredentialEnv,
  client: HttpClient
): Promise<void> {
  const stored = loadStoredToken(creds);
  if (stored) {
    client.setToken(stored);
    log.dim("Reusing cached session token");
    return;
  }
  await login(cfg, creds, client);
}
