import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// load .env from cwd first, then fallback to repo root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export interface EndpointDef {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  /** dot-path to extract token from response, e.g. "data.token" or "accessToken" */
  tokenPath?: string;
}

export interface SwapTokenDef {
  symbol: string;
  /** API may identify tokens by id (numeric/string), address, or just symbol */
  id?: string | number;
  address?: string;
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
    /** Body template for login. {{EMAIL}} and {{PASSWORD}} get substituted */
    loginBodyTemplate: any;
    authHeader: string;   // e.g. "Authorization"
    authPrefix: string;   // e.g. "Bearer "
  };
  swap: {
    tokens: SwapTokenDef[];
    /**
     * Template for swap request body. Supports placeholders:
     *   {{TOKEN_IN_SYMBOL}}, {{TOKEN_IN_ID}}, {{TOKEN_IN_ADDR}},
     *   {{TOKEN_OUT_SYMBOL}}, {{TOKEN_OUT_ID}}, {{TOKEN_OUT_ADDR}},
     *   {{AMOUNT}}
     */
    bodyTemplate: any;
    amountRange:       { min: number; max: number };
    delaySecondsRange: { min: number; max: number };
    /** dot-path on /balance response to read remaining test balance */
    balanceField?: string;
    /** Stop loop when balanceField value < this number */
    minBalance?: number;
    maxIterations: number;
  };
  mysteryBox?: { bodyTemplate?: any };
  dailySpin?:  { bodyTemplate?: any };
}

export interface CredentialEnv {
  email:      string;
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
  if (!cfg.endpoints?.swap?.path) throw new Error("config.endpoints.swap.path required");
  if (!cfg.swap?.tokens || cfg.swap.tokens.length < 2) {
    throw new Error("config.swap.tokens needs >= 2 entries for random pairs");
  }
  if (!cfg.auth?.loginBodyTemplate) throw new Error("config.auth.loginBodyTemplate required");
  return cfg;
}

export function loadCredentials(): CredentialEnv {
  const email    = process.env.NULLFEE_EMAIL;
  const password = process.env.NULLFEE_PASSWORD;
  if (!email)    throw new Error("NULLFEE_EMAIL missing in .env");
  if (!password) throw new Error("NULLFEE_PASSWORD missing in .env");
  const stateDir =
    process.env.NULLFEE_STATE_DIR ||
    path.resolve(__dirname, "..", ".nullfee-state");
  return { email, password, configPath: configPath(), stateDir };
}
