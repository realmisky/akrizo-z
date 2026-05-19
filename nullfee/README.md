# NullFee CLI

Interactive CLI runner for the **NullFee crosschain testnet** (custodial-wallet API):

- 🔁 **Auto Swap loop** — random pair, runs until on-chain test balance falls below threshold
- 🎁 **Daily Mystery Box** — single API call
- 🎰 **Daily Spin** — single API call
- 💰 Balance check, 🔄 re-login

Built as a generic, **config-driven** HTTP API client so you can adapt it to NullFee
(or any similar custodial dApp) **without touching the code** — only `.env` and
`nullfee.config.json`.

---

## Install

From repo root:

```bash
npm install
```

Already-installed deps used by this CLI: `inquirer`, `chalk`, `ora`, `dotenv`.

## Setup (one-time)

```bash
# at repo root
cp nullfee/.env.example .env
cp nullfee.config.example.json nullfee.config.json
```

Then edit:

- **`.env`** — set `NULLFEE_EMAIL` + `NULLFEE_PASSWORD`
- **`nullfee.config.json`** — see *“Filling in the config”* below

## Run

```bash
npm run nullfee
```

You'll get a menu:

```
? Mau ngapain? (Use arrow keys)
❯ 🔁  Auto Swap loop (random pair, sampai saldo abis)
  🎁  Buka Daily Mystery Box
  🎰  Daily Spin
  🚀  Run All (Box → Spin → Swap loop)
  💰  Cek saldo
  🔄  Re-login (hapus token cache)
  ──────────────
  ❌  Keluar
```

---

## Filling in `nullfee.config.json`

Open https://nullfee.io in your browser → press **F12** → **Network** tab →
filter **Fetch/XHR**. Check ☑ *Preserve log*.

### 1. `apiBase` + `endpoints`

For each cURL request you see, the URL splits like:

```
POST https://nullfee.io/api/auth/login
       └────── apiBase ──────┘└─ path ─┘
```

Fill `apiBase` once. Set each `endpoints.<name>.path` to its path.

### 2. `endpoints.login.tokenPath`

After successful login, look at the **Response** tab. Example:

```json
{ "data": { "token": "eyJhbGc..." } }
```

→ `"tokenPath": "data.token"`

If the response is `{ "accessToken": "..." }` → `"tokenPath": "accessToken"`.

### 3. `auth.loginBodyTemplate`

Look at the **Request Payload** of the login call. If it's:

```json
{ "username": "you@x.com", "password": "..." }
```

then change template to:

```json
{ "username": "{{EMAIL}}", "password": "{{PASSWORD}}" }
```

### 4. `auth.authHeader` / `authPrefix`

After login, look at any subsequent authenticated request's **Request Headers**.
If you see `Authorization: Bearer eyJ...`, defaults are correct.
If you see `x-access-token: eyJ...` (no prefix), set:

```json
"authHeader": "x-access-token",
"authPrefix": ""
```

### 5. `swap.bodyTemplate`

Click any swap in the app and inspect the **Request Payload** of the swap call.
Replace dynamic values with placeholders:

| Placeholder         | What it gets replaced with             |
| ------------------- | -------------------------------------- |
| `{{TOKEN_IN_SYMBOL}}`  | symbol of source token (e.g. `USDT`) |
| `{{TOKEN_IN_ID}}`      | `id` field from `swap.tokens[i]`      |
| `{{TOKEN_IN_ADDR}}`    | `address` field from `swap.tokens[i]` |
| `{{TOKEN_OUT_SYMBOL}}` | symbol of destination token           |
| `{{TOKEN_OUT_ID}}`     | id of destination token               |
| `{{TOKEN_OUT_ADDR}}`   | address of destination token          |
| `{{AMOUNT}}`           | random amount per iteration           |

Example: real payload `{ "from": "USDT", "to": "ETH", "amount": "2.34" }`
→ template:

```json
{ "from": "{{TOKEN_IN_SYMBOL}}", "to": "{{TOKEN_OUT_SYMBOL}}", "amount": "{{AMOUNT}}" }
```

### 6. `swap.tokens`

List all tokens you want included in random pairing. At minimum 2.

```json
[
  { "symbol": "USDT", "id": "1", "decimals": 6 },
  { "symbol": "USDC", "id": "2", "decimals": 6 },
  { "symbol": "ETH",  "id": "3", "decimals": 18 }
]
```

### 7. `swap.balanceField` + `minBalance`

Inspect the balance endpoint response, e.g.:

```json
{ "data": { "balance": "1234.56", "address": "0x..." } }
```

→ `"balanceField": "data.balance"` and `"minBalance": 1` (loop stops when value drops
below `minBalance`).

If you don't have a balance endpoint, set `endpoints.balance` to `null` and the loop
will rely on `maxIterations` + the swap call returning *insufficient balance* errors.

### 8. `mysteryBox` / `dailySpin`

Most quest endpoints take an empty body (`{}`) or no body at all. If they need a
specific payload, set it via `bodyTemplate`.

---

## Behavior

- **Auto-resume**: token cached in `.nullfee-state/session.json` for 1h. CLI re-uses
  it on next run; on `401`/`403` it tells you to re-login.
- **Random delays** (`delaySecondsRange.min`–`max`) between swaps to look human.
- **Auto-stop**: swap loop breaks when (a) `balance < minBalance`, (b) API returns
  `insufficient balance`, (c) `401/403` unauthorized, or (d) `maxIterations` reached.
- **Quest cooldowns** (`already claimed`, `cooldown`, `tomorrow`, `24h`) are
  detected and shown as warnings (not errors).
- **429 / 5xx** → automatic exponential-ish backoff (3 attempts).

---

## Security

- `.env` and `nullfee.config.json` are gitignored — never committed.
- Token cache (`.nullfee-state/`) is gitignored.
- Use a dedicated **testnet account** — do not enter mainnet credentials.

---

## Troubleshooting

**“Login response did not contain a string token at …”**
Your `endpoints.login.tokenPath` is wrong. Open DevTools, look at the login response
JSON, and use the dot-path to the token field.

**“Swap failed: HTTP 400 :: validation …”**
Your `swap.bodyTemplate` doesn't match the API. Compare side-by-side with the real
request payload in DevTools.

**Loop never stops**
Either `balanceField` is wrong (returning `null`), or the API never returns
`insufficient balance`. Set a smaller `maxIterations` as safety net.
