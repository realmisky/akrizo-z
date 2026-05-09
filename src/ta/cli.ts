/**
 * CLI entry for the technical-analysis strategy tool.
 *
 *   npx ts-node src/ta/cli.ts BTCUSDT 4h
 *   npx ts-node src/ta/cli.ts ETHUSDT 1h
 *   npm run ta -- BTCUSDT 1d
 *
 * Defaults: BTCUSDT on 4h.
 */

import { fetchCandles, Interval } from "./fetcher";
import { analyze, StrategyReport } from "./strategy";

const VALID_INTERVALS: Interval[] = [
  "1m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "12h",
  "1d", "3d", "1w",
];

function fmt(n: number | undefined, d = 2): string {
  return n === undefined ? "—" : n.toFixed(d);
}

function color(text: string, code: number): string {
  return `\x1b[${code}m${text}\x1b[0m`;
}

function signalColor(sig: string): string {
  if (sig === "BUY") return color(sig, 32);   // green
  if (sig === "SELL") return color(sig, 31);  // red
  return color(sig, 33);                      // yellow
}

function bar(pct: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, pct));
  const filled = Math.round(clamped * width);
  return "[" + "#".repeat(filled) + "-".repeat(width - filled) + "]";
}

function report(r: StrategyReport): void {
  const dim = (s: string) => color(s, 90);
  const bold = (s: string) => color(s, 1);

  console.log("");
  console.log(bold(`━━━ ${r.symbol} @ ${r.interval} ━━━`));
  console.log(`Price:      ${bold(fmt(r.price))}`);
  console.log(
    `Signal:     ${signalColor(r.signal)}   ` +
      dim(`score=${r.score.toFixed(3)}  confidence=${(r.confidence * 100).toFixed(0)}% ${bar(r.confidence)}`),
  );

  console.log("");
  console.log(bold("Indicators"));
  const i = r.indicators;
  console.log(`  RSI(14)     ${fmt(i.rsi14, 1)}`);
  console.log(`  EMA 20      ${fmt(i.ema20)}`);
  console.log(`  EMA 50      ${fmt(i.ema50)}`);
  console.log(`  EMA 200     ${fmt(i.ema200)}`);
  console.log(`  MACD        ${fmt(i.macd, 3)}   signal=${fmt(i.macdSignal, 3)}   hist=${fmt(i.macdHist, 3)}`);
  console.log(`  Bollinger   upper=${fmt(i.bbUpper)}  mid=${fmt(i.bbMiddle)}  lower=${fmt(i.bbLower)}  pos=${fmt(i.bbPct && i.bbPct * 100, 0)}%`);
  console.log(`  ATR(14)     ${fmt(i.atr14)}  (${fmt(i.atrPct, 2)}% of price)`);

  console.log("");
  console.log(bold("Reasons"));
  for (const reason of r.reasons) {
    const mark = reason.direction > 0 ? color("▲", 32) : reason.direction < 0 ? color("▼", 31) : color("•", 33);
    const w = dim(`(w=${reason.weight.toFixed(2)})`);
    console.log(`  ${mark} ${reason.rule.padEnd(36)} ${w}  ${dim(reason.detail)}`);
  }

  if (r.riskSuggestion) {
    console.log("");
    console.log(bold("Risk suggestion (ATR-based, 1.5x stop / 3x target)"));
    const rs = r.riskSuggestion;
    console.log(`  Entry       ${fmt(rs.entry)}`);
    console.log(`  Stop-loss   ${fmt(rs.stopLoss)}`);
    console.log(`  Take-profit ${fmt(rs.takeProfit)}`);
    console.log(`  R:R         1 : ${rs.rr.toFixed(2)}`);
  }

  console.log("");
  console.log(dim("Educational analysis only. Not financial advice."));
  console.log("");
}

async function main(): Promise<void> {
  const symbol = (process.argv[2] ?? "BTCUSDT").toUpperCase();
  const interval = (process.argv[3] ?? "4h") as Interval;
  if (!VALID_INTERVALS.includes(interval)) {
    console.error(`Invalid interval: ${interval}. Valid: ${VALID_INTERVALS.join(", ")}`);
    process.exit(1);
  }

  console.log(`Fetching ${symbol} ${interval} candles from Binance...`);
  const candles = await fetchCandles(symbol, interval, 500);
  console.log(`Got ${candles.length} candles. Running analysis...`);

  const r = analyze(symbol, interval, candles);
  report(r);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
