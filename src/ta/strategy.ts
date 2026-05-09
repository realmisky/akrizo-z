/**
 * Strategy engine: combines multiple indicators into a final signal
 * (BUY / SELL / HOLD) with a confidence score and human-readable reasons.
 *
 * Scoring: each rule contributes weight in [-w, +w]. Final score is a
 * weighted vote. Confidence is |score| / maxPossible.
 *
 * This is a learning/analysis tool — not financial advice.
 */

import { Candle } from "./fetcher";
import {
  atr,
  bollinger,
  ema,
  last,
  macd,
  rsi,
  sma,
} from "./indicators";

export type Signal = "BUY" | "SELL" | "HOLD";

export interface Reason {
  rule: string;
  direction: 1 | -1 | 0;
  weight: number;
  detail: string;
}

export interface StrategyReport {
  symbol: string;
  interval: string;
  price: number;
  signal: Signal;
  score: number;         // signed [-1, 1]
  confidence: number;    // [0, 1]
  reasons: Reason[];
  indicators: {
    rsi14?: number;
    ema20?: number;
    ema50?: number;
    ema200?: number;
    macd?: number;
    macdSignal?: number;
    macdHist?: number;
    bbUpper?: number;
    bbMiddle?: number;
    bbLower?: number;
    bbPct?: number;      // position within band, 0 = lower, 1 = upper
    atr14?: number;
    atrPct?: number;     // atr as % of price (volatility)
  };
  riskSuggestion?: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    rr: number;          // reward:risk ratio
  };
}

export function analyze(
  symbol: string,
  interval: string,
  candles: Candle[],
): StrategyReport {
  if (candles.length < 210) {
    throw new Error(
      `Need at least 210 candles for full analysis, got ${candles.length}`,
    );
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const price = closes[closes.length - 1];

  const rsi14Arr = rsi(closes, 14);
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const ema200Arr = ema(closes, 200);
  const macdObj = macd(closes, 12, 26, 9);
  const bb = bollinger(closes, 20, 2);
  const atr14Arr = atr(highs, lows, closes, 14);
  const sma20Vol = sma(candles.map((c) => c.volume), 20);

  const rsi14 = last(rsi14Arr);
  const ema20Last = last(ema20Arr);
  const ema50Last = last(ema50Arr);
  const ema200Last = last(ema200Arr);
  const macdLast = last(macdObj.macd);
  const macdSigLast = last(macdObj.signal);
  const macdHistLast = last(macdObj.histogram);
  const bbUpper = last(bb.upper);
  const bbMiddle = last(bb.middle);
  const bbLower = last(bb.lower);
  const atr14 = last(atr14Arr);

  const bbPct =
    bbUpper !== undefined && bbLower !== undefined
      ? (price - bbLower) / (bbUpper - bbLower)
      : undefined;
  const atrPct = atr14 !== undefined ? (atr14 / price) * 100 : undefined;

  const reasons: Reason[] = [];

  // Rule 1: trend via EMA50 / EMA200 (golden / death cross state)
  if (ema50Last !== undefined && ema200Last !== undefined) {
    if (ema50Last > ema200Last) {
      reasons.push({
        rule: "Trend (EMA50 > EMA200)",
        direction: 1,
        weight: 0.25,
        detail: `bullish macro trend: EMA50=${ema50Last.toFixed(2)} > EMA200=${ema200Last.toFixed(2)}`,
      });
    } else {
      reasons.push({
        rule: "Trend (EMA50 < EMA200)",
        direction: -1,
        weight: 0.25,
        detail: `bearish macro trend: EMA50=${ema50Last.toFixed(2)} < EMA200=${ema200Last.toFixed(2)}`,
      });
    }
  }

  // Rule 2: price vs EMA20 (short-term momentum)
  if (ema20Last !== undefined) {
    if (price > ema20Last) {
      reasons.push({
        rule: "Short-term momentum (price > EMA20)",
        direction: 1,
        weight: 0.15,
        detail: `price ${price.toFixed(2)} above EMA20 ${ema20Last.toFixed(2)}`,
      });
    } else {
      reasons.push({
        rule: "Short-term momentum (price < EMA20)",
        direction: -1,
        weight: 0.15,
        detail: `price ${price.toFixed(2)} below EMA20 ${ema20Last.toFixed(2)}`,
      });
    }
  }

  // Rule 3: RSI zones
  if (rsi14 !== undefined) {
    if (rsi14 < 30) {
      reasons.push({
        rule: "RSI oversold",
        direction: 1,
        weight: 0.20,
        detail: `RSI=${rsi14.toFixed(1)} < 30 — potential reversal up`,
      });
    } else if (rsi14 > 70) {
      reasons.push({
        rule: "RSI overbought",
        direction: -1,
        weight: 0.20,
        detail: `RSI=${rsi14.toFixed(1)} > 70 — potential reversal down`,
      });
    } else if (rsi14 >= 50) {
      reasons.push({
        rule: "RSI neutral-bullish",
        direction: 1,
        weight: 0.08,
        detail: `RSI=${rsi14.toFixed(1)} in 50–70 band`,
      });
    } else {
      reasons.push({
        rule: "RSI neutral-bearish",
        direction: -1,
        weight: 0.08,
        detail: `RSI=${rsi14.toFixed(1)} in 30–50 band`,
      });
    }
  }

  // Rule 4: MACD histogram + cross
  if (macdLast !== undefined && macdSigLast !== undefined && macdHistLast !== undefined) {
    // need previous hist to detect cross
    const hist = macdObj.histogram;
    const prevHist = hist[hist.length - 2];
    if (macdLast > macdSigLast && prevHist !== undefined && prevHist <= 0 && macdHistLast > 0) {
      reasons.push({
        rule: "MACD bullish cross",
        direction: 1,
        weight: 0.20,
        detail: `MACD ${macdLast.toFixed(3)} crossed above signal ${macdSigLast.toFixed(3)}`,
      });
    } else if (macdLast < macdSigLast && prevHist !== undefined && prevHist >= 0 && macdHistLast < 0) {
      reasons.push({
        rule: "MACD bearish cross",
        direction: -1,
        weight: 0.20,
        detail: `MACD ${macdLast.toFixed(3)} crossed below signal ${macdSigLast.toFixed(3)}`,
      });
    } else if (macdHistLast > 0) {
      reasons.push({
        rule: "MACD positive histogram",
        direction: 1,
        weight: 0.10,
        detail: `histogram=${macdHistLast.toFixed(3)} (MACD above signal)`,
      });
    } else {
      reasons.push({
        rule: "MACD negative histogram",
        direction: -1,
        weight: 0.10,
        detail: `histogram=${macdHistLast.toFixed(3)} (MACD below signal)`,
      });
    }
  }

  // Rule 5: Bollinger Band position
  if (bbPct !== undefined) {
    if (bbPct < 0.1) {
      reasons.push({
        rule: "Bollinger lower band",
        direction: 1,
        weight: 0.12,
        detail: `price near lower band (${(bbPct * 100).toFixed(0)}% of range)`,
      });
    } else if (bbPct > 0.9) {
      reasons.push({
        rule: "Bollinger upper band",
        direction: -1,
        weight: 0.12,
        detail: `price near upper band (${(bbPct * 100).toFixed(0)}% of range)`,
      });
    }
  }

  // Rule 6: volume confirmation
  const lastVol = candles[candles.length - 1].volume;
  const volAvg = last(sma20Vol);
  if (volAvg !== undefined && lastVol > volAvg * 1.5) {
    // volume spike confirms the prevailing candle's direction
    const lastCandle = candles[candles.length - 1];
    const bullishCandle = lastCandle.close > lastCandle.open;
    reasons.push({
      rule: "Volume spike",
      direction: bullishCandle ? 1 : -1,
      weight: 0.08,
      detail: `vol=${lastVol.toFixed(0)} vs 20-avg ${volAvg.toFixed(0)} (${bullishCandle ? "bullish" : "bearish"} candle)`,
    });
  }

  // Weighted score
  let score = 0;
  let maxScore = 0;
  for (const r of reasons) {
    score += r.direction * r.weight;
    maxScore += r.weight;
  }
  const normScore = maxScore === 0 ? 0 : score / maxScore;
  const confidence = Math.min(1, Math.abs(normScore));

  let signal: Signal = "HOLD";
  if (normScore > 0.25) signal = "BUY";
  else if (normScore < -0.25) signal = "SELL";

  // Risk suggestion using ATR (only if we have a directional bias)
  let riskSuggestion: StrategyReport["riskSuggestion"];
  if (atr14 !== undefined && signal !== "HOLD") {
    const entry = price;
    const stopDist = atr14 * 1.5;
    const tpDist = atr14 * 3.0;
    if (signal === "BUY") {
      riskSuggestion = {
        entry,
        stopLoss: entry - stopDist,
        takeProfit: entry + tpDist,
        rr: tpDist / stopDist,
      };
    } else {
      riskSuggestion = {
        entry,
        stopLoss: entry + stopDist,
        takeProfit: entry - tpDist,
        rr: tpDist / stopDist,
      };
    }
  }

  return {
    symbol,
    interval,
    price,
    signal,
    score: normScore,
    confidence,
    reasons,
    indicators: {
      rsi14,
      ema20: ema20Last,
      ema50: ema50Last,
      ema200: ema200Last,
      macd: macdLast,
      macdSignal: macdSigLast,
      macdHist: macdHistLast,
      bbUpper,
      bbMiddle,
      bbLower,
      bbPct,
      atr14,
      atrPct,
    },
    riskSuggestion,
  };
}
