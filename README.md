# akrizo-z

A small `soul.md`-style LLM agent that **triages GitHub issues**.

It polls a repo for issues tagged `needs-triage`, reads each one, and asks an
LLM to produce a structured triage plan: summary, category, severity,
suggested labels, and follow-up questions for the reporter. Then — in dry-run
mode by default — it either prints the plan or posts a single comment and
applies labels from an explicit allowlist.

**What it will never do:** close, lock, edit, delete, assign, transfer,
apply labels outside the allowlist, or touch PRs. See [`soul.md`](./soul.md)
for the full charter.

---

## Install

```bash
npm install
cp .env.example .env
# edit .env
```

## Run

```bash
npm start          # runs with ts-node, reads .env via your shell
```

Or compile first:

```bash
npm run build
node dist/agent.js
```

## Configuration

See [`.env.example`](./.env.example). The important knobs:

| Var               | Default              | Notes                                              |
| ----------------- | -------------------- | -------------------------------------------------- |
| `GITHUB_OWNER`    | —                    | Required.                                          |
| `GITHUB_REPO`     | —                    | Required.                                          |
| `GITHUB_TOKEN`    | —                    | Fine-grained PAT, `Issues: Read & Write` only.     |
| `LLM_PROVIDER`    | `anthropic`          | Or `ollama` for a local model.                     |
| `LLM_MODEL`       | provider default     | e.g. `claude-sonnet-4-20250514` or `llama3.1`.     |
| `DRY_RUN`         | `true`               | Must be literal `false` to actually post comments. |
| `TRIAGE_LABEL`    | `needs-triage`       | Only issues with this label are candidates.        |
| `APPLIED_MARKER`  | `triaged-by-agent`   | Added to each issue after triage.                  |
| `ALLOWED_LABELS`  | `bug,enhancement,…`  | Hard allowlist for label application.              |

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│ every POLL_INTERVAL_MS:                                     │
│                                                             │
│   list open issues labeled $TRIAGE_LABEL                    │
│       └─ skip ones already carrying $APPLIED_MARKER         │
│                                                             │
│   for each candidate:                                       │
│       llm.complete(system=soul + schema, user=title+body)   │
│       validate JSON + clamp labels to allowlist             │
│       dry-run? → log the plan                               │
│       else    → comment + addLabels (incl. marker)          │
└─────────────────────────────────────────────────────────────┘
```

The LLM only ever returns JSON. It is never given tools. Every GitHub
write is performed by the agent process, against the allowlist, with the
`APPLIED_MARKER` added so the same issue isn't re-triaged on the next
cycle.

## Using a local model

No API key, no third-party inference:

```bash
# in one terminal
ollama run llama3.1

# in another
LLM_PROVIDER=ollama LLM_MODEL=llama3.1 npm start
```

## Trying it safely

1. Point it at a **test repo you own.**
2. Create a label `needs-triage`, open a few issues, and add the label.
3. Run with default `DRY_RUN=true` and read the planned comments/labels
   in the terminal.
4. Only flip `DRY_RUN=false` once you're happy with what it would do.
