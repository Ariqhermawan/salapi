# Git hooks (shared)

These hooks are version-controlled and activated via `core.hooksPath`.

**After cloning, every teammate runs this once:**

```
git config core.hooksPath .githooks
```

(That points Git at this folder instead of the local, un-shared `.git/hooks/`.)

## `pre-commit` — secret / dotenv safety net

Blocks a commit (exit 1) if it stages:

- any **dotenv** file — `.env`, `.env.local`, `web/.env.local`, `.env.local.bak`, `prod.env`, etc. Templates (`.env.example`, `.env.sample`, `.env.template`) are allowed.
- any **added line** containing an obvious secret: a Stellar secret key (`S…` 56-char base32), a JWT / Supabase service-role token (`eyJ…`), or a `WALLET_ENC_KEY=<base64>` assignment.

A bare `process.env.WALLET_ENC_KEY` reference in code, or base64 in a test, does **not** trigger it. It's a safety net on top of `.gitignore`.

**Emergency bypass** (discouraged): `git commit --no-verify`.

> Why this exists: a security audit found the AES wallet-encryption master key and the Supabase service-role key sitting in `web/.env.local` (gitignored, never committed). This hook is the second line of defense against a stray `git add .`.
