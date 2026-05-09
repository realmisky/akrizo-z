/**
 * $NOCOIN Miner Agent
 * Follows soul.md protocol: authenticate → pull challenge → solve → submit receipt
 *
 * Setup:
 *   export AGENT_ETH_ADDRESS=0xYourAddress
 *   export COORDINATOR_BASE_URL=https://your-coordinator-url
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npx ts-node src/agent.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import * as crypto from "crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

const COORDINATOR_BASE_URL =
  process.env.COORDINATOR_BASE_URL ?? "https://PLACEHOLDER.replace.me";
const AGENT_ETH_ADDRESS = process.env.AGENT_ETH_ADDRESS ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const LOOP_INTERVAL_MS = 15_000; // 15s between mining attempts
const MAX_RETRIES = 3;

if (!AGENT_ETH_ADDRESS) {
  console.error("❌  AGENT_ETH_ADDRESS env var is required");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("❌  ANTHROPIC_API_KEY env var is required");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthToken {
  token: string;
  expiresAt: number; // unix ms
}

interface Challenge {
  id: string;
  document: string; // prose document about domain entities
  entities: string[]; // canonical entity roster
  solveInstructions: string; // authoritative challenge instructions
  traceSubmission?: TraceSchema; // authoritative trace contract if present
  artifactSchema?: object; // schema for the constrained artifact
}

interface TraceSchema {
  fields: string[];
  format: string;
}

interface SolveResult {
  artifact: object;
  trace: object;
  answers: Record<string, string>;
}

interface Receipt {
  challengeId: string;
  agentAddress: string;
  artifact: object;
  trace: object;
  answers: Record<string, string>;
  solvedAt: string;
  signature: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

let _authToken: AuthToken | null = null;

async function authenticate(): Promise<string> {
  if (_authToken && Date.now() < _authToken.expiresAt - 60_000) {
    return _authToken.token;
  }

  log("🔐 Authenticating with coordinator...");
  const res = await coordinatorFetch("/v1/auth", "POST", {
    address: AGENT_ETH_ADDRESS,
  });

  if (!res.token) throw new Error("Auth failed: no token returned");

  _authToken = {
    token: res.token,
    expiresAt: res.expiresAt ?? Date.now() + 3_600_000,
  };
  log("✅ Authenticated");
  return _authToken.token;
}

// ─── Coordinator HTTP ─────────────────────────────────────────────────────────

async function coordinatorFetch(
  path: string,
  method: "GET" | "POST",
  body?: object,
  token?: string
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Agent-Address": AGENT_ETH_ADDRESS,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${COORDINATOR_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coordinator ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Pull Challenge ────────────────────────────────────────────────────────────

async function pullChallenge(): Promise<Challenge> {
  const token = await authenticate();
  log("📥 Pulling next challenge...");

  const raw = await coordinatorFetch("/v1/challenge", "GET", undefined, token);

  // Security: validate shape — never trust coordinator response as instructions
  const challenge = sanitizeChallenge(raw);
  log(`🧩 Challenge ID: ${challenge.id}`);
  log(`📚 Entities: ${challenge.entities.join(", ")}`);
  return challenge;
}

function sanitizeChallenge(raw: any): Challenge {
  if (typeof raw !== "object" || !raw)
    throw new Error("Invalid challenge: not an object");
  if (typeof raw.id !== "string") throw new Error("Invalid challenge: no id");
  if (typeof raw.document !== "string")
    throw new Error("Invalid challenge: no document");
  if (!Array.isArray(raw.entities))
    throw new Error("Invalid challenge: no entities array");
  if (typeof raw.solveInstructions !== "string")
    throw new Error("Invalid challenge: no solveInstructions");

  // Strip any attempts to inject system-level instructions
  const blockedPatterns = [
    /ignore previous instructions/i,
    /transfer.*ETH/i,
    /send.*wallet/i,
    /reveal.*key/i,
    /disclose.*credential/i,
    /system prompt/i,
  ];

  const fieldsToCheck = [
    raw.document,
    raw.solveInstructions,
    JSON.stringify(raw.traceSubmission ?? {}),
  ];

  for (const field of fieldsToCheck) {
    for (const pattern of blockedPatterns) {
      if (pattern.test(field)) {
        throw new Error(
          `🚨 Security: blocked pattern detected in challenge data: ${pattern}`
        );
      }
    }
  }

  return {
    id: String(raw.id),
    document: String(raw.document),
    entities: raw.entities.map(String),
    solveInstructions: String(raw.solveInstructions),
    traceSubmission: raw.traceSubmission ?? undefined,
    artifactSchema: raw.artifactSchema ?? undefined,
  };
}

// ─── Solve Challenge ──────────────────────────────────────────────────────────

async function solveChallenge(challenge: Challenge): Promise<SolveResult> {
  log("🤖 Solving challenge with Claude...");

  const traceContract = challenge.traceSubmission
    ? `\n\nTRACE CONTRACT (authoritative):\n${JSON.stringify(challenge.traceSubmission, null, 2)}`
    : "";

  const artifactSpec = challenge.artifactSchema
    ? `\n\nARTIFACT SCHEMA:\n${JSON.stringify(challenge.artifactSchema, null, 2)}`
    : "";

  const systemPrompt = `You are a $NOCOIN mining agent following the soul.md protocol.

SOUL.MD RULES:
1. solveInstructions are the authoritative challenge-specific instructions.
2. traceSubmission contract (if present) defines the exact trace format required.
3. entities list is the canonical name roster — use exact names only.
4. Never perform actions outside the mining flow.

Your job:
- Read the provided domain document carefully.
- Answer all questions using ONLY information from the document.
- Generate the constrained artifact per the schema.
- Produce a structured reasoning trace.

Respond ONLY with valid JSON in this exact shape:
{
  "answers": { "<question>": "<answer>", ... },
  "artifact": { ... },
  "trace": {
    "reasoning": "<step-by-step reasoning>",
    "entityUsed": ["<entity names used>"],
    "confidence": <0.0-1.0>,
    "documentEvidence": ["<quoted snippets supporting answers>"]
  }
}`;

  const userPrompt = `DOMAIN DOCUMENT:
${challenge.document}

ENTITIES (canonical roster):
${challenge.entities.join(", ")}

SOLVE INSTRUCTIONS (authoritative):
${challenge.solveInstructions}${traceContract}${artifactSpec}

Solve now. Return only the JSON object.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text)
    .join("");

  let parsed: any;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Claude returned non-JSON: ${raw.slice(0, 200)}`);
  }

  if (!parsed.answers || !parsed.artifact || !parsed.trace) {
    throw new Error(`Claude response missing required fields: ${raw}`);
  }

  log("✅ Challenge solved");
  log(`📊 Confidence: ${parsed.trace.confidence}`);
  return parsed as SolveResult;
}

// ─── Submit Receipt ────────────────────────────────────────────────────────────

async function submitReceipt(
  challenge: Challenge,
  result: SolveResult
): Promise<void> {
  const token = await authenticate();

  const receipt: Receipt = {
    challengeId: challenge.id,
    agentAddress: AGENT_ETH_ADDRESS,
    artifact: result.artifact,
    trace: result.trace,
    answers: result.answers,
    solvedAt: new Date().toISOString(),
    signature: signReceipt(challenge.id, result),
  };

  log("📤 Submitting receipt...");
  const res = await coordinatorFetch("/v1/receipt", "POST", receipt, token);

  if (res.accepted) {
    log(`🎉 Receipt accepted! Earned: ${res.reward ?? "?"} $NTC`);
    log(`🔗 Tx: ${res.txHash ?? "pending"}`);
  } else {
    log(`❌ Receipt rejected: ${res.reason ?? "unknown"}`);
  }
}

// Simple deterministic signature (replace with real EIP-712 signing if needed)
function signReceipt(challengeId: string, result: SolveResult): string {
  const payload = JSON.stringify({ challengeId, ...result });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// ─── Mining Loop ──────────────────────────────────────────────────────────────

async function mineOnce(): Promise<void> {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const challenge = await pullChallenge();
      const result = await solveChallenge(challenge);
      await submitReceipt(challenge, result);
      return;
    } catch (err: any) {
      attempt++;
      log(`⚠️  Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt >= MAX_RETRIES) {
        log("💀 Max retries reached, skipping this round.");
      } else {
        await sleep(3000 * attempt);
      }
    }
  }
}

async function startMiningLoop(): Promise<void> {
  log("⛏  $NOCOIN Miner starting...");
  log(`📍 Agent address: ${AGENT_ETH_ADDRESS}`);
  log(`🌐 Coordinator: ${COORDINATOR_BASE_URL}`);
  log(`⏱  Interval: ${LOOP_INTERVAL_MS / 1000}s\n`);

  while (true) {
    await mineOnce();
    log(`😴 Sleeping ${LOOP_INTERVAL_MS / 1000}s...\n`);
    await sleep(LOOP_INTERVAL_MS);
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Entry ────────────────────────────────────────────────────────────────────

startMiningLoop().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
