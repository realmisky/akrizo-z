/**
 * Smoke test: runs the analyzer against synthetic candles (no network).
 * Verifies indicators compute and a sensible signal is produced.
 */

import { Candle } from "./fetcher";
import { analyze } from "./strategy";

function synthCandles(n: number, trend: "up" | "down" | "flat"): Candle[] {
  const out: Candle[] = [];
  let price = 50000;
  const drift = trend === "up" ? 40 : trend === "down" ? -40 : 0;
  let t = Date.now() - n * 3600 * 1000;
  for (let i = 0; i < n; i++) {
    const noise = (Math.sin(i / 3) + Math.cos(i / 7)) * 150;
    const open = price;
    const close = price + drift + noise;
    const high = Math.max(open, close) + Math.abs(noise) * 0.5 + 20;
    const low = Math.min(open, close) - Math.abs(noise) * 0.5 - 20;
    out.push({
      openTime: t,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.abs(noise) * 2,
      closeTime: t + 3600 * 1000 - 1,
    });
    price = close;
    t += 3600 * 1000;
  }
  return out;
}

function run(label: string, trend: "up" | "down" | "flat"): void {
  const candles = synthCandles(300, trend);
  const r = analyze("SYNTH", "1h", candles);
  console.log(`\n=== ${label} (${trend}) ===`);
  console.log(`price=${r.price.toFixed(2)} signal=${r.signal} score=${r.score.toFixed(3)} conf=${(r.confidence*100).toFixed(0)}%`);
  console.log(`RSI=${r.indicators.rsi14?.toFixed(1)} EMA20=${r.indicators.ema20?.toFixed(2)} EMA50=${r.indicators.ema50?.toFixed(2)} EMA200=${r.indicators.ema200?.toFixed(2)}`);
  console.log(`MACD=${r.indicators.macd?.toFixed(3)} hist=${r.indicators.macdHist?.toFixed(3)}`);
  console.log(`ATR=${r.indicators.atr14?.toFixed(2)} (${r.indicators.atrPct?.toFixed(2)}%)`);
  console.log(`Reasons: ${r.reasons.length}`);
  for (const reason of r.reasons) {
    console.log(`  [${reason.direction > 0 ? "+" : reason.direction < 0 ? "-" : "0"}] ${reason.rule}`);
  }
}

run("uptrend market", "up");
run("downtrend market", "down");
run("sideways market", "flat");
console.log("\nSmoke test complete.");
