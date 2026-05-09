/**
 * Pluggable LLM client.
 *
 * Supports two providers:
 *   - "anthropic" : Claude via official SDK (requires ANTHROPIC_API_KEY)
 *   - "ollama"    : Local model via Ollama HTTP API (default http://127.0.0.1:11434)
 *
 * The agent only ever asks the LLM for one thing: a JSON object matching a
 * fixed schema. Neither provider is given tools or the ability to act; the
 * agent itself decides what to do with the returned JSON.
 */

import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "ollama";

export interface LLMConfig {
  provider: Provider;
  model: string;
  /** Only used for ollama. */
  baseUrl?: string;
  /** Only used for anthropic. */
  apiKey?: string;
}

export interface LLMRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LLM {
  complete(req: LLMRequest): Promise<string>;
  describe(): string;
}

export function createLLM(cfg: LLMConfig): LLM {
  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicLLM(cfg);
    case "ollama":
      return new OllamaLLM(cfg);
    default:
      throw new Error(`Unknown LLM provider: ${cfg.provider}`);
  }
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

class AnthropicLLM implements LLM {
  private client: Anthropic;
  private model: string;

  constructor(cfg: LLMConfig) {
    if (!cfg.apiKey) {
      throw new Error(
        "anthropic provider requires apiKey (ANTHROPIC_API_KEY env var)"
      );
    }
    this.client = new Anthropic({ apiKey: cfg.apiKey });
    this.model = cfg.model;
  }

  async complete(req: LLMRequest): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 1024,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
    return msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
  }

  describe(): string {
    return `anthropic:${this.model}`;
  }
}

// ─── Ollama (local) ───────────────────────────────────────────────────────────

class OllamaLLM implements LLM {
  private baseUrl: string;
  private model: string;

  constructor(cfg: LLMConfig) {
    this.baseUrl = (cfg.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    this.model = cfg.model;
  }

  async complete(req: LLMRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        options: { num_predict: req.maxTokens ?? 1024 },
      }),
    });
    if (!res.ok) {
      throw new Error(`ollama ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }

  describe(): string {
    return `ollama:${this.model}@${this.baseUrl}`;
  }
}

// ─── JSON extraction helper ───────────────────────────────────────────────────

/**
 * Pull the first top-level JSON object out of a model response, tolerating
 * ```json fences and leading/trailing prose.
 */
export function extractJson<T = unknown>(raw: string): T {
  const stripped = raw.replace(/```json\s*|```/g, "").trim();
  // Find first { ... last }
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`no JSON object in model output: ${raw.slice(0, 200)}`);
  }
  const slice = stripped.slice(start, end + 1);
  try {
    return JSON.parse(slice) as T;
  } catch (e) {
    throw new Error(
      `invalid JSON from model: ${(e as Error).message}\nraw: ${slice.slice(0, 400)}`
    );
  }
}
