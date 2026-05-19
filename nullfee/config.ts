import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// load .env from cwd first, then fallback to repo root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export interface EndpointDef {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  /** dot-path to extract token from response, e.g. "data.token" or "accessToken".
   *  Leave unset for cookie-based auth (Set-Cookie is captured automatically). */
  tokenPath?: string;
}

/**
 * One endpoint of a swap. Two of these are picked randomly per swap iteration
 * (the first becomes "from", the second becomes "to").
 *
 * For cross-chain bridges (e.g. NullFee) you'll want each entry to specify both
 * `chain` and `token`. For same-chain pair-swaps, just leave `chain` the same.
 */
export interface SwapPairDef {
  /** Source chain identifier as the API expects it (e.g. "bsc", "ethereum"). */
  chain?: string;
  /** Token identifier as the API expects it (e.g. "USDT"). */
  token: string;
  /** Display label (defaults to "{token}@{chain}"). */
  label?: string;
  /** Decimals for amount-rounding only — not sent to API. */
  decimals?: number;
}

export interface NullFeeConfig {
  apiBase: string;
  /** Headers always sent (e.g. Origin, Referer) */
  defaultHeaders?: Record<string, string>;
  endpoints: {
    login:       EndpointDef;
    balance?:    EndpointDef;
    swap:        EndpointDef;
    mysteryBox?: EndpointDef;
    dailySpin?:  EndpointDef;
  };
  auth: {
    /** Body template for login. Placeholders: {{LOGIN}}, {{USERNAME}}, {{EMAIL}}, {{PASSWORD}}. */
    loginBodyTemplate: any;
    /** Header name for Bearer-token auth (ignored for pure cookie auth). */
    authHeader: string;
    /** Prefix string before the Bearer token (e.g. `"Bearer "`). */
    authPrefix: string;
  };
  swap: {
    pairs: SwapPairDef[];
    /**
     * Template for swap request body. Supports placeholders:
     *   {{TOKEN_IN_CHAIN}},  {{TOKEN_IN_TOKEN}},  {{TOKEN_IN_LABEL}}
     *   {{TOKEN_OUT_CHAIN}}, {{TOKEN_OUT_TOKEN}}, {{TOKEN_OUT_LABEL}}
     *   {{AMOUNT}}            (numeric — type preserved when used standalone)
     *
     * For NullFee:
     *   { "fromChain": "{{TOKEN_IN_CHAIN}}", "toChain": "{{TOKEN_OUT_CHAIN}}",
     *     "fromToken": "{{TOKEN_IN_TOKEN}}", "toToken": "{{TOKEN_OUT_TOKEN}}",
     *     "amountUsd": "{{AMOUNT}}" }
     */
    bodyTemplate: any;
    /** Range for {{AMOUNT}} — units depend on the API (e.g. USD for NullFee). */
    amountRange:       { min: number; max: number };
    delaySecondsRange: { min: number; max: number };
    /** dot-path on /balance response to read remaining test balance */
    balanceField?: string;
    /** Stop loop when balanceField value < this number (same units as the field). */
    minBalance?: number;
    /** Require the two picked pairs to have different chains (true for bridges). */
    requireDifferentChains?: boolean;
    maxIterations: number;
  };
  mysteryBox?: { bodyTemplate?: any };
  dailySpin?:  { bodyTemplate?: any };
}

export interface CredentialEnv {
  /** The login identifier (email OR username — whichever NullFee accepts) */
  login:      string;
  password:   string;
  configPath: string;
  stateDir:   string;
}

function configPath(): string {
  return (
    process.env.NULLFEE_CONFIG_PATH ||
    path.resolve(__dirname, "..", "nullfee.config.json")
  );
}

export function loadConfig(): NullFeeConfig {
  const cfgPath = configPath();
  if (!fs.existsSync(cfgPath)) {
    throw new Error(
      `Config not found at ${cfgPath}\n` +
      `Copy nullfee.config.example.json → nullfee.config.json and fill in values.`
    );
  }
  const raw = fs.readFileSync(cfgPath, "utf8");
  const cfg = JSON.parse(raw) as NullFeeConfig;

  if (!cfg.apiBase) throw new Error("config.apiBase required");
  if (!cfg.endpoints?.login?.path) throw new Error("config.endpoints.login.path required");
  if (!cfg.endpoints?.swap?.path)  throw new Error("config.endpoints.swap.path required");
  if (!cfg.swap?.pairs || cfg.swap.pairs.length < 2) {
    throw new Error("config.swap.pairs needs >= 2 entries for random pair-picking");
  }
  if (!cfg.auth?.loginBodyTemplate) throw new Error("config.auth.loginBodyTemplate required");

  // Auto-fill convenience labels.
  for (const p of cfg.swap.pairs) {
    if (!p.label) p.label = p.chain ? `${p.token}@${p.chain}` : p.token;
  }
  return cfg;
}

export function loadCredentials(): CredentialEnv {
  const login =
    process.env.NULLFEE_LOGIN ||
    process.env.NULLFEE_USERNAME ||
    process.env.NULLFEE_EMAIL;
  const password = process.env.NULLFEE_PASSWORD;
  if (!login) {
    throw new Error(
      "Set NULLFEE_USERNAME (or NULLFEE_LOGIN / NULLFEE_EMAIL) in .env — " +
      "this is your NullFee account identifier."
    );
  }
  if (!password) throw new Error("NULLFEE_PASSWORD missing in .env");

  const stateDir =
    process.env.NULLFEE_STATE_DIR ||
    path.resolve(__dirname, "..", ".nullfee-state");
  return { login, password, configPath: configPath(), stateDir };
}
