# Queue Migration Decision

Decision: C. Không đủ, phải chuyển Queues + D1

Reason: Largest run did not finish: 10/50.

Current architecture is KV-backed sync run state plus Cloudflare Worker `ctx.waitUntil`.

Benchmark evidence shows the current architecture cannot safely complete 25/50-source batches inside the configured verification window. Cloudflare Queues + D1 migration is required before increasing production sync beyond small batches.

Until migration is implemented, keep manual sync capped to 10 sources or less for safe interactive operation.
