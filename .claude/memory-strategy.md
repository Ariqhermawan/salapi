# Claude Code memory strategy (Salapi)

How Claude Code sessions on this repo persist + recall context. Two layers, ONE
source of truth — kept deliberately so agents aren't misled by stale or
self-contradicting memory.

## Layers

- **Native auto-memory** (`~/.claude/projects/<proj>/memory/*.md` + `MEMORY.md`
  index) — the curated **DURABLE source of truth**: project state, decisions,
  "what shipped", gotchas. Written deliberately. Authoritative.
- **claude-mem** ([thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)) —
  **AUTOMATIC capture + recall**: hooks each session to capture tool usage,
  AI-compresses summaries, and injects relevant prior context at session start.
  Stores locally (SQLite + Chroma at `~/.claude-mem/`, no cloud). Recall via its
  MCP `search` / `timeline` tools. An aid to recall, NOT a durable record.

## Discipline

- Durable facts live in native memory **only**. When claude-mem's auto-summary
  and native memory disagree on a durable fact, **native wins** (native was
  written deliberately; claude-mem is a snapshot).
- claude-mem **replaced** the older `remember` plugin (now disabled) as the
  single auto-recall layer. Running two auto-recall layers reintroduces memory
  drift — keep exactly one.
- claude-mem's local DB captures tool I/O, so on a secrets-bearing repo like this
  it may hold sensitive context on disk. It is machine-local — **never commit or
  push `~/.claude-mem/` or its data.**

> This file documents the setup only. The tool, its config (`~/.claude`), and its
> data (`~/.claude-mem`) are global / machine-local and are NOT part of this repo.
