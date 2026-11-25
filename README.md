# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bro-jack/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bro-jack/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar for make.fun `token-radar-01`: reads the sealed DefiLlama snapshot, fits an OLS log-log value model and a peer-record token-odds model on the snapshot's own live-token comps, ranks pre-token protocols by implied value, and writes a static dashboard.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=7xkxffzs&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

# Token Radar v1 — model radar-2

- `main.ts` — Node 22, standard library only. Reads `/input/snapshot.json`,
  writes `/output/board.json`, `/output/data.js`, copies `dashboard/` and
  `screenshots/` to `/output`, writes `/output/dossier.json`.
- `lib/model.ts` — value + odds models, farm economics, board building.
- `dashboard/` — static page, no network. Board, per-protocol detail view, filters.
- `vendor/makefun-board.ts` — kit vendored file, used by `main.ts` for dossier.
- `screenshots/` — 1-board.png, 2-detail.png, 3-filtered.png (1440×900).

Local run:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
```

Board v1: 198 rows, watchlist 40/40, 39 FARM / 114 MARGINAL / 45 SKIP.
LOO miss ×3.44, walk-forward ×2.23 (starter ×4.46).

Status: v1 built; screenshots done, dossier built, board deterministic.
