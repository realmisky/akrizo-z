# NullFee CLI

Interactive CLI runner for the **NullFee crosschain testnet** (custodial-wallet API):

- 🔁 **Auto Swap loop** — random crosschain bridge, runs until USD balance falls below threshold
- 🎁 **Daily Mystery Box** — single API call
- 🎰 **Daily Spin** — single API call
- 💰 Balance check, 🔄 re-login

Built as a generic, **config-driven** HTTP API client. The shipped
`nullfee.config.example.json` is **already pre-filled with confirmed NullFee
endpoints** (apiBase, login path, swap payload shape) — you only need to put
your username/password in `.env` to run.

---

## Setup

From the repo root:

```bash
npm install
cp nullfee/.env.example .env
cp nullfee.config.example.json nullfee.config.json
```

Edit **`.env`**:

```env
NULLFEE_USERNAME=your_username
NULLFEE_PASSWORD=your_password
```

That's it for happy-path NullFee.

## Run

```bash
npm run nullfee
```

Menu:

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

## What the swap loop does

For each iteration:

1. **Check balance** — `GET /api/auth/me`, read `user.balanceUsdCents`. If
   below `minBalance` → stop.
2. **Pick random pair** — two entries from `swap.pairs`. With
   `requireDifferentChains: true` (default), `fromChain ≠ toChain`.
3. **Pick random USD amount** — between `swap.amountRange.min/max`.
4. **POST `/api/swap`** with the exact NullFee body:
   ```json
   { "fromChain": "bsc", "toChain": "ethereum",
     "fromToken": "USDT", "toToken": "USDT",
     "amountUsd": 5 }
   ```
5. **Sleep** a random number of seconds (`delaySecondsRange`).
6. **Stop early** on `insufficient balance`, `401/403`, or `maxIterations`.

Any quest endpoint returning `already claimed / cooldown / 24h / tomorrow`
is shown as a warning, not an error.

---

## Auth: NullFee uses cookie sessions, not Bearer tokens

Confirmed from `POST /api/auth/login` response:

```
Set-Cookie: nullfee.sid=s%3A…; HttpOnly; Secure; SameSite=Lax
```

The CLI captures this cookie automatically via `Response.headers.getSetCookie()`,
stores it at `.nullfee-state/session.json`, and re-injects `Cookie:` on every
subsequent request. You do **not** need to configure `endpoints.login.tokenPath`.

If a future endpoint also accepts a Bearer token, set `tokenPath` and the CLI
will grab and use it alongside the cookie.

---

## Customising `nullfee.config.json`

The example ships with sensible defaults; tweak only what you need.

### `swap.pairs`

Each entry = one combination of `{chain, token}` that's valid on NullFee.

```json
{ "chain": "bsc", "token": "USDT", "decimals": 2 }
```

The CLI picks two of these per swap — first becomes `from`, second becomes `to`.

`requireDifferentChains: true` makes the loop only emit cross-chain bridges
(useful when NullFee rejects same-chain swaps).

### `swap.amountRange` / `delaySecondsRange`

```json
"amountRange":       { "min": 1, "max": 10 },   // USD per swap
"delaySecondsRange": { "min": 8, "max": 25 }    // jitter between swaps
```

### `swap.balanceField` / `minBalance`

The example uses `user.balanceUsdCents` (so $1.00 = `100`, $2.00 = `200`).
Loop stops when remaining cents fall below `minBalance`.

If you want to use `user.balanceNone` or `user.balanceBnbSatoshis` instead,
just change the dot-path.

### `mysteryBox` / `dailySpin`

If/when you find their request payloads in DevTools, fill in `bodyTemplate`:

```json
"mysteryBox": { "bodyTemplate": { "boxId": 1 } }
```

---

## How to update endpoints from DevTools

If NullFee changes a path or body shape, here's the workflow:

1. Open https://nullfee.io → press **F12** → **Network** tab → filter Fetch/XHR.
2. Trigger the action in the UI.
3. Right-click the request → **Copy → Copy as cURL (bash)**.
4. From the cURL line:
   - `https://nullfee.io/api/<X>` → `endpoints.<name>.path = "/<X>"`
   - `--data-raw '{"foo": "bar"}'` → mirror the shape into `bodyTemplate`,
     replacing dynamic values with `{{PLACEHOLDERS}}`.

### Available template placeholders

| In `auth.loginBodyTemplate`             | In `swap.bodyTemplate`            |
| --------------------------------------- | --------------------------------- |
| `{{LOGIN}}` / `{{USERNAME}}` / `{{EMAIL}}` (all = the same env value) | `{{TOKEN_IN_CHAIN}}`, `{{TOKEN_OUT_CHAIN}}` |
| `{{PASSWORD}}`                          | `{{TOKEN_IN_TOKEN}}`, `{{TOKEN_OUT_TOKEN}}` |
|                                         | `{{TOKEN_IN_LABEL}}`, `{{TOKEN_OUT_LABEL}}` |
|                                         | `{{AMOUNT}}` *(numeric — type preserved when used standalone)* |

> **Type preservation:** if your template has `"amountUsd": "{{AMOUNT}}"` and
> the value is `5`, the output JSON is `{ "amountUsd": 5 }` (number), not
> `{ "amountUsd": "5" }` (string). Crucial for APIs that validate types
> strictly — like NullFee.

---

## Security

- `.env` and `nullfee.config.json` are gitignored — never committed.
- Session cookie cached at `.nullfee-state/session.json`, also gitignored,
  expires after 1 hour client-side (server may invalidate sooner).
- Use a dedicated **testnet account** — do not enter mainnet credentials.

---

## Troubleshooting

**“NULLFEE_USERNAME missing in .env”** → fill it in. Aliases:
`NULLFEE_LOGIN`, `NULLFEE_EMAIL`.

**“Login returned 200 but no session was established”** → the API didn't send
a `Set-Cookie` and didn't return a token. Open DevTools and check what's
actually happening on a successful login.

**Swap fails with `validation` / `400`** → your `bodyTemplate` doesn't match
NullFee's expected shape. Compare side-by-side with the **Payload** tab of a
successful swap in DevTools.

**Loop never stops** → `balanceField` returns `null` (wrong dot-path) or the
API doesn't error on insufficient funds. Set a smaller `maxIterations` as
safety net.

**`401 Unauthorized` partway through** → session cookie expired. Pick
`🔄  Re-login (hapus token cache)` from the menu.
