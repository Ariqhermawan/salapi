# Salapi — Brand Consistency Audit

**Date:** 2026-05-23
**Source of truth:** `Salapi-Logo-Kit/` (the official brand kit) — the
"Sampan" S-monogram on a community cradle. Tile gradient
`#2563EB → #1D4ED8 → #0B1220` (top-left to bottom-right). Brand indigo
`#4F46E5`. Ink `#0E1525`. White `#FFFFFF`. Wordmark "Salapi." in Geist
semibold with an indigo period.

## What I found

### ✓ Already on-brand (no change needed)

| Surface | Status |
|---|---|
| In-app `SalapiMark` SVG (`web/components/ui/brand.tsx`) | Identical paths to the kit's `salapi-icon.svg` — same cradle (`M 6 46 Q 32 60 58 46`), same S monogram (`M 41 18 A 10 10 0 1 0 32 27 A 10 10 0 1 1 23 36`). |
| `web/app/apple-icon.png` | Sampan mark on the brand-blue tile (flat fill variant — fine for iOS home-screen icon). |
| `web/app/opengraph-image.png` + `twitter-image.png` | Sampan tile + "Salapi." wordmark + tagline + "POWERED BY STELLAR". Already fully branded. |
| `web/app/favicon.ico` | Multi-resolution Sampan favicon (11 KB ICO). |
| In-app `SalapiLockup` (the mark + "Salapi." wordmark) | Used on `SignInScreen`, `OnboardingScreen`, `MarketingAside` via `Wordmark`. Composes the canonical mark. |
| Stellar partnership mark | `stellar.png` / `stellar-white.png` shipped, served by `PoweredByStellarV2`. Light + dark variants present. |
| Geist font loading | `next/font/google` for both Geist and Geist Mono — no FOUT, fonts inlined in the build. |
| PWA manifest theme + background colors | `theme_color: #1d4ed8` (brand indigo), `background_color: #0b1020` (close to brand ink). |

### Fixed inline this session

| Item | Fix |
|---|---|
| `web/public/icon.svg` — used flat `#1d4ed8` instead of the kit's 3-stop gradient. | Replaced with the kit's gradient SVG (same monogram, gradient tile). PWA install icon now matches `salapi-icon-1024.png`. |
| `web/public/{file,globe,next,vercel,window}.svg` — Next.js create-app scaffolding SVGs, **zero references** anywhere in the codebase. | Deleted. 5 files, ~3 KB. |

### Deferred / nitpick

| Item | Note |
|---|---|
| Three "ink-ish" colors in use: brand kit says ink = `#0E1525`, root layout viewport says `#0B1220`, PWA manifest background says `#0b1020`. | All three are perceptually identical (dark navy) but technically different. Pick one in `web/lib/ui/tokens.ts` and reference it everywhere if a future polish pass happens. Not a regression. |
| ~30 hardcoded hex colors across `web/components/screens/`. | Almost all are intentional one-off accents — circle cover gradients (`#FDE6D9`, `#E1ECF6`, etc.), category chip pastels (`#DDF1E5`, `#E6F6EF`), GCash blue (`#0079FF`), Google sign-in palette (`#4285F4`, `#34A853`, `#EA4335`, `#FBBC04`), Stellar accent. These are context palettes, not brand chrome — moving them to a tokenized accent map would be over-engineering. The brand-chrome colors (`#2563EB`, `#1D4ED8`, `#0B1220`, `#4F46E5`) ARE tokenized via `T.action`, `T.ink`, etc. |
| Logo Kit's `salapi-mark-{indigo,white,ink}.svg` and `salapi-mark-*-1024.png` are not currently copied into `web/public/`. | They aren't needed at runtime — the in-app `SalapiMark` component renders the same paths from inline SVG. The kit files are useful for slides / external assets only. Left in `Salapi-Logo-Kit/` (already tracked at the repo root). |

## What I did NOT find

- No competing logo files inside `web/public/`. The kit is the only source.
- No raw `<img>` tag rendering a Salapi mark anywhere in the screens. Every
  Salapi mark in the live app comes from the inline-SVG `SalapiMark`
  component, so the same brand changes in one file (`web/components/ui/brand.tsx`)
  propagate everywhere.
- No "draft" wordmarks. The only wordmark renderer is `SalapiLockup` in
  `web/components/ui/brand.tsx`.

## Net change

- `web/public/icon.svg` — updated to the kit's 3-stop gradient.
- `web/public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`
  — deleted (unused scaffolding from `create-next-app`).

Net brand surface area: smaller, more consistent, all routed through the
single canonical mark.
