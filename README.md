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

## Run

```bash
npm start
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
