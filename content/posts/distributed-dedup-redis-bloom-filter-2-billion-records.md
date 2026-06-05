---
title: "Distributed Dedup at Scale: The Redis Bloom Filter That Replaced 16 TB of RAM"
date: 2026-06-05T10:00:00+05:30
draft: false
tags: ["data-engineering", "azure", "python", "distributed-systems", "apache-iceberg", "redis", "databricks"]
---

A major North American retailer needed to process two billion point-of-sale records. The existing architecture couldn't survive two thousand files. This is the story of the rebuild, the two dead ends we hit along the way, and the one design decision that made the whole thing scale.

The short version: the original pipeline wasn't slow because the code was bad. It was slow because the architecture was the wrong shape for the problem. No amount of tuning fixes that. You have to change the shape.

---

## The starting point

Point-of-sale XML arrives from thousands of stations every ten minutes, all day. Each file holds the transaction log for a window of activity at a site — one file per store session, across six POS vendors. They need to land in a queryable warehouse fast enough that the business can act on them.

The legacy stack was Azure Data Factory orchestrating Azure Durable Functions. It worked when the volume was small. As volume grew, it crawled. Then it simply stopped scaling.

Here are the two numbers that framed the entire project:

<div class="stat-hero reveal">
  <div class="stat-hero-cell">
    <div class="stat-hero-label">Legacy throughput</div>
    <div class="stat-hero-value bad">0.08</div>
    <div class="stat-hero-label" style="margin-top:0.4rem">files / sec</div>
    <div style="font-size:0.78rem;color:var(--secondary);margin-top:0.5rem">113 files took 23 minutes</div>
  </div>
  <div class="stat-hero-mid">
    <div class="stat-hero-gap">1,000×</div>
    <div class="stat-hero-mid-label">gap</div>
  </div>
  <div class="stat-hero-cell">
    <div class="stat-hero-label">Business requirement</div>
    <div class="stat-hero-value good">83</div>
    <div class="stat-hero-label" style="margin-top:0.4rem">files / sec</div>
    <div style="font-size:0.78rem;color:var(--secondary);margin-top:0.5rem">50K files in under 10 minutes</div>
  </div>
</div>

That is a gap of roughly **1,000×**. When you are three orders of magnitude away from where you need to be, you are not looking at a performance bug. You don't profile your way across a 1,000× gap by shaving milliseconds off a parser. The right question was never "how do we speed this up." It was "why is this architecture wrong, and what is the right one."

---

## Three architectures, two dead ends

<div class="attempt-grid reveal">
  <div class="attempt-card fail">
    <span class="attempt-tag fail">Attempt 1 · Dead End</span>
    <div class="attempt-title">ADF + Durable Functions</div>
    <div class="attempt-speed">0.08 f/s</div>
    <div class="attempt-reason">98% of time was orchestration overhead. The GIL serialized all CPU-bound parsing. The programming model structurally forbade the parallelism we needed.</div>
  </div>
  <div class="attempt-card warn">
    <span class="attempt-tag warn">Attempt 2 · Wrong Cost</span>
    <div class="attempt-title">Azure Databricks (Spark)</div>
    <div class="attempt-speed">123 f/s</div>
    <div class="attempt-reason">No GIL, 95% CPU utilization, cleared the target. But a standing cluster pays for idle time — wrong cost model for a bursty, intermittent job.</div>
  </div>
  <div class="attempt-card win">
    <span class="attempt-tag win">Attempt 3 · Shipped</span>
    <div class="attempt-title">Azure Container Apps Jobs</div>
    <div class="attempt-speed">152 f/s</div>
    <div class="attempt-reason">Process-level parallelism bypasses the GIL. Per-run billing — pay only for seconds used. 80% cost reduction vs Functions.</div>
  </div>
</div>

---

## Attempt 1: optimize inside the existing model (ADF + Durable Functions)

The instinct, and the first thing we tried, was to make the existing approach faster. We treated it as an optimization problem.

We did real work here. We profiled the pipeline end to end. We rewrote the XML parsing to a single pass instead of multiple traversals. We chunked the files into manageable ranges. We added a thread pool to parse concurrently. These are all the right moves *if the bottleneck is the work itself*.

It wasn't. When we measured where the time actually went, the result was uncomfortable:

<div class="overhead-split reveal">
  <div class="overhead-bar">
    <div class="overhead-seg waste"></div>
    <div class="overhead-seg work"></div>
  </div>
  <div class="overhead-legend">
    <span class="l-waste">▮ 98% — orchestration overhead</span>
    <span class="l-work">▮ 2% — actual work</span>
  </div>
  <div class="overhead-items">
    <div class="overhead-item">
      <span class="overhead-item-pct">~45s</span>
      <span class="overhead-item-desc">ADF GetMetadata — enumerating 50K files</span>
    </div>
    <div class="overhead-item">
      <span class="overhead-item-pct">5–6 min</span>
      <span class="overhead-item-desc">Durable orchestrator scheduling activities</span>
    </div>
    <div class="overhead-item">
      <span class="overhead-item-pct">2–3 min</span>
      <span class="overhead-item-desc">Cold starts across Function instances</span>
    </div>
    <div class="overhead-item">
      <span class="overhead-item-pct">~5 min</span>
      <span class="overhead-item-desc">Network round-trips (3 per file: download → process → upload)</span>
    </div>
    <div class="overhead-item">
      <span class="overhead-item-pct good">~17s</span>
      <span class="overhead-item-desc">Actual XML parsing (2% of total runtime)</span>
    </div>
  </div>
</div>

Breaking the 98% down revealed two walls that were not tunable — they were structural.

**The GIL.** XML parsing is CPU-bound: `ET.fromstring()`, regex extraction, flattening deeply-nested structures into flat Parquet columns. Python's Global Interpreter Lock serializes all CPU-bound work inside a single process. So threads don't run in parallel on the cores — they queue up on one lock and take turns. CPU utilization sat at roughly **35% across four cores**. The machine was mostly idle while the work waited on a lock.

**The orchestrator's design contract.** A Durable Functions orchestrator must be deterministic — it has to be able to replay its own history to recover state. That requirement means the orchestrator function itself is forbidden from doing arbitrary I/O or spawning threads. The very thing we needed (cheap, uncoordinated parallelism) is the thing the programming model is designed to prevent.

<div class="callout">
  <p><strong>You can't optimize your way out of an architecture that forbids what you need.</strong></p>
</div>

The model had to go.

---

## Attempt 2: throw a distributed engine at it (Spark)

If the problem was that Python threads couldn't parallelize CPU-bound parsing, the obvious next move was an engine built for exactly that. We moved the workload onto a distributed Spark cluster on Azure Databricks.

It worked, technically. A JVM-based engine like Spark has no GIL, so it genuinely parses across all cores in parallel. CPU utilization jumped from **35% to ~95%**. The exact constraint that had capped the Functions approach was simply gone.

The implementation read all XML files in parallel with `spark.read.text()`, extracted fields with regex rather than full namespace-aware parsing (10–30 seconds for 1,000 files versus minutes for the namespace approach), and wrote Iceberg tables to ADLS Gen2:

```python
# Parallel read across cluster — wholetext=True loads each file as one row
df = spark.read.text(path, wholetext=True, recursiveFileLookup=True)

# input_file_name() is not supported in Unity Catalog — use _metadata instead
df = df.withColumn("source_file", col("_metadata.file_path"))

# Regex extraction — faster than namespace-aware ET.fromstring across 6 vendors
site = re.search(r'<site[^>]*>(\d+)</site>', xml_content)
sales = re.search(r'<overallsales[^>]*>([^<]+)</overallsales>', xml_content)

# Archival — parallel native write instead of sequential dbutils.fs.cp
# Sequential: 5–10 min for 1K files. Parallel write: 10–30 seconds.
date_files.select("value").coalesce(1).write.mode("overwrite").text(archive_dir)
```

<div class="post-table">
<table>
<thead><tr><th>Files</th><th>Time</th><th>Throughput</th></tr></thead>
<tbody>
<tr><td>50,000</td><td>6 min 20 sec</td><td>132 files/sec</td></tr>
<tr><td>50,000</td><td>6 min 45 sec</td><td>123 files/sec (documented benchmark)</td></tr>
</tbody>
</table>
</div>

We had cleared the 83 files/sec target. So why isn't this the end of the story?

**Economics.** A Spark cluster is, in practice, an always-on resource. You pay for cluster-hours whether or not work is flowing. Our actual job is a short burst that runs every ten minutes and finishes in minutes. Paying for a standing, always-on distributed cluster to service a small, bursty, intermittent job is the wrong cost structure.

**Unity Catalog bugs worth documenting** — none of these are well-surfaced in the Databricks docs:

<div class="post-table">
<table>
<thead><tr><th>Bug</th><th>Fix</th></tr></thead>
<tbody>
<tr><td><code>input_file_name()</code> throws in Unity Catalog</td><td>Use <code>col("_metadata.file_path")</code></td></tr>
<tr><td><code>dbutils</code> inside UDFs is not serializable</td><td>Use native Spark write operations</td></tr>
<tr><td><code>spark.read.format("binaryFile")</code> + cast</td><td>Use <code>spark.read.text(wholetext=True)</code> directly — 3–5× faster</td></tr>
<tr><td>Sequential <code>dbutils.fs.cp</code> archival</td><td>Takes 5–10 min per 1K files; parallel <code>.write.text()</code> does it in 10–30 sec</td></tr>
<tr><td><code>databricks jobs create</code> + <code>run-now</code> hangs</td><td>Jobs stuck in PENDING — use <code>databricks runs submit</code> with <code>existing_cluster_id</code></td></tr>
<tr><td>New cluster with <code>i3.xlarge</code></td><td>AWS-only node type — use <code>Standard_D4s_v3</code> / <code>Standard_D8s_v3</code> on Azure</td></tr>
</tbody>
</table>
</div>

<div class="insight">
  <strong>Conclusion from Attempt 2:</strong> fast is not the same as right. Spark proved the parallelism was achievable. It did not prove it was achievable at a cost that made sense. We needed the parallelism of Attempt 2 with a pay-for-what-you-use cost model.
</div>

---

## Attempt 3: serverless containers (the one we shipped)

The shipped architecture keeps the parallelism and fixes the economics. Instead of one process trying to use threads (blocked by the GIL), or a permanent cluster (wrong cost model), we run a fleet of **serverless container jobs**.

The key insight is about *where* the parallelism lives. Each container is its own operating-system process with its own Python interpreter and therefore **its own GIL**. The GIL only serializes threads *within* a single process. It says nothing about separate processes. Parallelize across processes instead of threads and the GIL stops being a ceiling.

Azure Container Apps Jobs give us process-level parallelism on a per-run billing model. The job spins up, does its work, and spins down. We pay for the seconds we actually run.

A single container job runs in four phases:

1. **File discovery.** The job enumerates its blobs directly from staging storage — no separate ADF discovery hop and no 45-second enumeration tax on every run.
2. **Parallel XML parse.** A `ThreadPoolExecutor(max_workers=100)` handles the I/O-bound parts (downloading, archiving), while the CPU-bound parsing is distributed across containers. Each file is downloaded, archived to the bronze layer as an immutable raw copy, parsed in a single pass, and collected into memory.
3. **Parallel Iceberg write.** A second pool of 10 workers writes parsed records as PyArrow Parquet (Snappy, 2,500 records per batch) into Apache Iceberg tables — schema enforced at every write.
4. **Snowflake refresh.** Snowflake external tables are pointed at the Iceberg data and refreshed. Data is queried *in place* — there is no second copy loaded into Snowflake.

![Four-phase single container job architecture](/images/circlek-four-phase-diagram.png)

The single-pass XML parser produces both silver and bronze output from one traversal — no second pass over the file:

```python
class CompleteXMLParser:
    def extract_all_data_single_pass(self, xml_content: str):
        root = ET.fromstring(xml_content)
        # Strip {urn:vfi-sapphire:tlog.2003-06-27} from all tag names
        # Attributes become element_attr{name} columns
        # Elements with both text and children: element_tagvalue for text
        # Produces: header_record, line_records[], discount_records[]
        #       AND bronze_flat_record (all Parquet columns) simultaneously
```

Silver output — three fact tables in Iceberg:
- `sales_header` — site, date, sequence number, totals
- `sales_line` — UPC, item name, quantity, amounts
- `sales_discount` — promotion and discount details

The original architecture diagram with full storage layer detail:

![Container App Job — four-phase architecture with ADLS storage layers](/images/circlek-container-pipeline.jpg)

**Results:**

<div class="post-table">
<table>
<thead><tr><th>Test</th><th>Files</th><th>Time</th><th>Throughput</th></tr></thead>
<tbody>
<tr><td>Production 50K job with dedup</td><td>50,000</td><td>~5.5 min</td><td><strong>152 files/sec</strong></td></tr>
<tr><td>233K chunked (5 × 50K batches)</td><td>233,000</td><td>36 min</td><td>107 files/sec</td></tr>
<tr><td>Bronze E2E pipeline</td><td>full run</td><td>10 min</td><td>—</td></tr>
</tbody>
</table>
</div>

**80% cost reduction** versus the Functions approach. The 233K chunked run required explicit `gc.collect()` between batches — each 50K batch held ~1.6 GB in memory and without it the container OOM'd at batch 2:

```python
CHUNK_SIZE = 50_000
for chunk in chunks:
    process_chunk(chunk)
    gc.collect()  # without this: OOM at ~100K files
```

So the per-container story was solved. One container could process its slice quickly and cheaply. The moment you go from one container to a thousand, a new and much harder problem appears: **deduplication.**

---

## The real problem: dedup is trivial on one box and brutal across a thousand

Because files re-arrive across processing cycles — the source POS systems are not idempotent — the same transaction can show up more than once. If duplicates get through, every downstream number is wrong. Dedup is correctness, not a nice-to-have.

On a single machine, dedup is the easiest thing in the world. You keep a set of the keys you have already seen, and for each new record you ask "is this in the set?" One lookup. Done.

The dedup key is a composite: **site\_number + transaction\_sequence + business\_date**. That combination uniquely identifies a transaction across all stores and all time. On one container, you hold those keys in memory and check each incoming record against them.

Now scale it. The two-billion-record backload is processed by roughly **one thousand containers at once**, each owning a different, disjoint slice of the files. And here is the problem in one sentence:

<div class="callout-warn">
  <strong>No container can see another container's memory.</strong><br><br>
  Container 7 has no idea what container 488 has already processed. They are separate processes, very likely on separate machines. The clean little in-memory set that made dedup trivial on one box is now fragmented across a thousand isolated processes that know nothing about each other.
</div>

So the question "have I seen this record before?" stops being a local lookup and becomes a **distributed, real-time, every-record question that all thousand workers are asking simultaneously.** That is one of the genuinely hard problems in distributed systems.

---

## The solution: move the shared state out of the workers

If the workers cannot share memory, the dedup state cannot live *inside* the workers. The fix is to pull that state out of the fleet entirely and put it in **one shared store that every container queries**: a single global Redis instance that all thousand workers check before writing.

The architecture becomes:

- An **orchestrator** discovers all files, slices the two billion records into disjoint ranges, and launches ~1,000 worker containers, each assigned its own range.
- Each **worker** parses its slice exactly as the single-container job does, but before writing any record, it checks that record's dedup key against the one shared store.
- The **shared store** is the single source of truth for "what has been seen." It lives outside every worker, so it sees the global picture that no individual worker can.

That single decision — externalize the shared state — is what makes the fleet horizontally scalable. Without it, adding workers just multiplies the blind spots. With it, you can add as many workers as you want and they never step on each other, because they all consult the same brain.

![Distributed architecture — 1,000 containers with shared Redis Bloom Filter](/images/circlek-distributed-diagram.png)

---

## Why a Bloom filter and not a plain Redis set

Externalizing the state solves correctness. But it introduces a capacity problem, and this is where the design gets interesting.

The naive version of the shared store is a plain Redis set: store every dedup key you have ever seen, and check membership against it. Simple and exact. The trouble is the size of the keyspace — and the reason is a detail that is easy to miss:

**Every daily load has to dedup against all of history, forever.**

A transaction that first appeared months ago could be re-sent today, and we still have to recognize it as a duplicate. The set of "keys we have seen" never resets and only grows. It is a permanent, ever-expanding keyspace.

At two billion files with 50–100 records each, the keyspace is on the order of **100 billion unique keys**. Stored as explicit keys in Redis, at ~80 bytes per key including overhead:

<div class="bloom-compare reveal">
  <div class="bloom-card bad">
    <div class="bloom-card-label">Plain Redis Set</div>
    <div class="bloom-card-num">6–16 TB</div>
    <div class="bloom-card-body">~80 bytes per key × 100B keys. A cluster of expensive memory-optimized machines whose cost rises every day. Grows forever.</div>
  </div>
  <div class="bloom-card good">
    <div class="bloom-card-label">Redis Bloom Filter</div>
    <div class="bloom-card-num">120–240 GB</div>
    <div class="bloom-card-body">Fixed-size bit array. 1% false-positive rate. Size set at creation — never grows regardless of how many keys it has seen.</div>
  </div>
</div>

That is **50–100× less memory, on a single instance, with sub-millisecond lookups.** And it never grows with history.

A Bloom filter is a probabilistic membership structure. Instead of storing keys, it keeps a fixed-size bit array. To record a key: run it through `k` hash functions, each pointing at a position in the bit array, and flip those bits to 1. To test a key: hash the same way and check those positions.

The crucial property: **the structure never grows with the amount of data it has seen.** Its size is fixed at creation time based on the expected item count and acceptable error rate.

The trade-off is a controlled, one-sided inaccuracy:

- **If any checked bit is 0, the key is *definitely new*.** No false negatives, ever. We process it.
- **If all checked bits are 1, the key was *probably* seen.** A rare hash collision can produce a false positive — we tune the filter so this rate is negligible (~1%). When all bits are 1, we treat it as a duplicate and skip it.

![Bloom filter — how it works and the cost comparison at scale](/images/circlek-bloom-filter.png)

The deployed configuration:

<div class="post-table">
<table>
<thead><tr><th>Parameter</th><th>Value</th></tr></thead>
<tbody>
<tr><td>Redis tier</td><td>Premium P5 (120 GB)</td></tr>
<tr><td>Throughput</td><td>3M+ ops/sec</td></tr>
<tr><td>Latency per lookup</td><td>&lt;1ms</td></tr>
<tr><td>Connection</td><td>SSL port 6380</td></tr>
<tr><td>Connection pool</td><td>20 max connections</td></tr>
<tr><td>Retry strategy</td><td>Exponential backoff with jitter</td></tr>
</tbody>
</table>
</div>

The implementation uses pipelined batch writes — hundreds of dedup checks per Redis round-trip instead of one per key:

```python
class RedisDistributedState:
    def is_duplicate(self, dedup_key: str) -> bool:
        return self.client.sismember("dedup:seen_transactions", dedup_key)

    def batch_mark_processed(self, dedup_keys: list[str]) -> list:
        pipe = self.client.pipeline()
        for key in dedup_keys:
            pipe.sadd("dedup:seen_transactions", key)
        return pipe.execute()
```

Without pipelining, each file's dedup check is a separate Redis round-trip — at 100 threads across 50K files that is five million individual network calls. With pipelining, hundreds of checks go in each batch, reducing round-trips by ~100×.

---

## The 2-billion-file backload

With the single-container shape correct and the shared dedup brain in place, the full backload becomes tractable.

The orchestrator slices two billion files into disjoint ranges and fans them out to ~1,000 worker containers. Workers are sharded by vendor — each POS system gets a dedicated fleet since their XML schemas and parsing logic differ.

Each container sustains ~107 files/sec on the realistic chunked workload. It is tempting to multiply 107 × 1,000 containers and conclude the backload finishes in about five hours. That number is wrong. Real distributed fan-out loses throughput to ADLS read contention, Iceberg write coordination, stragglers, and coordination overhead — none of which the naive calculation accounts for.

<div class="insight">
  At a realistic <strong>50–70% scaling efficiency</strong>, the honest projection is <strong>8 to 10 hours</strong> — not 5. Worth noting: the Bloom filter is not the bottleneck in that estimate. At 3M+ ops/sec and sub-millisecond lookups, the total dedup work across two billion records is a small fraction of an hour. The binding constraints are compute throughput and storage contention.
</div>

![Distributed scale — per-vendor container fleet with Redis cluster](/images/circlek-distributed-architecture.jpg)

---

## What actually landed in Snowflake

After the Databricks runs reached production, real records reached the warehouse:

<div class="post-table">
<table>
<thead><tr><th>Table</th><th>Records</th></tr></thead>
<tbody>
<tr><td><code>sales_line</code></td><td>703,965</td></tr>
<tr><td><code>sales_discount</code></td><td>146,041</td></tr>
</tbody>
</table>
</div>

Snowflake reads these as **external tables** pointing directly to Iceberg in ADLS Gen2 — no data copy into Snowflake's internal storage. Schema evolution and time travel come from Iceberg's metadata layer at no extra cost.

---

## The complete failure log

Every project has one. This one is worth preserving.

<div class="post-table">
<table>
<thead><tr><th>What Failed</th><th>Root Cause</th><th>Resolution</th></tr></thead>
<tbody>
<tr><td>Azure Functions &gt; 1K files</td><td>GIL + orchestrator design constraints</td><td>Moved to Databricks</td></tr>
<tr><td>Durable Functions at 2K files</td><td>Timeout + memory exhaustion (85% failure rate)</td><td>Abandoned entirely</td></tr>
<tr><td><code>az storage</code> CLI commands</td><td>Network deny-all rules on storage accounts</td><td>REST API with bearer tokens</td></tr>
<tr><td><code>input_file_name()</code> in Databricks</td><td>Not supported in Unity Catalog</td><td><code>col("_metadata.file_path")</code></td></tr>
<tr><td><code>dbutils</code> inside Spark UDFs</td><td>Not serializable across workers</td><td>Native Spark write operations</td></tr>
<tr><td><code>databricks jobs run-now</code> PENDING</td><td><code>new_cluster</code> waits for provisioning</td><td><code>runs submit</code> with <code>existing_cluster_id</code></td></tr>
<tr><td>New cluster with <code>i3.xlarge</code></td><td>AWS-only node type on Azure</td><td><code>Standard_D4s_v3</code> / <code>Standard_D8s_v3</code></td></tr>
<tr><td><code>spark.read.format("binaryFile")</code></td><td>Slow binary path with casting overhead</td><td><code>spark.read.text(wholetext=True)</code></td></tr>
<tr><td>Sequential <code>dbutils.fs.cp</code> archival</td><td>5–10 min per 1K files</td><td>Parallel Spark <code>.write.text()</code></td></tr>
<tr><td>Memory OOM at 233K files</td><td>Single container exceeds 8GB without GC</td><td>50K batches with <code>gc.collect()</code> between</td></tr>
</tbody>
</table>
</div>

The Azure CLI issue deserves a specific note. Storage accounts had network deny-all rules blocking every `az storage` command. The workaround was the Azure management REST API with bearer tokens for everything:

```bash
TOKEN=$(az account get-access-token --query accessToken -o tsv)
curl -H "Authorization: Bearer $TOKEN" \
  "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/..."
```

Verbose but reliable. The same pattern worked for querying ADF pipeline run history via `queryPipelineRuns`.

---

## All the numbers

<div class="numbers-grid reveal">
  <div class="numbers-cell">
    <div class="numbers-cell-val bad">0.08</div>
    <div class="numbers-cell-label">files/sec — original</div>
  </div>
  <div class="numbers-cell">
    <div class="numbers-cell-val green">152</div>
    <div class="numbers-cell-label">files/sec — shipped</div>
  </div>
  <div class="numbers-cell">
    <div class="numbers-cell-val">1,900×</div>
    <div class="numbers-cell-label">max improvement</div>
  </div>
  <div class="numbers-cell">
    <div class="numbers-cell-val blue">80%</div>
    <div class="numbers-cell-label">cost reduction</div>
  </div>
  <div class="numbers-cell">
    <div class="numbers-cell-val">100×</div>
    <div class="numbers-cell-label">smaller dedup store</div>
  </div>
  <div class="numbers-cell">
    <div class="numbers-cell-val blue">~8–10h</div>
    <div class="numbers-cell-label">2B record backload</div>
  </div>
</div>

<div class="post-table">
<table>
<thead><tr><th>Metric</th><th>Value</th></tr></thead>
<tbody>
<tr><td>Original pipeline</td><td>0.08 files/sec — 113 files in 23 min</td></tr>
<tr><td>Business requirement</td><td>83.33 files/sec — 50K in under 10 min</td></tr>
<tr><td>Azure Functions best (client cloud)</td><td>59 files/sec</td></tr>
<tr><td>Databricks Photon</td><td>123–132 files/sec</td></tr>
<tr><td>Container Apps 50K job</td><td><strong>152 files/sec</strong></td></tr>
<tr><td>Container Apps 233K chunked</td><td>107 files/sec</td></tr>
<tr><td>Performance improvement vs original</td><td>595× – 1,900×</td></tr>
<tr><td>Functions → Container Apps cost</td><td>80% reduction</td></tr>
<tr><td>Bloom filter vs plain Redis set</td><td>120–240 GB vs 6–16 TB — 50–100× less memory</td></tr>
<tr><td>Redis throughput</td><td>3M+ ops/sec, &lt;1ms per lookup</td></tr>
<tr><td>Thread workers per container</td><td>100</td></tr>
<tr><td>Chunk size</td><td>50K files / ~1.6 GB RAM each</td></tr>
<tr><td>Parquet batch size</td><td>2,500 records per write</td></tr>
<tr><td>Historic backload (projected)</td><td>2B files in ~8–10 hrs at 1,000-container fleet</td></tr>
</tbody>
</table>
</div>

---

## What this project was actually about

It is easy to read this as a story about picking the right Azure service. It is not. The services are incidental. The actual throughline is a way of thinking.

The first attempt failed because we treated an architecture problem as a performance problem. We optimized hard inside a model that structurally forbade what we needed, and no amount of profiling could have saved it. The second attempt succeeded technically and failed economically — which taught us that "it is fast now" is only half an answer. The third attempt worked because we matched the *shape* of the solution to the *shape* of the problem: bursty, parallelizable work wants pay-per-run process-level parallelism; an ever-growing global membership question wants a fixed-size probabilistic structure with shared state pulled out of the workers.

The single most important line from the whole effort is still the one from the first dead end:

<div class="callout">
  <p><strong>You can't optimize your way out of an architecture that forbids what you need.</strong></p>
  <p style="margin-top:0.8rem;font-size:0.88rem;color:var(--secondary)">Senior engineering is not writing faster loops. It is recognizing when the architecture itself is the cost — and being willing to change its shape.</p>
</div>

---

*Stack: Python 3.11 · Azure Container Apps Jobs · Azure Databricks (Photon) · Apache Iceberg · Azure ADLS Gen2 · Azure Cache for Redis (Premium P5) · Snowflake External Tables · PyArrow · azure-storage-blob*

<script>
(function() {
  if (!('IntersectionObserver' in window)) return;
  var els = document.querySelectorAll('.reveal');
  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        e.target.style.animationDelay = '0s';
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  els.forEach(function(el) { io.observe(el); });
})();
</script>
