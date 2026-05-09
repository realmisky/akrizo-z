/**
 * Pure-math technical indicators. Zero dependencies.
 * All functions operate on a chronologically ordered array of closes (or OHLC).
 * They return arrays aligned to the input (leading undefineds where not enough data).
 */

export type Num = number | undefined;

/** Simple Moving Average */
export function sma(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(undefined);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential Moving Average */
export function ema(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(undefined);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  // seed with SMA of first `period` values
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    const curr = values[i] * k + prev * (1 - k);
    out[i] = curr;
    prev = curr;
  }
  return out;
}

/** Wilder's smoothed average (used by RSI / ATR) */
function wilder(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(undefined);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Relative Strength Index (Wilder, default 14) */
export function rsi(closes: number[], period = 14): Num[] {
  const out: Num[] = new Array(closes.length).fill(undefined);
  if (closes.length <= period) return out;
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const avgGain = wilder(gains.slice(1), period);
  const avgLoss = wilder(losses.slice(1), period);
  for (let i = 0; i < avgGain.length; i++) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g === undefined || l === undefined) continue;
    const rs = l === 0 ? 100 : g / l;
    out[i + 1] = l === 0 ? 100 : 100 - 100 / (1 + rs);
  }
  return out;
}

/** MACD: returns { macd, signal, histogram } */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: Num[]; signal: Num[]; histogram: Num[] } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line: Num[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== undefined && s !== undefined ? f - s : undefined;
  });
  // signal = EMA of macd line (compacted, then re-aligned)
  const firstIdx = line.findIndex((v) => v !== undefined);
  const compact = firstIdx === -1 ? [] : (line.slice(firstIdx) as number[]);
  const signalCompact = ema(compact, signalPeriod);
  const signal: Num[] = new Array(closes.length).fill(undefined);
  for (let i = 0; i < signalCompact.length; i++) {
    signal[firstIdx + i] = signalCompact[i];
  }
  const histogram: Num[] = line.map((m, i) => {
    const s = signal[i];
    return m !== undefined && s !== undefined ? m - s : undefined;
  });
  return { macd: line, signal, histogram };
}

/** Bollinger Bands (default 20, 2) */
export function bollinger(
  closes: number[],
  period = 20,
  stdDev = 2,
): { upper: Num[]; middle: Num[]; lower: Num[]; bandwidth: Num[] } {
  const middle = sma(closes, period);
  const upper: Num[] = new Array(closes.length).fill(undefined);
  const lower: Num[] = new Array(closes.length).fill(undefined);
  const bandwidth: Num[] = new Array(closes.length).fill(undefined);
  for (let i = period - 1; i < closes.length; i++) {
    const mean = middle[i]!;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (closes[j] - mean) ** 2;
    }
    const sd = Math.sqrt(variance / period);
    upper[i] = mean + stdDev * sd;
    lower[i] = mean - stdDev * sd;
    bandwidth[i] = (upper[i]! - lower[i]!) / mean;
  }
  return { upper, middle, lower, bandwidth };
}

/** Average True Range (Wilder, default 14) */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): Num[] {
  const trs: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trs.push(tr);
  }
  const smoothed = wilder(trs.slice(1), period);
  const out: Num[] = new Array(closes.length).fill(undefined);
  for (let i = 0; i < smoothed.length; i++) out[i + 1] = smoothed[i];
  return out;
}

/** Percentage change between two values (for momentum checks) */
export function pctChange(a: number, b: number): number {
  return ((b - a) / a) * 100;
}

/** Last defined value in a Num[] */
export function last<T>(arr: (T | undefined)[]): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== undefined) return arr[i];
  return undefined;
}
