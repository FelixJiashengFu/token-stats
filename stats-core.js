/**
 * Pure fold/aggregate core for @jiashengfu/token-stats.
 *
 * Folds durable session-log events (the same `{ seq, time, type, data }`
 * envelopes the harness TokenMeter projection consumes) into per-session
 * token buckets, per-day / per-hour buckets and per-model buckets.
 *
 * Token accounting mirrors the official `tokenUsage` projection:
 * - a usage sample comes from `assistant/message` (`data.usage`) or from the
 *   last usage chunk embedded in an `assistant/attempt` stream;
 * - consecutive samples for the same turn/step REPLACE the previous sample
 *   (a retried attempt reports again) instead of adding on top;
 * - a session's total is input + cacheRead + cacheWrite + output; reasoning
 *   tokens are a subset of output and are reported separately, never added.
 */

export function zeroBuckets() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
}

export function bucketsOfUsage(usage) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return {
    input: n(usage?.inputTokens),
    output: n(usage?.outputTokens),
    cacheRead: n(usage?.cacheReadTokens),
    cacheWrite: n(usage?.cacheWriteTokens),
    reasoning: n(usage?.reasoningTokens),
  };
}

export function totalOf(b) {
  return b.input + b.output + b.cacheRead + b.cacheWrite;
}

function addInto(target, buckets, sign) {
  target.input += sign * buckets.input;
  target.output += sign * buckets.output;
  target.cacheRead += sign * buckets.cacheRead;
  target.cacheWrite += sign * buckets.cacheWrite;
  target.reasoning += sign * buckets.reasoning;
}

function bucketCell(map, key) {
  let cell = map.get(key);
  if (cell === undefined) {
    cell = { ...zeroBuckets(), requests: 0, cny: 0, usd: 0, cnyProxy: 0, usdProxy: 0, unpriced: 0 };
    map.set(key, cell);
  }
  return cell;
}

/** Accumulate a priced sample ({cny, usd, cnyProxy, usdProxy, unpriced}). */
function addPriced(target, priced, sign) {
  target.cny += sign * priced.cny;
  target.usd += sign * priced.usd;
  target.cnyProxy += sign * priced.cnyProxy;
  target.usdProxy += sign * priced.usdProxy;
  target.unpriced += sign * priced.unpriced;
}

/** Last usage sample embedded in an assistant stream, mirroring TokenMeter. */
export function streamUsage(stream) {
  if (!Array.isArray(stream)) return undefined;
  let found;
  for (const chunk of stream) {
    if (chunk === null || typeof chunk !== 'object') continue;
    const usage = chunk.usage ?? chunk.data?.usage;
    if (usage && typeof usage.inputTokens === 'number') found = usage;
  }
  return found;
}

export function usageOfEvent(event) {
  if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
    return event.data.usage;
  }
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') {
    return undefined;
  }
  return streamUsage(event.data?.stream);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Local-time day key `YYYY-MM-DD` for an epoch-ms timestamp. */
export function dayKey(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local-time hour key `YYYY-MM-DDTHH` for an epoch-ms timestamp. */
export function hourKey(time) {
  const d = new Date(time);
  return `${dayKey(time)}T${pad2(d.getHours())}`;
}

export function createSessionState(header, pricer) {
  return {
    pricer: typeof pricer === 'function' ? pricer : null,
    cny: 0,
    usd: 0,
    cnyProxy: 0,
    usdProxy: 0,
    unpriced: 0,
    id: header.id,
    title: null,
    createdAt: typeof header.createdAt === 'number' ? header.createdAt : 0,
    cwd: typeof header.cwd === 'string' ? header.cwd : '',
    parent: typeof header.parentSession === 'string' && header.parentSession !== '',
    seeded: header.isSeeded === true,
    live: false,
    persisted: true,
    updatedAt: 0,
    lastActivityAt: 0,
    events: 0,
    turns: 0,
    userMessages: 0,
    requests: 0,
    buckets: zeroBuckets(),
    byDay: new Map(),
    byHour: new Map(),
    models: new Map(),
    lastModel: 'unknown',
    pendingModel: null,
    last: null, // { key, buckets, day, hour, model } of the replaceable sample
    foldedCount: 0,
    liveSeq: -1,
    complete: false,
    error: null,
  };
}

function applyUsage(state, event, usage) {
  const buckets = bucketsOfUsage(usage);
  const time = typeof event.time === 'number' ? event.time : 0;
  const day = dayKey(time);
  const hour = hourKey(time);
  const model = state.lastModel !== 'unknown' ? state.lastModel : (state.pendingModel ?? 'unknown');
  const turn = event.data?.turn;
  const step = event.data?.step;
  const key = typeof turn === 'number' && typeof step === 'number'
    ? `${turn}:${step}`
    : `seq:${event.seq}`;

  // Price this sample with the table effective at its own timestamp
  // (official vendor prices, incl. DeepSeek peak/off-peak). Samples for
  // models without a public official price stay unpriced.
  const priced = state.pricer !== null
    ? state.pricer(model, time, buckets)
    : { cny: 0, usd: 0, cnyProxy: 0, usdProxy: 0, unpriced: totalOf(buckets) };

  const prev = state.last;
  if (prev !== null && prev.key === key) {
    // Replacement sample for the same turn/step: back the old one out of
    // every bucket it fed, then add the new one. Request count is unchanged.
    addInto(state.buckets, prev.buckets, -1);
    addInto(bucketCell(state.byDay, prev.day), prev.buckets, -1);
    addInto(bucketCell(state.byHour, prev.hour), prev.buckets, -1);
    addInto(bucketCell(state.models, prev.model), prev.buckets, -1);
    addPriced(state, prev.priced, -1);
    addPriced(bucketCell(state.byDay, prev.day), prev.priced, -1);
    addPriced(bucketCell(state.byHour, prev.hour), prev.priced, -1);
    addPriced(bucketCell(state.models, prev.model), prev.priced, -1);
  } else {
    state.requests += 1;
    bucketCell(state.byDay, day).requests += 1;
    bucketCell(state.byHour, hour).requests += 1;
    bucketCell(state.models, model).requests += 1;
  }
  addInto(state.buckets, buckets, +1);
  addInto(bucketCell(state.byDay, day), buckets, +1);
  addInto(bucketCell(state.byHour, hour), buckets, +1);
  addInto(bucketCell(state.models, model), buckets, +1);
  addPriced(state, priced, +1);
  addPriced(bucketCell(state.byDay, day), priced, +1);
  addPriced(bucketCell(state.byHour, hour), priced, +1);
  addPriced(bucketCell(state.models, model), priced, +1);
  state.last = { key, buckets, day, hour, model, priced };
}

/** Fold one raw session-log event into the session state (mutates state). */
export function foldEvent(state, event) {
  if (event === null || typeof event !== 'object' || typeof event.type !== 'string') return;
  state.events += 1;
  if (typeof event.time === 'number' && event.time > state.lastActivityAt) {
    state.lastActivityAt = event.time;
  }
  const data = event.data ?? {};
  switch (event.type) {
    case 'session/title': {
      if (typeof data.title === 'string' && data.title.trim() !== '') state.title = data.title;
      break;
    }
    case 'user/message':
      state.userMessages += 1;
      break;
    case 'turn/start':
      state.turns += 1;
      break;
    case 'request/header': {
      const config = data.header?.config;
      if (config && typeof config.model === 'string' && config.model !== '') {
        state.lastModel = typeof config.provider === 'string' && config.provider !== ''
          ? `${config.provider}/${config.model}`
          : config.model;
      }
      break;
    }
    case 'model/selection': {
      if (typeof data.model === 'string' && data.model !== '') {
        state.pendingModel = typeof data.provider === 'string' && data.provider !== ''
          ? `${data.provider}/${data.model}`
          : data.model;
      }
      break;
    }
    default: {
      const usage = usageOfEvent(event);
      if (usage !== undefined) applyUsage(state, event, usage);
      break;
    }
  }
}

/** Serializable per-session summary for the API payload. */
export function sessionSummary(state) {
  const models = [...state.models.entries()]
    .map(([model, cell]) => ({ model, ...cell, total: totalOf(cell) }))
    .sort((a, b) => b.total - a.total);
  return {
    id: state.id,
    title: state.title,
    createdAt: state.createdAt,
    updatedAt: state.lastActivityAt,
    cwd: state.cwd,
    parent: state.parent,
    seeded: state.seeded,
    live: state.live,
    events: state.events,
    turns: state.turns,
    userMessages: state.userMessages,
    requests: state.requests,
    buckets: { ...state.buckets },
    cny: state.cny,
    usd: state.usd,
    cnyProxy: state.cnyProxy,
    usdProxy: state.usdProxy,
    unpriced: state.unpriced,
    total: totalOf(state.buckets),
    mainModel: models.length > 0 ? models[0].model : 'unknown',
    models,
    error: state.error,
  };
}

function mergeCells(states, pick) {
  const merged = new Map();
  for (const state of states) {
    for (const [key, cell] of pick(state)) {
      const target = bucketCell(merged, key);
      addInto(target, cell, +1);
      target.requests += cell.requests;
      target.cny += cell.cny;
      target.usd += cell.usd;
      target.cnyProxy += cell.cnyProxy;
      target.usdProxy += cell.usdProxy;
      target.unpriced += cell.unpriced;
    }
  }
  return merged;
}

function cellRow(key, name, cell) {
  return { [name]: key, ...cell, total: totalOf(cell) };
}

/**
 * Build the API aggregate from all folded session states.
 * @param states iterable of session states (from createSessionState/foldEvent)
 * @param now current epoch ms (injected for testability)
 */
export function buildAggregate(states, now) {
  const list = [...states];
  const totals = { ...zeroBuckets(), requests: 0, cny: 0, usd: 0, cnyProxy: 0, usdProxy: 0, unpriced: 0 };
  for (const state of list) {
    addInto(totals, state.buckets, +1);
    totals.requests += state.requests;
    totals.cny += state.cny;
    totals.usd += state.usd;
    totals.cnyProxy += state.cnyProxy;
    totals.usdProxy += state.usdProxy;
    totals.unpriced += state.unpriced;
  }

  const byDay = mergeCells(list, (s) => s.byDay);
  const daily = [...byDay.entries()]
    .map(([day, cell]) => cellRow(day, 'day', cell))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  const byHour = mergeCells(list, (s) => s.byHour);
  const hourly = [...byHour.entries()]
    .map(([hour, cell]) => cellRow(hour, 'hour', cell))
    .sort((a, b) => (a.hour < b.hour ? -1 : 1))
    .slice(-72);

  const byModel = mergeCells(list, (s) => s.models);
  const totalTokens = totalOf(totals);
  const models = [...byModel.entries()]
    .map(([model, cell]) => ({ ...cellRow(model, 'model', cell), share: totalTokens > 0 ? totalOf(cell) / totalTokens : 0 }))
    .sort((a, b) => b.total - a.total);

  const sessions = list.map(sessionSummary).sort((a, b) => b.total - a.total);

  const today = dayKey(now);
  const month = today.slice(0, 7);
  const dayMs = 86400000;
  const sumRange = (fromDay, toDay) => {
    const acc = { ...zeroBuckets(), requests: 0, cny: 0, usd: 0, cnyProxy: 0, usdProxy: 0, unpriced: 0 };
    for (const row of daily) {
      if (row.day >= fromDay && row.day <= toDay) {
        addInto(acc, row, +1);
        acc.requests += row.requests;
        acc.cny += row.cny;
        acc.usd += row.usd;
        acc.cnyProxy += row.cnyProxy;
        acc.usdProxy += row.usdProxy;
        acc.unpriced += row.unpriced;
      }
    }
    return { ...acc, total: totalOf(acc) };
  };
  const dayOf = (offset) => dayKey(now - offset * dayMs);

  const liveCount = list.filter((s) => s.live).length;
  const activeSince = (ms) => list.filter((s) => s.lastActivityAt >= now - ms).length;

  return {
    generatedAt: now,
    totals: { ...totals, total: totalTokens },
    counts: {
      sessions: list.length,
      live: liveCount,
      withUsage: list.filter((s) => s.requests > 0).length,
      activeToday: activeSince(dayMs),
      active7d: activeSince(7 * dayMs),
      createdThisMonth: list.filter((s) => dayKey(s.createdAt).startsWith(month)).length,
    },
    windows: {
      today: { day: today, ...sumRange(today, today) },
      last7d: { from: dayOf(6), to: today, ...sumRange(dayOf(6), today) },
      last30d: { from: dayOf(29), to: today, ...sumRange(dayOf(29), today) },
      monthToDate: { month, ...sumRange(`${month}-01`, today) },
    },
    daily: daily.slice(-180),
    hourly,
    models,
    sessions,
  };
}
