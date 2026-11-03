/**
 * Host half of @jiashengfu/token-stats.
 *
 * Aggregates REAL token usage from the durable session logs (through the
 * `sessionQuery` service — the same logs the official `tokenUsage`
 * projection folds), samples host-process and system CPU, and serves one
 * JSON document at `GET /token-stats/v1/stats` for the client half.
 *
 * No mock data: every number is folded from `assistant/message` /
 * `assistant/attempt` usage samples in the user's own session logs.
 * Cost IS computed here, per usage sample, with the official vendor
 * price that was in effect at that sample's own timestamp (see
 * stats-pricing.js for the sourced price tables, incl. DeepSeek
 * peak/off-peak). Models without a public official price are reported
 * as unpriced tokens, never silently estimated. The client may still
 * offer a custom-price recalculation for comparison.
 */
import * as os from 'node:os';
import process from 'node:process';
import { execFile } from 'node:child_process';
import {
  buildAggregate,
  createSessionState,
  foldEvent,
} from './stats-core.js';
import { priceSample, basisFor, currencyFor, PRICING_INFO, FX } from './stats-pricing.js';

export const inject = ['sessionQuery', 'sessions', 'webServer'];

const ROUTE = '/token-stats/v1/stats';
const CPU_SAMPLE_MS = 2000;
const CPU_HISTORY = 180; // 6 minutes at 2s

function osCpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

class CpuSampler {
  constructor() {
    this.prevOs = osCpuTimes();
    this.prevProc = process.cpuUsage();
    this.prevAt = Date.now();
    this.samples = [];
    this.now = null;
    this.sample();
  }

  sample() {
    const at = Date.now();
    const elapsed = Math.max(1, at - this.prevAt);
    const osNow = osCpuTimes();
    const osTotalDelta = osNow.total - this.prevOs.total;
    const osIdleDelta = osNow.idle - this.prevOs.idle;
    const sysPct = osTotalDelta > 0 ? 100 * (1 - osIdleDelta / osTotalDelta) : 0;

    const proc = process.cpuUsage(this.prevProc);
    const procMs = (proc.user + proc.system) / 1000;
    const cores = Math.max(1, os.cpus().length);
    // Percent of total machine capacity (100% = every core busy).
    const procPct = (procMs / elapsed) * 100 / cores;

    const mem = process.memoryUsage();
    this.now = {
      at,
      sysPct: round2(sysPct),
      procPct: round2(procPct),
      procPctOfCore: round2((procMs / elapsed) * 100),
      cores,
      loadavg: os.loadavg().map(round2),
      memSys: { total: os.totalmem(), free: os.freemem(), used: os.totalmem() - os.freemem() },
      memProc: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      procUptimeSec: Math.floor(process.uptime()),
      sysUptimeSec: Math.floor(os.uptime()),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      node: process.version,
      pid: process.pid,
    };
    this.samples.push({ at, sysPct: this.now.sysPct, procPct: this.now.procPct, rss: mem.rss });
    if (this.samples.length > CPU_HISTORY) this.samples.splice(0, this.samples.length - CPU_HISTORY);
    this.prevOs = osNow;
    this.prevProc = process.cpuUsage();
    this.prevAt = at;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * GPU sampler (macOS, no privileges needed): reads IOAccelerator
 * PerformanceStatistics via ioreg — Device Utilization %, renderer /
 * tiler utilization, in-use (unified) memory. Chip name/core count come
 * from system_profiler once. On any failure the sampler stays silent
 * (gpu: null) and the client hides the GPU strip.
 */
class GpuSampler {
  constructor() {
    this.now = null;
    this.samples = [];
    this.busy = false;
    this.info = null; // { name, cores }
    this.sample();
  }

  sample() {
    // ioreg/system_profiler are macOS-only; elsewhere the GPU strip
    // simply stays hidden (now === null), everything else is portable.
    if (process.platform !== 'darwin' || this.busy) return;
    this.busy = true;
    execFile('ioreg', ['-r', '-c', 'IOAccelerator', '-l', '-w0'], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      this.busy = false;
      if (err || typeof stdout !== 'string') return;
      try {
        const stats = [...stdout.matchAll(/"PerformanceStatistics"\s*=\s*\{([^}]*)\}/g)]
          .map((m) => {
            const get = (key) => {
              const hit = new RegExp(`"${key}"\\s*=\\s*([0-9]+)`).exec(m[1]);
              return hit ? Number(hit[1]) : 0;
            };
            return {
              util: get('Device Utilization %'),
              renderer: get('Renderer Utilization %'),
              tiler: get('Tiler Utilization %'),
              memInUse: get('In use system memory'),
              memAlloc: get('Alloc system memory'),
            };
          })
          .filter((s) => s.memAlloc > 0 || s.util > 0);
        if (stats.length === 0) return;
        const best = stats.reduce((a, b) => (b.util > a.util || (b.util === a.util && b.memAlloc > a.memAlloc) ? b : a));
        const at = Date.now();
        this.now = { at, ...best, name: this.info?.name ?? null, cores: this.info?.cores ?? null };
        this.samples.push({ at, util: best.util });
        if (this.samples.length > CPU_HISTORY) this.samples.splice(0, this.samples.length - CPU_HISTORY);
      } catch { /* keep last good sample */ }
    });
    if (this.info === null) {
      this.info = {}; // mark requested; filled asynchronously below
      execFile('system_profiler', ['SPDisplaysDataType'], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err || typeof stdout !== 'string') return;
        const name = /Chipset Model:\s*(.+)/.exec(stdout)?.[1]?.trim() ?? null;
        const coresRaw = /Total Number of Cores:\s*([0-9]+)/.exec(stdout)?.[1];
        this.info = { name, cores: coresRaw ? Number(coresRaw) : null };
        if (this.now !== null) { this.now.name = name; this.now.cores = this.info.cores; }
      });
    }
  }
}

class SessionAggregator {
  constructor(ctx) {
    this.ctx = ctx;
    this.cache = new Map(); // sessionId -> state (stats-core session state)
    this.totalListed = 0;
    this.indexingDone = false;
    this.indexingStartedAt = 0;
    this.lastRefreshAt = 0;
    this.lastError = null;
    this.refreshing = null;
  }

  liveSeqOf(id) {
    try {
      const session = this.ctx.sessions.get(id);
      if (session === undefined || session === null) return -1;
      const seq = session.seq;
      return typeof seq === 'number' ? seq : -1;
    } catch {
      return -1;
    }
  }

  /** Kick (or join) a refresh pass; never throws. */
  refresh() {
    if (this.refreshing !== null) return this.refreshing;
    this.refreshing = this.runRefresh()
      .catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        this.refreshing = null;
        this.lastRefreshAt = Date.now();
      });
    return this.refreshing;
  }

  async runRefresh() {
    if (this.indexingStartedAt === 0) this.indexingStartedAt = Date.now();
    const records = await this.ctx.sessionQuery.listSessions();
    this.totalListed = records.length;
    const seen = new Set();
    for (const record of records) {
      const header = record.header;
      if (header === undefined || typeof header.id !== 'string') continue;
      seen.add(header.id);
      const liveSeq = this.liveSeqOf(header.id);
      let state = this.cache.get(header.id);
      if (state !== undefined) {
        state.live = liveSeq >= 0 || record.live === true;
        // Cold sessions are immutable; a live session whose log length is
        // unchanged needs no rescan.
        if (state.complete && (liveSeq < 0 || state.liveSeq === liveSeq)) continue;
      }
      await this.scanSession(header, record, liveSeq);
      // Yield so a long first index never stalls the host event loop.
      await new Promise((resolve) => setImmediate(resolve));
    }
    // Forget sessions that disappeared from the corpus.
    for (const id of [...this.cache.keys()]) {
      if (!seen.has(id)) this.cache.delete(id);
    }
    this.indexingDone = true;
  }

  async scanSession(header, record, liveSeq) {
    const id = header.id;
    let state = this.cache.get(id);
    if (state === undefined) {
      state = createSessionState(header, priceSample);
      this.cache.set(id, state);
    }
    state.live = liveSeq >= 0 || record.live === true;
    state.persisted = record.persisted !== false;
    try {
      const snapshot = await this.ctx.sessionQuery.readSession(id);
      const inherited = typeof snapshot.inheritedEventCount === 'number' ? snapshot.inheritedEventCount : 0;
      const events = Array.isArray(snapshot.events) ? snapshot.events : [];
      // Incremental fold: only events past the previous watermark are new.
      // Inherited (fork-seed) events are skipped so a fork does not double
      // count its parent's usage — same boundary the tokenUsage projection
      // starts from.
      for (let i = state.foldedCount; i < events.length; i++) {
        const event = events[i];
        if (event !== null && typeof event === 'object' && typeof event.seq === 'number' && event.seq < inherited) continue;
        foldEvent(state, event);
      }
      state.foldedCount = events.length;
      state.liveSeq = liveSeq;
      state.complete = true;
      state.error = null;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    }
  }

  payload() {
    const aggregate = buildAggregate(this.cache.values(), Date.now());
    for (const row of aggregate.models) {
      row.basis = basisFor(row.model);
      row.currency = currencyFor(row.model);
    }
    const totalTokens = aggregate.totals.total;
    const unpricedTokens = aggregate.totals.unpriced;
    const cnyTotal = aggregate.totals.cny + aggregate.totals.cnyProxy;
    const usdTotal = aggregate.totals.usd + aggregate.totals.usdProxy;
    return {
      ...aggregate,
      pricing: {
        ...PRICING_INFO,
        fx: FX,
        coverage: {
          totalTokens,
          unpricedTokens,
          pricedTokens: totalTokens - unpricedTokens,
          pricedShare: totalTokens > 0 ? (totalTokens - unpricedTokens) / totalTokens : 0,
          cnyTotal,
          usdTotal,
          cadTotal: cnyTotal * FX.cnyCad + usdTotal * FX.usdCad,
          unpricedModels: aggregate.models
            .filter((m) => m.basis === null && m.total > 0)
            .map((m) => ({ model: m.model, tokens: m.total, requests: m.requests })),
        },
      },
      indexing: {
        done: this.indexingDone,
        scanned: this.cache.size,
        total: this.totalListed,
        startedAt: this.indexingStartedAt,
        lastRefreshAt: this.lastRefreshAt,
        error: this.lastError,
      },
    };
  }
}

export function apply(ctx) {
  const aggregator = new SessionAggregator(ctx);
  const cpu = new CpuSampler();
  const gpu = new GpuSampler();

  // Start indexing immediately so the first panel open is warm.
  aggregator.refresh();

  ctx.effect(() => {
    const timer = setInterval(() => { cpu.sample(); gpu.sample(); }, CPU_SAMPLE_MS);
    return () => clearInterval(timer);
  });

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: 'method not allowed' }));
          return;
        }
        // Return what we have; refresh continues in the background and the
        // client polls, so a cold first index shows progress, not a hang.
        aggregator.refresh();
        const body = JSON.stringify({
          ...aggregator.payload(),
          cpu: { now: cpu.now, series: cpu.samples },
          gpu: { now: gpu.now, series: gpu.samples },
        });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch (error) {
        try {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        } catch { /* socket already gone */ }
      }
    },
  }));

  ctx.logger?.info?.(`token-stats: serving real session statistics at ${ROUTE}`);
}
