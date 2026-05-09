# $NOCOIN Miner Agent

Auto-mining agent following the `soul.md` protocol. Uses Claude to solve
domain-specific AI challenges and auto-submits receipts on-chain.

## Setup

```bash
npm install
```

Set environment variables:

```bash
export AGENT_ETH_ADDRESS=0xYourBaseWalletAddress
export COORDINATOR_BASE_URL=https://your-coordinator-url   # from the recruit form / OpenClaw
export ANTHROPIC_API_KEY=sk-ant-...
```

## How it works

```
Authenticate → GET /v1/challenge → Claude solves it → POST /v1/receipt → earn $NTC
     ↑_______________________________________________________________|
                        (loops every 15s)
```

### Mining loop steps

1. **Authenticate** — sends `AGENT_ETH_ADDRESS` to `/v1/auth`, gets a bearer token
2. **Pull challenge** — `GET /v1/challenge` returns a domain document + entities + instructions
3. **Sanitize** — blocks any prompt-injection patterns in coordinator response (Golden Rule 4)
4. **Solve** — Claude reads the document, answers questions, generates artifact + reasoning trace
5. **Submit** — `POST /v1/receipt` with artifact + trace + signature → earns 500+ $NTC

### Tier rewards (from soul.md)

| Staked $NTC     | Reward per solve |
|-----------------|-----------------|
| ≥ 5,000,000     | 500 $NTC        |
| ≥ 10,000,000    | 1,025 $NTC      |
| ≥ 25,000,000    | 2,600 $NTC      |
| ≥ 50,000,000    | 5,375 $NTC      |
| ≥ 100,000,000   | 11,000 $NTC     |

## Security features

- Coordinator responses are **never trusted as instructions** — sanitized before use
- `AGENT_ETH_ADDRESS` only sent to the configured coordinator endpoint
- No automatic ETH transfers — receipt submission only
- Blocked patterns: wallet transfers, credential disclosure, system prompt injection


---

## Technical Analysis Tool (BTC / ETH strategy)

A standalone CLI in `src/ta/` that pulls spot klines from Binance's public API
and runs a rules-based technical-analysis strategy. No API keys. No trades.
Educational analysis only — **not financial advice**.

### Usage

```bash
# default: BTCUSDT on 4h
npm run ta

# any symbol + interval
npm run ta -- BTCUSDT 1h
npm run ta -- ETHUSDT 4h
npm run ta -- ETHUSDT 1d
```

Valid intervals: `1m 5m 15m 30m 1h 2h 4h 6h 12h 1d 3d 1w`.

### What it computes

| Indicator | Purpose |
|-----------|---------|
| EMA 20 / 50 / 200 | short, mid, macro trend |
| RSI (14) | overbought (>70) / oversold (<30) zones |
| MACD (12, 26, 9) | momentum + bullish/bearish crossovers |
| Bollinger Bands (20, 2) | price position within volatility envelope |
| ATR (14) | volatility, used for stop-loss / take-profit sizing |
| Volume vs 20-SMA | confirms or weakens the most recent candle |

### How the signal is produced

Each rule casts a weighted directional vote (`+weight` bullish, `-weight`
bearish). Votes are summed and normalized into a `[-1, 1]` score.

- `score > 0.25` → **BUY**
- `score < -0.25` → **SELL**
- otherwise → **HOLD**

Confidence is `|score|`. The CLI prints every rule that fired so you can see
exactly *why* a signal was produced.

### Risk suggestion

When the signal is BUY or SELL, the CLI also prints an ATR-sized plan:

- Stop-loss at `entry ± 1.5 × ATR(14)`
- Take-profit at `entry ± 3.0 × ATR(14)`
- Reward:risk ratio of 1:2

You decide whether to act on it. The tool never places orders.

### Files

- `src/ta/indicators.ts` — pure-math indicators, zero deps
- `src/ta/fetcher.ts` — Binance public klines client
- `src/ta/strategy.ts` — multi-indicator voting engine
- `src/ta/cli.ts` — command-line entry + formatted report
- `src/ta/smoke.ts` — offline synthetic-data sanity check (`npx ts-node src/ta/smoke.ts`)
