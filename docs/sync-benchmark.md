# Sync Benchmark

| Run size | Success | Failed | Jobs fetched | New | Updated | Duplicate | Duration |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 3 | 1 | 2 | 0 | 0 | 0 | 0 | 12s |
| 10 | 3 | 7 | 0 | 0 | 0 | 0 | 34s |
| 25 | 3 | 8 | 0 | 0 | 0 | 0 | 122s |
| 50 | 3 | 7 | 0 | 0 | 0 | 0 | 125s |

## Raw Benchmark Metrics

| runSize | durationMs | averageSourceDurationMs | p50 | p95 | p99 | failureRate | taskAbandonment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 12135 | 1352 | 1233 | 2408 | 2408 | 0.6666666666666666 | false |
| 10 | 33826 | 1196 | 776 | 2462 | 2462 | 0.7 | false |
| 25 | 121730 | 492 | 0 | 2539 | 2653 | 0.32 | true |
| 50 | 125381 | 247 | 0 | 1796 | 2493 | 0.14 | true |
