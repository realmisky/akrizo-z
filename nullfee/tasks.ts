import { HttpClient, HttpError } from "./client";
import type { NullFeeConfig } from "./config";
import { log } from "./logger";
import {
  applyTemplate,
  getDeep,
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

export async function runSwapLoop(
  cfg: NullFeeConfig,
  client: HttpClient
): Promise<void> {
  const { tokens, amountRange, delaySecondsRange, minBalance, maxIterations } =
    cfg.swap;

  log.info(`Tokens:        ${tokens.map((t) => t.symbol).join(", ")}`);
  log.info(`Amount range:  ${amountRange.min} – ${amountRange.max}`);
  log.info(`Delay range:   ${delaySecondsRange.min} – ${delaySecondsRange.max}s`);
  if (minBalance != null) {
    log.info(`Stop when balance < ${minBalance} (${cfg.swap.balanceField || "?"})`);
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

    const [tIn, tOut] = pickTwoDifferent(tokens);
    const amount = randomFloat(amountRange.min, amountRange.max, tIn.decimals ?? 6);

    log.step(`#${i}  Swap ${amount} ${tIn.symbol} → ${tOut.symbol}`);

    const body = applyTemplate(cfg.swap.bodyTemplate, {
      TOKEN_IN_SYMBOL:  tIn.symbol,
      TOKEN_IN_ID:      tIn.id      ?? "",
      TOKEN_IN_ADDR:    tIn.address ?? "",
      TOKEN_OUT_SYMBOL: tOut.symbol,
      TOKEN_OUT_ID:     tOut.id      ?? "",
      TOKEN_OUT_ADDR:   tOut.address ?? "",
      AMOUNT:           amount,
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
        if (/insufficient|balance|low|not enough/i.test(msg)) {
          log.warn("Detected insufficient balance — stop swap loop");
          break;
        }
        if (e.status === 401 || e.status === 403) {
          log.err("Unauthorized — token expired? Stopping. Try `Re-login`.");
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
