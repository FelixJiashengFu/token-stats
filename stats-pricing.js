/**
 * Official vendor pricing for @local/token-stats, with provenance.
 *
 * Every price below was read from the vendor's own published pricing page
 * (fetched 2026-11-02) and, where a price changed inside the user's data
 * window, cross-checked against dated snapshots of that same page.
 * Prices are USD per 1M tokens. A request is priced with the table that
 * was in effect at the request's own timestamp — including DeepSeek's
 * peak / off-peak schedule, which is why this runs per usage sample.
 *
 * Sources:
 * - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 *   (live fetch 2026-11-02; Wayback snapshots 2026-09-11 and 2026-10-20
 *   show the identical table; the 2026-09-10 release notes state the new
 *   pricing took effect 2026-09-10 04:00 UTC, peak/off-peak continuing,
 *   off-peak = 50% of peak.)
 * - Google: https://ai.google.dev/gemini-api/docs/pricing
 *   (live fetch 2026-11-02; the page itself states the Gemini 3.8 Flash
 *   rates run "through December 31, 2026", covering the whole window.)
 * - Meta muse-* model IDs: no public per-token API price exists (Meta
 *   publishes the Muse agent product, not these harness model IDs), and
 *   free/proxy aggregators publish no vendor list price either. Those
 *   requests are reported as UNPRICED — never silently estimated.
 */

const T = (iso) => Date.parse(iso);

/** Chinese public holidays inside/near the data window (State Council
 *  pattern: National Day Oct 1-7; Mid-Autumn Sep 25-27 is before it). */
const CN_HOLIDAYS = new Set([
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
]);

/** DeepSeek peak: 01:00-04:00 and 06:00-10:00 UTC, Mon-Fri, excl. CN holidays. */
export function isDeepSeekPeak(timeMs) {
  const d = new Date(timeMs);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  if (CN_HOLIDAYS.has(iso)) return false;
  const hour = d.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

/**
 * A price rule: match(provider, model) -> bool.
 * periods: [{ from, to (exclusive, null = open), peak: {cacheHit, input,
 * output} | null, flat: {input, cacheRead, output} | null }]
 * DeepSeek has no separate cache-write charge; cacheWriteTokens is priced
 * as cache-miss input. Google has no cache-write line either; its
 * cacheWrite is priced as input (cacheWrite is 0 in the current corpus).
 */
/**
 * Currency convention (user requirement): Chinese vendors (DeepSeek,
 * and any future CN rule added here) are priced in CNY from the vendor's
 * official RMB price list; other vendors keep their official USD list
 * price. Display layers convert both into CAD with the Bank of Canada
 * daily rates below. DeepSeek's USD and CNY tables are NOT FX
 * equivalents (e.g. peak output $1.20/M vs ¥8/M) — they are separate
 * official regional price lists, and we use each as published.
 */
export const FX = {
  usdCad: 1.3978, // 1 USD = 1.3978 CAD
  cnyCad: 0.2102, // 1 CNY = 0.2102 CAD
  asOf: '2026-11-02',
  source: 'Bank of Canada, Daily exchange rates (official)',
  url: 'https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/',
};

const RULES = [
  {
    id: 'deepseek-flash',
    label: 'deepseek-flash (DeepSeek-V4.1-Flash)',
    currency: 'CNY',
    match: (provider, model) => model === 'deepseek-flash' || model === 'deepseek-v4.1-flash' || model === 'deepseek-v4-flash',
    periods: [
      {
        // Official CNY table, effective with the 2026-09-10 release
        // (fetched 2026-11-02 from the Chinese pricing page; the USD
        // table's identical values on the 2026-09-11 / 2026-10-20
        // snapshots confirm no change inside the data window).
        // Requests older than this are left unpriced rather than
        // priced with a CNY table we could not verify for them
        // (the corpus starts 2026-10-01, so none occur in practice).
        from: T('2026-09-10T04:00:00Z'), to: null,
        peak: { cacheHit: 0.04, input: 2, output: 8 },
        offPeak: { cacheHit: 0.02, input: 1, output: 4 },
      },
    ],
  },
  {
    id: 'deepseek-v4-pro',
    label: 'deepseek-v4-pro (DeepSeek-V4-Pro)',
    currency: 'CNY',
    match: (provider, model) => model === 'deepseek-v4-pro',
    periods: [
      {
        from: T('2026-09-10T04:00:00Z'), to: null,
        peak: { cacheHit: 0.30, input: 9.0, output: 27.0 },
        offPeak: { cacheHit: 0.15, input: 4.5, output: 13.5 },
      },
    ],
  },
  {
    id: 'gemini-3.8-flash',
    label: 'gemini-3.8-flash (Google)',
    currency: 'USD',
    match: (provider, model) => model === 'gemini-3.8-flash',
    periods: [
      { from: 0, to: T('2027-01-01T00:00:00Z'), flat: { input: 0.75, cacheRead: 0.075, output: 3.75 } },
      { from: T('2027-01-01T00:00:00Z'), to: null, flat: { input: 1.50, cacheRead: 0.15, output: 7.50 } },
    ],
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'gemini-3.5-flash-lite (Google)',
    currency: 'USD',
    match: (provider, model) => model === 'gemini-3.5-flash-lite',
    periods: [
      { from: 0, to: null, flat: { input: 0.30, cacheRead: 0.03, output: 2.50 } },
    ],
  },
];

/** 'official-direct' | 'official-underlying-proxy' | null (no public price) */
export function basisFor(modelKey) {
  const slash = modelKey.lastIndexOf('/');
  const provider = slash >= 0 ? modelKey.slice(0, slash) : '';
  const model = slash >= 0 ? modelKey.slice(slash + 1) : modelKey;
  const rule = RULES.find((r) => r.match(provider, model));
  if (rule === undefined) return null;
  const viaProxy = provider.includes('proxy') || provider === 'freellmapi';
  return viaProxy ? 'official-underlying-proxy' : 'official-direct';
}

/** Official price currency for a model key: 'CNY' | 'USD' | null. */
export function currencyFor(modelKey) {
  const slash = modelKey.lastIndexOf('/');
  const provider = slash >= 0 ? modelKey.slice(0, slash) : '';
  const model = slash >= 0 ? modelKey.slice(slash + 1) : modelKey;
  const rule = RULES.find((r) => r.match(provider, model));
  return rule === undefined ? null : rule.currency;
}

function priceBuckets(rule, period, timeMs, buckets) {
  if (period.peak !== undefined && period.peak !== null) {
    const p = isDeepSeekPeak(timeMs) ? period.peak : period.offPeak;
    return (
      buckets.cacheRead * p.cacheHit +
      (buckets.input + buckets.cacheWrite) * p.input +
      buckets.output * p.output
    ) / 1e6;
  }
  const p = period.flat;
  return (
    buckets.input * p.input +
    buckets.cacheRead * p.cacheRead +
    buckets.cacheWrite * p.input +
    buckets.output * p.output
  ) / 1e6;
}

/**
 * Price one usage sample.
 * @returns {{cny:number, usd:number, cnyProxy:number, usdProxy:number, unpriced:number}}
 *   cny/usd        — cost in the vendor's official price currency
 *                    (CNY for Chinese vendors, USD otherwise)
 *   cnyProxy/usdProxy — same, but the request went through a reseller
 *                    proxy, so this is the underlying vendor list price,
 *                    not the proxy's actual (unpublished) charge
 *   unpriced       — total tokens of the sample when no public official
 *                    price exists for the model (cost counted as 0)
 */
export function priceSample(modelKey, timeMs, buckets) {
  const total = buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output;
  const empty = { cny: 0, usd: 0, cnyProxy: 0, usdProxy: 0, unpriced: total };
  const slash = modelKey.lastIndexOf('/');
  const provider = slash >= 0 ? modelKey.slice(0, slash) : '';
  const model = slash >= 0 ? modelKey.slice(slash + 1) : modelKey;
  const rule = RULES.find((r) => r.match(provider, model));
  if (rule === undefined) return empty;
  const period = rule.periods.find((p) => timeMs >= p.from && (p.to === null || timeMs < p.to));
  if (period === undefined) return empty;
  const value = priceBuckets(rule, period, timeMs, buckets);
  const isProxy = basisFor(modelKey) === 'official-underlying-proxy';
  const out = { cny: 0, usd: 0, cnyProxy: 0, usdProxy: 0, unpriced: 0 };
  if (rule.currency === 'CNY') {
    if (isProxy) out.cnyProxy = value; else out.cny = value;
  } else {
    if (isProxy) out.usdProxy = value; else out.usd = value;
  }
  return out;
}

/** Provenance block served to the client for display next to every cost. */
export const PRICING_INFO = {
  fetchedAt: '2026-11-02',
  fx: FX,
  entries: [
    {
      models: 'deepseek-flash / deepseek-v4.1-flash / deepseek-v4-flash',
      vendor: 'DeepSeek 官方 API（人民币价）',
      period: '2026-09-10 起生效（覆盖全部请求时段）',
      prices: '峰时段（每百万 token）：缓存命中 ¥0.04 · 缓存未命中输入 ¥2 · 输出 ¥8；谷时段减半：¥0.02 · ¥1 · ¥4',
      peakRule: '峰时段 = 北京时间周一至周五 9:00–12:00 与 14:00–18:00，中国法定节假日除外（2026 国庆 10/1–10/7 按谷时段）；按每条请求的实际时刻逐条判定',
      source: 'DeepSeek 官方中文定价页（2026-11-02 抓取）；英文价表 2026-09-11、2026-10-20 存档与实时页一致，证实时段内无调价',
      url: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
    },
    {
      models: 'deepseek-v4-pro',
      vendor: 'DeepSeek 官方 API（人民币价）',
      period: '同上',
      prices: '峰时段：缓存命中 ¥0.30 · 未命中输入 ¥9 · 输出 ¥27；谷时段减半：¥0.15 · ¥4.5 · ¥13.5',
      peakRule: '同上',
      source: '同上',
      url: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
    },
    {
      models: 'gemini-3.8-flash',
      vendor: 'Google Gemini API 官方付费层',
      period: '现行价有效至 2026-12-31（覆盖全部请求时段）；2027-01-01 起 $1.50 / $7.50 已预置',
      prices: '每百万 token：输入 $0.75 · 上下文缓存读取 $0.075 · 输出 $3.75（无峰谷价；缓存存储费按小时计、无数据可算，未计入）',
      peakRule: '无峰谷价',
      source: 'Google 官方 Gemini API 定价页（2026-11-02 抓取，页面明示有效期至 2026-12-31）',
      url: 'https://ai.google.dev/gemini-api/docs/pricing',
    },
    {
      models: 'gemini-3.5-flash-lite',
      vendor: 'Google Gemini API 官方付费层',
      period: '现行价',
      prices: '每百万 token：输入 $0.30 · 上下文缓存读取 $0.03 · 输出 $2.50',
      peakRule: '无峰谷价',
      source: '同上',
      url: 'https://ai.google.dev/gemini-api/docs/pricing',
    },
    {
      models: 'meta/muse-* · freellmapi/auto · wb-proxy/step-5-preview · wb-proxy/hy4-preview',
      vendor: '无公开官方价',
      period: '—',
      prices: '未计价：这些模型经内部/代理通道提供，厂商未公布按-token 官方价（Meta 公开的是 Muse 智能体产品，无该 API 价表）。其 token 单独统计、成本记 0，绝不用编造价格填充。',
      peakRule: '—',
      source: '2026-11-02 检索 Meta 开发者平台与公开资料，未发现官方价表',
      url: '',
    },
    {
      models: 'wb-proxy/deepseek-v4.1-flash',
      vendor: '代理转售（底层 DeepSeek 官方价）',
      period: '同 DeepSeek',
      prices: '按底层 DeepSeek-V4.1-Flash 官方价计算并单独列为「代理底层价」；代理自身加价未公开，不计入。',
      peakRule: '同 DeepSeek',
      source: '同 DeepSeek 官方价',
      url: 'https://api-docs.deepseek.com/quick_start/pricing',
    },
  ],
  notes: [
    '币种约定（按用户要求）：中国厂商（DeepSeek，及今后新增的国产模型规则）用厂商官方人民币价计价；其他厂商用官方美元价，并按加拿大央行 2026-11-02 官方汇率（USD/CAD 1.3978，CNY/CAD 0.2102）换算成加元展示与汇总。DeepSeek 的美元价与人民币价是两套独立官方价表（并非汇率折算），这里用人民币原表。',
    'deepseek-account 与 deepseek-official 两个通道调用的都是 DeepSeek 官方 deepseek-flash，按同一官方价计；若账号通道实为订阅制，边际成本会低于按量价，此处按官方按量价估算。',
    '缓存写入 token：DeepSeek/Google 均无单独缓存写价，按未命中输入价计（当前全部日志中缓存写为 0，无实际影响）。推理 token 已含在输出 token 内，按输出价计，不重复计算。',
    '成本仍为估算：免费额度、阶梯优惠、账号订阅、代理加价、Gemini 缓存存储费均未建模；与厂商账单会有差异。',
  ],
};
