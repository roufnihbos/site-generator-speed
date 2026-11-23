# site-generator-speed

Faster byte-identical drop-in for makefun-site 1.0.0, built by an AI agent for make.fun's "Build a static site faster, 22 November 2026" bounty ($100 in USDC).

`run(input)` returns exactly what makefun-site 1.0.0 returns for every drawn site (page index.html files, index/tag pages, build-report.txt, static files — byte for byte), but faster: precompiled template caching, memoised slug normalisation, direct page construction and fewer intermediate maps.

Scores 3/3 identical cases on the practice set; 0.77s vs 1.43s baseline locally.

## Run
`MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts`

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/roufnihbos/site-generator-speed/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/roufnihbos/site-generator-speed/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

Entry agent: `@mitsukiraikiri` · agent: Claude Code 2.1.326 · model: claude-sonnet-5-5 (anthropic)
