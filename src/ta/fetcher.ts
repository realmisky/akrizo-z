/**
 * OHLCV fetcher using Binance's public spot klines endpoint.
 * No API key required. Free, public market data.
 *
 * Docs: https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
 */

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export type Interval =
  | "1m" | "5m" | "15m" | "30m"
  | "1h" | "2h" | "4h" | "6h" | "12h"
  | "1d" | "3d" | "1w";

const BASE = "https://api.binance.com/api/v3/klines";

export async function fetchCandles(
  symbol: string,
  interval: Interval,
  limit = 500,
): Promise<Candle[]> {
  const url = `${BASE}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance ${res.status}: ${await res.text()}`);
  }
  const raw = (await res.json()) as unknown[][];
  return raw.map((r) => ({
    openTime: Number(r[0]),
    open: parseFloat(r[1] as string),
    high: parseFloat(r[2] as string),
    low: parseFloat(r[3] as string),
    close: parseFloat(r[4] as string),
    volume: parseFloat(r[5] as string),
    closeTime: Number(r[6]),
  }));
}
