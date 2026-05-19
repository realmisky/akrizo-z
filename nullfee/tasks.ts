import { HttpClient, HttpError } from "./client";
import type { NullFeeConfig, SwapPairDef } from "./config";
import { log } from "./logger";
import {
  applyTemplate,
  getDeep,
  pickRandom,
  pickTwoDifferent,
  randomFloat,
  randomInt,
  sleep,
} from "./utils";

export async function getBalance(
  cfg: NullFeeConfig,
  client: HttpClient
): Promise<{ raw: any; value: number | null }> {
  if (!cfg.endpoints.balance) return { raw: null, value: null };
  const raw = await client.request(cfg.endpoints.balance);
  if (!cfg.swap.balanceField) return { raw, value: null };
  const v = getDeep(raw, cfg.swap.balanceField);
  const num =
    typeof v === "string" ? parseFloat(v) :
    typeof v === "number" ? v : null;
  return { raw, value: Number.isFinite(num as number) ? (num as number) : null };
}

/** Pick two pair entries; if requireDifferentChains, retry until chains differ. */
function pickRandomPair(
  pairs: SwapPairDef[],
  requireDifferentChains: boolean
): [SwapPairDef, SwapPairDef] {
  for (let attempt = 0; attempt < 25; attempt++) {
    const [a, b] = pickTwoDifferent(pairs);
    if (!requireDifferentChains) return [a, b];
    if (a.chain && b.chain && a.chain !== b.chain) return [a, b];
  }
  // fallback — caller may want any pair even if chains repeat
  return pickTwoDifferent(pairs);
}

export async function runSwapLoop(
  cfg: NullFeeConfig,
  client: HttpClient
): Promise<void> {
  const {
    pairs,
    amountRange,
    delaySecondsRange,
    minBalance,
    maxIterations,
    requireDifferentChains,
  } = cfg.swap;

  log.info(`Pairs:         ${pairs.map((p) => p.label).join(", ")}`);
  log.info(`Amount range:  ${amountRange.min} – ${amountRange.max}`);
  log.info(`Delay range:   ${delaySecondsRange.min} – ${delaySecondsRange.max}s`);
  if (requireDifferentChains) log.info(`Crosschain only: yes (fromChain ≠ toChain)`);
  if (minBalance != null) {
    log.info(`Stop when ${cfg.swap.balanceField || "balance"} < ${minBalance}`);
  }
  log.info(`Max iterations: ${maxIterations}`);

  let i = 0, ok = 0, fail = 0;

  while (i < maxIterations) {
    i++;

    if (minBalance != null) {
      try {
        const { value } = await getBalance(cfg, client);
        if (value != null) {
          log.dim(`balance=${value}`);
          if (value < minBalance) {
            log.warn(`Balance ${value} < ${minBalance} — stop swap loop`);
            break;
          }
        }
      } catch (e: any) {
        log.warn(`Balance check failed: ${e.message}`);
      }
    }

    const [tIn, tOut] = pickRandomPair(pairs, !!requireDifferentChains);
    const amount = randomFloat(
      amountRange.min,
      amountRange.max,
      tIn.decimals ?? 2
    );

    log.step(`#${i}  Swap ${amount} ${tIn.label} → ${tOut.label}`);

    const body = applyTemplate(cfg.swap.bodyTemplate, {
      TOKEN_IN_CHAIN:  tIn.chain  ?? "",
      TOKEN_IN_TOKEN:  tIn.token,
      TOKEN_IN_LABEL:  tIn.label  ?? tIn.token,
      TOKEN_OUT_CHAIN: tOut.chain ?? "",
      TOKEN_OUT_TOKEN: tOut.token,
      TOKEN_OUT_LABEL: tOut.label ?? tOut.token,
      AMOUNT:          amount,
    });

    try {
      const res = await client.request(cfg.endpoints.swap, body);
      log.ok(`Swap OK: ${formatResp(res)}`);
      ok++;
    } catch (e: any) {
      const msg =
        e instanceof HttpError ? `${e.message} :: ${formatResp(e.data)}` : e.message;
      log.err(`Swap failed: ${msg}`);
      fail++;

      if (e instanceof HttpError) {
        if (/insufficient|balance|low|not enough|cannot afford/i.test(msg)) {
          log.warn("Detected insufficient balance — stop swap loop");
          break;
        }
        if (e.status === 401 || e.status === 403) {
          log.err("Unauthorized — session expired? Stopping. Try `Re-login`.");
          break;
        }
      }
    }

    const delay = randomInt(delaySecondsRange.min, delaySecondsRange.max);
    log.dim(`Sleeping ${delay}s...`);
    await sleep(delay * 1000);
  }

  log.ok(`Swap loop done. iterations=${i} ok=${ok} fail=${fail}`);
}

export async function runMysteryBox(
  cfg: NullFeeConfig,
  client: HttpClient
): Promise<void> {
  if (!cfg.endpoints.mysteryBox) {
    log.warn("Mystery Box endpoint not configured. Skipping.");
    return;
  }
  log.step("Opening Daily Mystery Box...");
  const body = cfg.mysteryBox?.bodyTemplate
    ? applyTemplate(cfg.mysteryBox.bodyTemplate, {})
    : undefined;
  try {
    const res = await client.request(cfg.endpoints.mysteryBox, body);
    log.ok(`Mystery Box: ${formatResp(res)}`);
  } catch (e: any) {
    handleQuestErr("Mystery Box", e);
  }
}

export async function runDailySpin(
  cfg: NullFeeConfig,
  client: HttpClient
): Promise<void> {
  if (!cfg.endpoints.dailySpin) {
    log.warn("Daily Spin endpoint not configured. Skipping.");
    return;
  }
  log.step("Spinning Daily Wheel...");
  const body = cfg.dailySpin?.bodyTemplate
    ? applyTemplate(cfg.dailySpin.bodyTemplate, {})
    : undefined;
  try {
    const res = await client.request(cfg.endpoints.dailySpin, body);
    log.ok(`Daily Spin: ${formatResp(res)}`);
  } catch (e: any) {
    handleQuestErr("Daily Spin", e);
  }
}

function handleQuestErr(name: string, e: any): void {
  const msg =
    e instanceof HttpError ? `${e.message} :: ${formatResp(e.data)}` : e.message;
  if (/already|claimed|cooldown|wait|tomorrow|24h|once/i.test(msg)) {
    log.warn(`${name} skipped: ${msg}`);
  } else {
    log.err(`${name} failed: ${msg}`);
  }
}

function formatResp(r: any): string {
  if (r == null) return "(empty)";
  if (typeof r === "string") return r.slice(0, 240);
  try {
    const s = JSON.stringify(r);
    return s.length > 240 ? s.slice(0, 240) + "..." : s;
  } catch {
    return String(r);
  }
}

// silence unused-import lint when pickRandom isn't directly referenced here
void pickRandom;
