/**
 * Client half of @local/token-stats.
 *
 * Surfaces:
 * - a right-sidebar tab (betterSidebar registerTab when available, native
 *   sidebarRightTabs + sidebar.right.pane.tab otherwise) with a compact
 *   single-column dashboard: token totals, session counts, estimated cost
 *   & budget, token timeline, top sessions, per-model breakdown, and host
 *   CPU / memory monitoring;
 * - a global sidebar panel (sidebar.panellist + main) with the full wide
 *   dashboard, including the per-session table and price/budget settings.
 *
 * All data comes from the Host half at GET /token-stats/v1/stats, folded
 * from the user's real session logs. Prices and budget are editable here
 * and persisted in localStorage; every money figure is an estimate.
 */
window.__ModuleLoader__.load({
  id: '@local/token-stats',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef } = React;

    const PANEL_ID = 'token-stats';
    const API = '/token-stats/v1/stats';
    const LS_KEY = 'token-stats.settings.v1';

    let CTX = null;

    // ---------------------------------------------------------------- i18n
    const STR = {
      zh: {
        panel: 'Token 统计', totalTokens: '总 Token', sessions: '会话数量', requests: '模型请求',
        estCost: '估算总成本', monthCost: '本月估算成本', budget: '月度预算', today: '今日',
        last7d: '近 7 天', last30d: '近 30 天', input: '输入(未缓存)', cacheRead: '缓存读取',
        cacheWrite: '缓存写入', output: '输出', reasoning: '其中推理', live: '进行中',
        activeToday: '今日活跃', createdMonth: '本月新建', timeline: 'Token 消耗时间线',
        hourly: '今日分时', models: '按模型分布', sessionDetail: '各会话用量与成本',
        cpu: 'CPU 与系统', sysCpu: '系统 CPU', procCpu: 'Harness 进程 CPU', ofCore: '单核',
        gpuMem: '在用内存', gpuRenderer: '渲染', gpuTiler: '分块',
        cores: '核', load: '负载', memSys: '系统内存', memProc: '进程内存 (RSS)', uptimeProc: '进程运行',
        uptimeSys: '系统运行', settings: '价格与预算设置', currency: '货币符号', per1m: '单价（每 100 万 token）',
        defaultPrice: '默认单价', save: '保存', reset: '恢复默认', saved: '已保存',
        search: '搜索标题 / 模型 / ID', sort: '排序', byTotal: '总用量', byCost: '估算成本',
        byRecent: '最近活动', byCreated: '创建时间', title: '会话', model: '模型', created: '创建时间',
        recent: '最近活动', turns: '轮/消息', share: '占比', cost: '估算成本', showAll: '显示全部',
        showLess: '收起', loading: '正在读取真实会话统计…', indexing: '正在索引会话日志',
        estNote: '成本为按可编辑单价计算的估算值，非服务商账单；数据来自本机真实会话日志。',
        predicted: '按当前节奏预计月底', overBudget: '已超出预算', ofBudget: '预算已用',
        refresh: '刷新', auto: '自动刷新', off: '关', seconds: '秒', open: '打开统计面板',
        noData: '暂无数据', error: '读取失败', retry: '重试', updatedAt: '更新于',
        tokensUnit: 'token', perSession: '平均每会话', withUsage: '有消耗会话',
        range: '范围', days: '天', all: '全部', metric: '指标', estCostShort: '估算成本',
        priceFor: '单价', budgetNote: '预算按自然月计算（本月估算成本 / 月度预算）。',
        dayTokens: '当日 Token', hourTokens: '分时 Token',
        tabDesc: '真实会话 Token 用量、成本预算与 CPU 监测', topSessions: '用量最高的会话',
        openFull: '打开完整面板', last30: '近 30 天',
        priceMode: '计价方式', officialPrices: '官方历史价（按请求时段）', customPrices: '自定义单价',
        coverage: '已计价', unpricedPart: '未计价', proxyPart: '其中代理底层价',
        priceSources: '官方价格出处（按请求时段适用）', fetchedOn: '抓取于',
        officialBadge: '官方价', unpricedBadge: '无官方价', proxyBadge: '代理底层价',
      },
      en: {
        panel: 'Token Stats', totalTokens: 'Total tokens', sessions: 'Sessions', requests: 'Model requests',
        estCost: 'Estimated total cost', monthCost: 'Cost this month (est.)', budget: 'Monthly budget', today: 'Today',
        last7d: 'Last 7 days', last30d: 'Last 30 days', input: 'Input (uncached)', cacheRead: 'Cache read',
        cacheWrite: 'Cache write', output: 'Output', reasoning: 'incl. reasoning', live: 'live',
        activeToday: 'active today', createdMonth: 'created this month', timeline: 'Token timeline',
        hourly: 'Today by hour', models: 'By model', sessionDetail: 'Per-session usage & cost',
        cpu: 'CPU & system', sysCpu: 'System CPU', procCpu: 'Harness process CPU', ofCore: 'of one core',
        gpuMem: 'memory in use', gpuRenderer: 'renderer', gpuTiler: 'tiler',
        cores: 'cores', load: 'Load', memSys: 'System memory', memProc: 'Process memory (RSS)', uptimeProc: 'Process uptime',
        uptimeSys: 'System uptime', settings: 'Prices & budget', currency: 'Currency symbol', per1m: 'Price (per 1M tokens)',
        defaultPrice: 'Default price', save: 'Save', reset: 'Reset defaults', saved: 'Saved',
        search: 'Search title / model / ID', sort: 'Sort', byTotal: 'Total usage', byCost: 'Est. cost',
        byRecent: 'Most recent', byCreated: 'Created', title: 'Session', model: 'Model', created: 'Created',
        recent: 'Last active', turns: 'Turns/Msgs', share: 'Share', cost: 'Est. cost', showAll: 'Show all',
        showLess: 'Show less', loading: 'Loading real session statistics…', indexing: 'Indexing session logs',
        estNote: 'Costs are estimates from editable prices, not provider billing; data is folded from your real local session logs.',
        predicted: 'Projected month-end at current pace', overBudget: 'Over budget', ofBudget: 'of budget used',
        refresh: 'Refresh', auto: 'Auto-refresh', off: 'Off', seconds: 's', open: 'Open token stats panel',
        noData: 'No data yet', error: 'Failed to load', retry: 'Retry', updatedAt: 'Updated',
        tokensUnit: 'tokens', perSession: 'avg / session', withUsage: 'sessions with usage',
        range: 'Range', days: 'd', all: 'All', metric: 'Metric', estCostShort: 'Est. cost',
        priceFor: 'Price', budgetNote: 'Budget uses the calendar month (month-to-date est. cost / monthly budget).',
        dayTokens: 'Tokens', hourTokens: 'Tokens by hour',
        tabDesc: 'Real session token usage, cost budget and CPU monitoring', topSessions: 'Top sessions by usage',
        openFull: 'Open full dashboard', last30: 'Last 30 days',
        priceMode: 'Pricing', officialPrices: 'Official historical prices (by request time)', customPrices: 'Custom prices',
        coverage: 'priced', unpricedPart: 'unpriced', proxyPart: 'incl. proxy underlying',
        priceSources: 'Official price sources (as of each request)', fetchedOn: 'fetched',
        officialBadge: 'official', unpricedBadge: 'no official price', proxyBadge: 'proxy underlying',
      },
    };

    function lang() {
      try {
        const active = CTX?.locale?.getSnapshot?.().active;
        if (typeof active === 'string' && active.toLowerCase().startsWith('en')) return 'en';
      } catch { /* fall through */ }
      return 'zh';
    }
    function t(key) {
      return STR[lang()][key] ?? STR.zh[key] ?? key;
    }

    /**
     * "CPU与系统" title: Latin capitals render ~28% shorter than CJK
     * glyphs at the same font-size and carry wide side bearings, which
     * reads as a gap plus smaller letters. Scale the CPU part up to
     * CJK cap height and pull it tight against the following text.
     */
    function cpuTitle() {
      const s = t('cpu');
      if (lang() !== 'zh' || !s.startsWith('CPU')) return s;
      return h(React.Fragment, null,
        h('span', { style: { fontSize: '1.22em', letterSpacing: '-0.01em' } }, 'CPU'),
        s.slice(3)); // ' 与系统' — exactly one space, as requested
    }

    // ------------------------------------------------------------ settings
    const DEFAULT_SETTINGS = {
      mode: 'official', // 'official' = vendor prices effective at request time; 'custom' = user prices below
      currency: '$',
      budget: 50,
      prices: { '*': { input: 0.3, cacheRead: 0.03, cacheWrite: 0.3, output: 1.2 } },
    };
    function loadSettings() {
      try {
        const raw = window.localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            mode: parsed.mode === 'custom' ? 'custom' : 'official',
            currency: typeof parsed.currency === 'string' && parsed.currency ? parsed.currency : '$',
            budget: Number.isFinite(parsed.budget) ? parsed.budget : 50,
            prices: { ...DEFAULT_SETTINGS.prices, ...(parsed.prices ?? {}) },
          };
        }
      } catch { /* ignore */ }
      return structuredClone(DEFAULT_SETTINGS);
    }
    function saveSettings(settings) {
      try { window.localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
    }

    function priceFor(settings, model) {
      return settings.prices[model] ?? settings.prices['*'];
    }
    /** Estimated cost of one token bucket under a model's price (per 1M). */
    function costOf(buckets, settings, model) {
      const p = priceFor(settings, model);
      return (
        buckets.input * p.input +
        buckets.cacheRead * p.cacheRead +
        buckets.cacheWrite * p.cacheWrite +
        buckets.output * p.output
      ) / 1e6;
    }
    function sessionCost(session, settings) {
      if (Array.isArray(session.models) && session.models.length > 0) {
        return session.models.reduce((sum, m) => sum + costOf(m, settings, m.model), 0);
      }
      return costOf(session.buckets, settings, '*');
    }
    /** Correction so bucket-mix-only series (daily/hourly) track model mix. */
    function blendFactor(data, settings) {
      if (!data) return 1;
      const raw = costOf(data.totals, settings, '*');
      if (raw <= 0) return 1;
      const real = data.sessions.reduce((sum, s) => sum + sessionCost(s, settings), 0);
      return real / raw;
    }

    // Mode-aware cost accessors. In 'official' mode the Host has already
    // priced every usage sample with the vendor price effective at that
    // sample's timestamp (incl. DeepSeek peak/off-peak), so the client
    // just reads cost/costProxy off the payload. In 'custom' mode it
    // falls back to the user's flat per-model prices.
    const isOfficial = (settings) => settings.mode !== 'custom';
    // Official mode prices each sample in the vendor's own currency
    // (CNY for Chinese vendors, USD otherwise); aggregates are shown in
    // CAD using the Bank of Canada rates served in data.pricing.fx.
    const fxOf = (data) => data?.pricing?.fx ?? { usdCad: 1.3978, cnyCad: 0.2102 };
    function toCad(data, x) {
      const fx = fxOf(data);
      return ((x.cny ?? 0) + (x.cnyProxy ?? 0)) * fx.cnyCad
        + ((x.usd ?? 0) + (x.usdProxy ?? 0)) * fx.usdCad;
    }
    function sessCost(data, settings, s) {
      return isOfficial(settings) ? toCad(data, s) : sessionCost(s, settings);
    }
    function bucketCost(data, settings, b) {
      return isOfficial(settings)
        ? toCad(data, b)
        : costOf(b, settings, '*') * blendFactor(data, settings);
    }
    function totalCostOf(data, settings) {
      return isOfficial(settings)
        ? toCad(data, data.totals)
        : data.sessions.reduce((sum, s) => sum + sessionCost(s, settings), 0);
    }
    /** Per-model display: Chinese vendors in ¥, others converted to CA$. */
    function modelMoney(data, settings, m) {
      if (!isOfficial(settings)) return fmtMoney(costOf(m, settings, m.model), settings.currency);
      if (m.currency === 'CNY') return fmtMoney((m.cny ?? 0) + (m.cnyProxy ?? 0), '¥');
      if (m.currency === 'USD') return fmtMoney(((m.usd ?? 0) + (m.usdProxy ?? 0)) * fxOf(data).usdCad, 'CA$');
      return fmtMoney(0, 'CA$');
    }
    function currencyOf(settings) {
      return isOfficial(settings) ? 'CA$' : settings.currency;
    }

    // ------------------------------------------------------------ formatting
    function fmtTokens(n) {
      return new Intl.NumberFormat(lang() === 'zh' ? 'zh-CN' : 'en-US', {
        notation: 'compact', maximumFractionDigits: 2,
      }).format(n ?? 0);
    }
    function fmtInt(n) {
      return new Intl.NumberFormat(lang() === 'zh' ? 'zh-CN' : 'en-US').format(n ?? 0);
    }
    function fmtMoney(n, currency) {
      const v = n ?? 0;
      const digits = v !== 0 && Math.abs(v) < 0.01 ? 4 : 2;
      return `${currency}${v.toFixed(digits)}`;
    }
    function fmtBytes(n) {
      if (!n) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
      return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    }
    function fmtDuration(sec) {
      const s = Math.max(0, Math.floor(sec ?? 0));
      const d = Math.floor(s / 86400);
      const hh = Math.floor((s % 86400) / 3600);
      const mm = Math.floor((s % 3600) / 60);
      if (d > 0) return `${d}d ${hh}h`;
      if (hh > 0) return `${hh}h ${mm}m`;
      return `${mm}m`;
    }
    function fmtDate(ts) {
      if (!ts) return '—';
      const d = new Date(ts);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function fmtDay(day) {
      return day.slice(5);
    }

    // ---------------------------------------------------------------- data
    function useStats(refreshMs) {
      const [state, setState] = useState({ data: null, error: null, at: 0 });
      const tick = useRef(0);
      const load = async () => {
        const mine = ++tick.current;
        try {
          const res = await fetch(API, { headers: { accept: 'application/json' } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (mine === tick.current) setState({ data, error: null, at: Date.now() });
        } catch (error) {
          if (mine === tick.current) {
            setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : String(error) }));
          }
        }
      };
      useEffect(() => {
        load();
        if (!refreshMs) return undefined;
        const timer = setInterval(load, refreshMs);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [refreshMs]);
      return { ...state, reload: load };
    }

    function openPanel() {
      try {
        const layout = CTX?.get?.('layout') ?? CTX?.layout;
        layout?.selectPanel?.(PANEL_ID);
      } catch { /* layout unavailable */ }
    }

    // -------------------------------------------------------------- styles
    const V = {
      bg: 'var(--dsw-alias-bg-base)', layer1: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)', overlay: 'var(--dsw-alias-bg-overlay)',
      b1: 'var(--dsw-alias-border-l1)', b2: 'var(--dsw-alias-border-l2)',
      brand: 'var(--dsw-alias-brand-primary)', fg: 'var(--dsw-alias-label-primary)',
      fg2: 'var(--dsw-alias-label-secondary)', err: 'var(--dsw-alias-state-error-primary)',
      ok: 'var(--dsw-alias-state-success-primary)', warn: 'var(--dsw-alias-state-warn-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    };
    const cardStyle = {
      background: V.layer1, border: `1px solid ${V.b1}`, borderRadius: 12, padding: '12px 14px',
    };
    const labelStyle = { fontSize: 12, color: V.fg2, marginBottom: 4 };
    const valueStyle = { fontSize: 22, fontWeight: 650, color: V.fg, lineHeight: 1.2 };
    const subStyle = { fontSize: 12, color: V.fg2, marginTop: 4, lineHeight: 1.5 };
    const btnStyle = {
      background: V.layer2, color: V.fg, border: `1px solid ${V.b2}`, borderRadius: 8,
      padding: '4px 10px', fontSize: 12, cursor: 'pointer',
    };
    const inputStyle = {
      background: V.bg, color: V.fg, border: `1px solid ${V.b2}`, borderRadius: 8,
      padding: '5px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box',
    };
    const sectionTitle = { fontSize: 14, fontWeight: 650, color: V.fg, margin: '0 0 10px' };

    function Card({ label, value, sub, accent }) {
      return h('div', { style: cardStyle },
        h('div', { style: labelStyle }, label),
        h('div', { style: { ...valueStyle, ...(accent ? { color: accent } : {}) } }, value),
        sub ? h('div', { style: subStyle }, sub) : null);
    }

    function Bar({ pct, color }) {
      return h('div', { style: { height: 6, borderRadius: 3, background: V.layer2, overflow: 'hidden', minWidth: 60 } },
        h('div', { style: { height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color ?? V.brand, borderRadius: 3 } }));
    }

    // -------------------------------------------------------------- charts
    function BarsChart({ rows, valueOf, labelOf, titleOf, color }) {
      const width = 640; const height = 170; const padB = 18; const padT = 8;
      const max = Math.max(1, ...rows.map(valueOf));
      const step = width / Math.max(1, rows.length);
      const barW = Math.max(2, Math.min(18, step * 0.68));
      const labelEvery = Math.max(1, Math.ceil(rows.length / 10));
      return h('svg', {
        viewBox: `0 0 ${width} ${height}`, style: { width: '100%', height: 'auto', display: 'block' },
        role: 'img',
      },
        rows.map((row, i) => {
          const v = valueOf(row);
          const bh = Math.max(v > 0 ? 2 : 0, (v / max) * (height - padB - padT));
          const x = i * step + (step - barW) / 2;
          const y = height - padB - bh;
          return h('g', { key: labelOf(row) + i },
            h('rect', { x, y, width: barW, height: bh, rx: 2, fill: color ?? V.brand, opacity: 0.88 },
              h('title', null, titleOf(row))),
            i % labelEvery === 0
              ? h('text', { x: x + barW / 2, y: height - 4, textAnchor: 'middle', fontSize: 9, fill: V.fg2 }, labelOf(row))
              : null);
        }));
    }

    function CpuChart({ series }) {
      const width = 640; const height = 150; const padB = 8; const padT = 8;
      const pts = (get) => series.map((s, i) => {
        const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * width;
        const y = height - padB - (Math.min(100, Math.max(0, get(s))) / 100) * (height - padB - padT);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      return h('svg', { viewBox: `0 0 ${width} ${height}`, style: { width: '100%', height: 'auto', display: 'block' }, role: 'img' },
        [25, 50, 75].map((p) => {
          const y = height - padB - (p / 100) * (height - padB - padT);
          return h('line', { key: p, x1: 0, x2: width, y1: y, y2: y, stroke: V.b1, strokeWidth: 1 });
        }),
        series.length > 1 ? h('polyline', { points: pts((s) => s.sysPct), fill: 'none', stroke: V.brand, strokeWidth: 1.8 }) : null,
        series.length > 1 ? h('polyline', { points: pts((s) => s.procPct), fill: 'none', stroke: V.warn, strokeWidth: 1.5 }) : null);
    }

    // ------------------------------------------------------- right sidebar
    function StatsIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 16;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        'aria-hidden': true, className: props && props.className,
      },
        h('rect', { x: 4, y: 12, width: 4, height: 7, rx: 1, fill: 'currentColor', opacity: 0.55 }),
        h('rect', { x: 10, y: 8, width: 4, height: 11, rx: 1, fill: 'currentColor', opacity: 0.8 }),
        h('rect', { x: 16, y: 4, width: 4, height: 15, rx: 1, fill: 'currentColor' }));
    }

    function MiniCard({ label, value, sub }) {
      return h('div', { style: { ...cardStyle, padding: '9px 10px' } },
        h('div', { style: labelStyle }, label),
        h('div', { style: { fontSize: 17, fontWeight: 650, color: V.fg, lineHeight: 1.2 } }, value),
        sub ? h('div', { style: { ...subStyle, marginTop: 2 } }, sub) : null);
    }

    /** Compact single-column dashboard for the right sidebar tab. */
    function SidebarStats() {
      const { data, error, at, reload } = useStats(5000);
      const [settings] = useState(loadSettings);
      if (!data) {
        return h('div', { style: { padding: 16, color: V.fg2, fontSize: 13, background: V.bg, minHeight: '100%', boxSizing: 'border-box' } },
          h('div', { style: { fontSize: 15, fontWeight: 700, color: V.fg, marginBottom: 8 } }, t('panel')),
          error ? h('div', { style: { color: V.err } }, `${t('error')}: ${error} `,
            h('button', { type: 'button', style: btnStyle, onClick: reload }, t('retry'))) : t('loading'));
      }
      const cur = currencyOf(settings);
      const monthCost = bucketCost(data, settings, data.windows.monthToDate);
      const totalCost = totalCostOf(data, settings);
      const budgetPct = settings.budget > 0 ? (monthCost / settings.budget) * 100 : 0;
      const nowDate = new Date();
      const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
      const predicted = monthCost > 0 ? (monthCost / nowDate.getDate()) * daysInMonth : 0;
      const daily30 = data.daily.slice(-30);
      const todayHours = data.hourly.filter((r) => r.hour.startsWith(data.windows.today.day));
      const section = (titleText, body) => h('div', { style: { ...cardStyle, marginBottom: 10 } },
        h('div', { style: { ...sectionTitle, fontSize: 13 } }, titleText), body);

      return h('div', {
        style: {
          background: V.bg, color: V.fg, minHeight: '100%', overflowY: 'auto',
          padding: '14px 12px 24px', boxSizing: 'border-box', fontFamily: 'inherit',
        },
      },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
          h('div', { style: { fontSize: 15, fontWeight: 700 } }, t('panel')),
          data.indexing && !data.indexing.done
            ? h('span', { style: { fontSize: 11, color: V.warn } }, `${t('indexing')} ${data.indexing.scanned}/${data.indexing.total}…`)
            : null,
          h('span', { style: { flex: 1 } }),
          h('span', { style: { fontSize: 11, color: V.fg2 } }, at ? fmtDate(at) : ''),
          h('button', { type: 'button', style: { ...btnStyle, padding: '2px 8px' }, onClick: reload }, t('refresh'))),
        error ? h('div', { style: { color: V.err, fontSize: 12, marginBottom: 8 } }, `${t('error')}: ${error}`) : null,

        h('div', { style: { ...cardStyle, marginBottom: 10 } },
          h('div', { style: labelStyle }, t('totalTokens')),
          h('div', { style: { fontSize: 24, fontWeight: 700, color: V.fg } }, fmtTokens(data.totals.total)),
          h('div', { style: subStyle },
            `${t('input')} ${fmtTokens(data.totals.input)} · ${t('cacheRead')} ${fmtTokens(data.totals.cacheRead)} · ${t('output')} ${fmtTokens(data.totals.output)}`)),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 } },
          h(MiniCard, { label: t('sessions'), value: fmtInt(data.counts.sessions), sub: `${t('live')} ${data.counts.live} · ${t('activeToday')} ${data.counts.activeToday}` }),
          h(MiniCard, { label: t('requests'), value: fmtInt(data.totals.requests), sub: `${t('today')} ${fmtInt(data.windows.today.requests)}` }),
          h(MiniCard, { label: t('estCost'), value: fmtMoney(totalCost, cur), sub: `${t('today')} ${fmtMoney(bucketCost(data, settings, data.windows.today), cur)}` }),
          h(MiniCard, { label: t('today'), value: fmtTokens(data.windows.today.total), sub: `${t('last7d')} ${fmtTokens(data.windows.last7d.total)}` })),

        section(cpuTitle(),
          data.cpu ? h(React.Fragment, null,
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 } },
              h('div', null, h('div', { style: labelStyle }, t('sysCpu')),
                h('div', { style: { fontSize: 18, fontWeight: 650 } }, `${data.cpu.now.sysPct}%`),
                h(Bar, { pct: data.cpu.now.sysPct })),
              h('div', null, h('div', { style: labelStyle }, t('procCpu')),
                h('div', { style: { fontSize: 18, fontWeight: 650 } }, `${data.cpu.now.procPct}%`),
                h(Bar, { pct: data.cpu.now.procPct, color: V.warn }))),
            h(CpuChart, { series: data.cpu.series }),
            h('div', { style: { ...subStyle, fontSize: 11 } },
              `${data.cpu.now.cores} ${t('cores')} · ${t('load')} ${data.cpu.now.loadavg.join(' / ')} · ${t('memProc')} ${fmtBytes(data.cpu.now.memProc.rss)} · ${t('uptimeProc')} ${fmtDuration(data.cpu.now.procUptimeSec)}`))
            : h('div', { style: subStyle }, t('noData'))),

        // Slim GPU strip (Apple Silicon via ioreg; hidden when unreadable).
        data.gpu && data.gpu.now ? h('div', { style: { ...cardStyle, marginBottom: 10, padding: '8px 12px 10px' } },
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
            h('span', { style: { fontSize: 12, fontWeight: 650, color: V.fg } }, 'GPU'),
            h('span', { style: { fontSize: 11, color: V.fg2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              `${data.gpu.now.name ?? ''}${data.gpu.now.cores ? ` · ${data.gpu.now.cores} ${t('cores')}` : ''}`),
            h('span', { style: { flex: 1 } }),
            h('span', { style: { fontSize: 16, fontWeight: 700, color: V.fg } }, `${data.gpu.now.util}%`)),
          h(Bar, { pct: data.gpu.now.util, color: V.brand }),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 } },
            h('div', { style: { ...subStyle, flex: 1, fontSize: 11 } },
              `${t('gpuMem')} ${fmtBytes(data.gpu.now.memInUse)} · ${t('gpuRenderer')} ${data.gpu.now.renderer}% · ${t('gpuTiler')} ${data.gpu.now.tiler}%`),
            data.gpu.series.length > 1 ? h('svg', {
              width: 72, height: 18, viewBox: '0 0 72 18', preserveAspectRatio: 'none', 'aria-hidden': true,
              style: { flexShrink: 0 },
            },
              h('polyline', {
                fill: 'none', stroke: V.brand, strokeWidth: 1.2,
                points: data.gpu.series.map((p, i, arr) => `${(i / Math.max(1, arr.length - 1)) * 72},${18 - (Math.min(100, p.util) / 100) * 16 - 1}`).join(' '),
              })) : null)) : null,

        section(`${t('timeline')} · ${t('last30')}`,
          daily30.length > 0
            ? h(BarsChart, {
                rows: daily30, valueOf: (r) => r.total,
                labelOf: (r) => fmtDay(r.day),
                titleOf: (r) => `${r.day} · ${fmtInt(r.total)} ${t('tokensUnit')} · ${fmtMoney(bucketCost(data, settings, r), cur)}`,
              })
            : h('div', { style: subStyle }, t('noData'))),
        section(t('hourly'),
          todayHours.length > 0
            ? h(BarsChart, {
                rows: todayHours, valueOf: (r) => r.total,
                labelOf: (r) => r.hour.slice(11) + ':00',
                titleOf: (r) => `${r.hour}:00 · ${fmtInt(r.total)} ${t('tokensUnit')}`,
                color: V.warn,
              })
            : h('div', { style: subStyle }, t('noData'))),
        section(`${t('models')}${data.models.length > 5 ? ` · ${data.models.length}` : ''}`,
          data.models.length === 0 ? h('div', { style: subStyle }, t('noData'))
            : h('div', { style: { maxHeight: 196, overflowY: 'auto', paddingRight: 4 } },
                data.models.map((m) => h('div', { key: m.model, style: { marginBottom: 8 } },
                  h('div', { style: { display: 'flex', gap: 6, fontSize: 12, alignItems: 'baseline' } },
                    h('span', { style: { color: V.fg, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, m.model),
                    h('span', { style: { flex: 1 } }),
                    h('span', { style: { color: V.fg2, whiteSpace: 'nowrap' } }, `${fmtTokens(m.total)}`),
                    h('span', { style: { color: V.brand, whiteSpace: 'nowrap' } }, modelMoney(data, settings, m))),
                  h(Bar, { pct: m.share * 100 }))))),
        section(`${t('topSessions')}${data.sessions.length > 8 ? ` · Top ${Math.min(100, data.sessions.length)}` : ''}`,
          data.sessions.length === 0 ? h('div', { style: subStyle }, t('noData'))
            : h('div', { style: { maxHeight: 480, overflowY: 'auto', paddingRight: 4 } },
                data.sessions.slice(0, 100).map((s, i) => h('div', {
                  key: s.id,
                  style: { display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 0', borderBottom: `1px solid ${V.b1}` },
                },
                  h('div', { style: { color: V.idle, fontSize: 11, width: 26, flexShrink: 0, textAlign: 'right' } }, `${i + 1}`),
                  h('div', { style: { flex: 1, minWidth: 0 } },
                    h('div', {
                      style: { color: V.fg, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                      title: s.title ?? s.id,
                    }, s.title ?? s.id.slice(0, 13)),
                    h('div', { style: { color: V.idle, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                      `${s.mainModel}${s.live ? ` · ${t('live')}` : ''}`)),
                  h('div', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
                    h('div', { style: { color: V.fg, fontSize: 12, fontWeight: 600 } }, fmtTokens(s.total)),
                    h('div', { style: { color: V.brand, fontSize: 11 } }, fmtMoney(sessCost(data, settings, s), cur))))))),
        h('div', { style: { ...cardStyle, marginBottom: 10 } },
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' } },
            h('div', { style: { ...sectionTitle, fontSize: 13 } }, t('budget')),
            h('span', { style: { fontSize: 12, color: V.fg2 } },
              `${fmtMoney(monthCost, cur)} / ${fmtMoney(settings.budget, cur)} · ${budgetPct.toFixed(1)}%`),
            budgetPct >= 100 ? h('span', { style: { fontSize: 12, color: V.err, fontWeight: 650 } }, t('overBudget')) : null),
          h(Bar, { pct: budgetPct, color: budgetPct >= 100 ? V.err : budgetPct >= 80 ? V.warn : V.ok }),
          predicted > 0 ? h('div', { style: subStyle },
            `${t('predicted')} ${fmtMoney(predicted, cur)}`) : null,
          isOfficial(settings) && data.pricing ? h('div', { style: { ...subStyle, fontSize: 11 } },
            `${t('coverage')} ${(data.pricing.coverage.pricedShare * 100).toFixed(1)}% · ${t('unpricedPart')} ${fmtTokens(data.pricing.coverage.unpricedTokens)} token`) : null),

        h('button', {
          type: 'button', onClick: openPanel,
          style: { ...btnStyle, width: '100%', padding: '7px 10px', marginBottom: 8 },
        }, t('openFull')),
        h('div', { style: { fontSize: 11, color: V.idle, lineHeight: 1.6 } },
          `${t('estNote')} · ${fmtDate(data.generatedAt)}`));
    }

    /** Native right-sidebar fallback body (betterSidebar absent). */
    function NativeBody() {
      return h(SidebarStats, null);
    }

    function safeGet(name) {
      try { return typeof CTX?.get === 'function' ? CTX.get(name) : undefined; } catch { return undefined; }
    }

    // ---------------------------------------------------------------- icon
    // Plain SVG like every shipped panel icon: the shell's panel-row button
    // owns the click. Rendering our own <button> here was what set this row
    // apart (theme button styling boxed only this icon).
    function PanelIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 18;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block', color: V.fg2 },
      },
        h('rect', { x: 4, y: 12, width: 4, height: 7, rx: 1, fill: 'currentColor', opacity: 0.55 }),
        h('rect', { x: 10, y: 8, width: 4, height: 11, rx: 1, fill: 'currentColor', opacity: 0.8 }),
        h('rect', { x: 16, y: 4, width: 4, height: 15, rx: 1, fill: 'currentColor' }));
    }

    /**
     * Framed sidebar panel rows. The user liked the boxed look this plugin's
     * row had and asked for every sidebar panel entry to get the same frame.
     * Scoped strictly to the shell's panel list (panelRow/panelGlyph class
     * names, hash-prefix tolerant) and built only from theme tokens, so it
     * follows light/dark themes. Removed when the plugin unloads.
     */
    const SIDEBAR_FRAME_CSS = `
button[class*="panelRow"] {
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
button[class*="panelRow"]:hover {
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-interactive-bg-hover);
}
button[class*="panelRow"][aria-current="page"] {
  border-color: var(--dsw-alias-brand-primary);
}
span[class*="panelGlyph"] {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-2);
  min-width: 24px;
  height: 24px;
  box-sizing: border-box;
}
`;

    // ---------------------------------------------------------------- page
    function StatsPage() {
      const [refreshMs, setRefreshMs] = useState(5000);
      const { data, error, at, reload } = useStats(refreshMs);
      const [settings, setSettings] = useState(loadSettings);
      const [draft, setDraft] = useState(null);
      const [savedAt, setSavedAt] = useState(0);
      const [rangeDays, setRangeDays] = useState(30);
      const [metric, setMetric] = useState('tokens');
      const [query, setQuery] = useState('');
      const [sort, setSort] = useState('total');
      const [showAll, setShowAll] = useState(false);
      const [showSettings, setShowSettings] = useState(false);

      const effective = draft ?? settings;
      const monthCost = data ? bucketCost(data, effective, data.windows.monthToDate) : 0;
      const totalCost = data ? totalCostOf(data, effective) : 0;
      const budgetPct = effective.budget > 0 ? (monthCost / effective.budget) * 100 : 0;
      const nowDate = new Date();
      const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
      const predicted = monthCost > 0 ? (monthCost / nowDate.getDate()) * daysInMonth : 0;

      const dailyRows = useMemo(() => {
        if (!data) return [];
        const rows = rangeDays > 0 ? data.daily.slice(-rangeDays) : data.daily;
        return rows;
      }, [data, rangeDays]);

      const todayHours = useMemo(() => {
        if (!data) return [];
        const today = data.windows.today.day;
        return data.hourly.filter((r) => r.hour.startsWith(today));
      }, [data]);

      const sortedSessions = useMemo(() => {
        if (!data) return [];
        const q = query.trim().toLowerCase();
        const rows = data.sessions.filter((s) => !q
          || (s.title ?? '').toLowerCase().includes(q)
          || s.mainModel.toLowerCase().includes(q)
          || s.id.toLowerCase().includes(q));
        const cost = new Map(rows.map((s) => [s.id, sessCost(data, effective, s)]));
        const by = {
          total: (a, b) => b.total - a.total,
          cost: (a, b) => (cost.get(b.id) ?? 0) - (cost.get(a.id) ?? 0),
          recent: (a, b) => b.updatedAt - a.updatedAt,
          created: (a, b) => b.createdAt - a.createdAt,
        }[sort];
        return [...rows].sort(by).map((s) => ({ ...s, _cost: cost.get(s.id) ?? 0 }));
      }, [data, query, sort, effective]);

      if (!data) {
        return h('div', { style: { padding: 24, color: V.fg2, fontSize: 13, background: V.bg, minHeight: '100%' } },
          h('div', { style: { fontSize: 16, fontWeight: 650, color: V.fg, marginBottom: 8 } }, t('panel')),
          error ? h('div', { style: { color: V.err } }, `${t('error')}: ${error} `,
            h('button', { type: 'button', style: btnStyle, onClick: reload }, t('retry'))) : t('loading'));
      }

      const cur = currencyOf(effective);
      const valueOfDay = (row) => (metric === 'tokens' ? row.total : bucketCost(data, effective, row));
      const shownSessions = showAll ? sortedSessions : sortedSessions.slice(0, 30);

      const priceInputs = (modelKey, label) => {
        const p = effective.prices[modelKey] ?? { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
        const field = (name, val) => h('label', { style: { display: 'grid', gap: 3, fontSize: 11, color: V.fg2 } },
          t(name),
          h('input', {
            type: 'number', step: '0.01', min: '0', value: val, style: inputStyle,
            onChange: (e) => {
              const next = structuredClone(effective);
              next.prices[modelKey] = { ...(next.prices[modelKey] ?? { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }), [name === 'input' ? 'input' : name]: Number(e.target.value) };
              setDraft(next);
            },
          }));
        return h('div', { style: { marginBottom: 12 } },
          h('div', { style: { fontSize: 12, color: V.fg, marginBottom: 6 } }, `${t('priceFor')} · ${label}`),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 } },
            field('input', p.input), field('cacheRead', p.cacheRead), field('cacheWrite', p.cacheWrite), field('output', p.output)));
      };

      return h('div', {
        style: {
          background: V.bg, color: V.fg, minHeight: '100%', overflowY: 'auto',
          padding: '18px 20px 32px', boxSizing: 'border-box',
          fontFamily: 'inherit',
        },
      },
        // header
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 } },
          h('div', { style: { fontSize: 18, fontWeight: 700 } }, t('panel')),
          data.indexing && !data.indexing.done
            ? h('span', { style: { fontSize: 12, color: V.warn } },
                `${t('indexing')} ${data.indexing.scanned}/${data.indexing.total}…`)
            : null,
          h('span', { style: { fontSize: 12, color: V.fg2 } }, at ? `${t('updatedAt')} ${fmtDate(at)}` : ''),
          h('span', { style: { flex: 1 } }),
          h('label', { style: { fontSize: 12, color: V.fg2, display: 'inline-flex', gap: 6, alignItems: 'center' } },
            t('auto'),
            h('select', {
              value: String(refreshMs), style: { ...inputStyle, width: 'auto' },
              onChange: (e) => setRefreshMs(Number(e.target.value)),
            },
              h('option', { value: '0' }, t('off')),
              h('option', { value: '3000' }, `3${t('seconds')}`),
              h('option', { value: '5000' }, `5${t('seconds')}`),
              h('option', { value: '15000' }, `15${t('seconds')}`),
              h('option', { value: '30000' }, `30${t('seconds')}`))),
          h('button', { type: 'button', style: btnStyle, onClick: reload }, t('refresh')),
          h('button', { type: 'button', style: btnStyle, onClick: () => { setDraft(settings); setShowSettings(!showSettings); } }, t('settings'))),
        error ? h('div', { style: { color: V.err, fontSize: 12, marginBottom: 10 } }, `${t('error')}: ${error}`) : null,

        // KPI cards
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 } },
          h(Card, {
            label: t('totalTokens'), value: fmtTokens(data.totals.total),
            sub: `${t('input')} ${fmtTokens(data.totals.input)} · ${t('cacheRead')} ${fmtTokens(data.totals.cacheRead)}`
              + (data.totals.cacheWrite ? ` · ${t('cacheWrite')} ${fmtTokens(data.totals.cacheWrite)}` : '')
              + ` · ${t('output')} ${fmtTokens(data.totals.output)}`
              + (data.totals.reasoning ? ` (${t('reasoning')} ${fmtTokens(data.totals.reasoning)})` : ''),
          }),
          h(Card, {
            label: t('sessions'), value: fmtInt(data.counts.sessions),
            sub: `${t('live')} ${data.counts.live} · ${t('activeToday')} ${data.counts.activeToday} · ${t('withUsage')} ${data.counts.withUsage} · ${t('createdMonth')} ${data.counts.createdThisMonth}`,
          }),
          h(Card, {
            label: t('requests'), value: fmtInt(data.totals.requests),
            sub: `${t('perSession')} ${fmtTokens(Math.round(data.totals.total / Math.max(1, data.counts.withUsage)))} ${t('tokensUnit')}`,
          }),
          h(Card, {
            label: t('estCost'), value: fmtMoney(totalCost, cur), accent: V.brand,
            sub: `${t('monthCost')} ${fmtMoney(monthCost, cur)}`
              + (isOfficial(effective) && data.pricing
                ? ` · DeepSeek ${fmtMoney(data.pricing.coverage.cnyTotal, '¥')} · ${t('coverage')} ${(data.pricing.coverage.pricedShare * 100).toFixed(1)}% · ${t('unpricedPart')} ${fmtTokens(data.pricing.coverage.unpricedTokens)}`
                : ''),
          }),
          h(Card, {
            label: t('today'), value: fmtTokens(data.windows.today.total),
            sub: `${fmtMoney(bucketCost(data, effective, data.windows.today), cur)} · ${fmtInt(data.windows.today.requests)} ${t('requests')}`,
          }),
          h(Card, {
            label: t('last7d'), value: fmtTokens(data.windows.last7d.total),
            sub: `${t('last30d')} ${fmtTokens(data.windows.last30d.total)} · ${fmtMoney(bucketCost(data, effective, data.windows.last30d), cur)}`,
          })),

        // budget
        h('div', { style: { ...cardStyle, marginBottom: 10 } },
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' } },
            h('div', { style: sectionTitle }, t('budget')),
            h('span', { style: { fontSize: 12, color: V.fg2 } },
              `${fmtMoney(monthCost, cur)} / ${fmtMoney(effective.budget, cur)} · ${budgetPct.toFixed(1)}% ${t('ofBudget')}`),
            predicted > 0 ? h('span', { style: { fontSize: 12, color: predicted > effective.budget ? V.err : V.fg2 } },
              `${t('predicted')} ${fmtMoney(predicted, cur)}`) : null,
            budgetPct >= 100 ? h('span', { style: { fontSize: 12, color: V.err, fontWeight: 650 } }, t('overBudget')) : null),
          h(Bar, { pct: budgetPct, color: budgetPct >= 100 ? V.err : budgetPct >= 80 ? V.warn : V.ok }),
          h('div', { style: subStyle }, t('budgetNote'))),

        // timeline
        h('div', { style: { ...cardStyle, marginBottom: 10 } },
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 } },
            h('div', { style: sectionTitle }, t('timeline')),
            h('span', { style: { flex: 1 } }),
            h('label', { style: { fontSize: 12, color: V.fg2 } }, t('range')),
            [7, 30, 90, 180, 0].map((d) => h('button', {
              key: d, type: 'button',
              style: { ...btnStyle, ...(rangeDays === d ? { borderColor: V.brand, color: V.brand } : {}) },
              onClick: () => setRangeDays(d),
            }, d === 0 ? t('all') : `${d}${t('days')}`)),
            h('label', { style: { fontSize: 12, color: V.fg2, marginLeft: 6 } }, t('metric')),
            ['tokens', 'cost'].map((m) => h('button', {
              key: m, type: 'button',
              style: { ...btnStyle, ...(metric === m ? { borderColor: V.brand, color: V.brand } : {}) },
              onClick: () => setMetric(m),
            }, m === 'tokens' ? t('tokensUnit') : t('estCostShort')))),
          dailyRows.length > 0
            ? h(BarsChart, {
                rows: dailyRows, valueOf: valueOfDay,
                labelOf: (r) => fmtDay(r.day),
                titleOf: (r) => `${r.day} · ${fmtInt(r.total)} ${t('tokensUnit')} · ${fmtMoney(bucketCost(data, effective, r), cur)} · ${fmtInt(r.requests)} ${t('requests')}`,
              })
            : h('div', { style: subStyle }, t('noData')),
          h('div', { style: { ...labelStyle, marginTop: 12 } }, t('hourly')),
          todayHours.length > 0
            ? h(BarsChart, {
                rows: todayHours, valueOf: valueOfDay,
                labelOf: (r) => r.hour.slice(11) + ':00',
                titleOf: (r) => `${r.hour}:00 · ${fmtInt(r.total)} ${t('tokensUnit')} · ${fmtInt(r.requests)} ${t('requests')}`,
                color: V.warn,
              })
            : h('div', { style: subStyle }, t('noData'))),

        // models + cpu side by side
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10, marginBottom: 10 } },
          h('div', { style: cardStyle },
            h('div', { style: sectionTitle }, t('models')),
            data.models.length === 0 ? h('div', { style: subStyle }, t('noData'))
              : data.models.map((m) => h('div', { key: m.model, style: { marginBottom: 10 } },
                  h('div', { style: { display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' } },
                    h('span', { style: { color: V.fg, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, m.model),
                    isOfficial(effective) && m.basis === null
                      ? h('span', { style: { fontSize: 10, color: V.warn, border: `1px solid ${V.warn}`, borderRadius: 6, padding: '0 5px', whiteSpace: 'nowrap' } }, t('unpricedBadge'))
                      : isOfficial(effective) && m.basis === 'official-underlying-proxy'
                        ? h('span', { style: { fontSize: 10, color: V.fg2, border: `1px solid ${V.b2}`, borderRadius: 6, padding: '0 5px', whiteSpace: 'nowrap' } }, t('proxyBadge'))
                        : null,
                    h('span', { style: { flex: 1 } }),
                    h('span', { style: { color: V.fg2 } }, `${fmtTokens(m.total)} · ${(m.share * 100).toFixed(1)}%`),
                    h('span', { style: { color: V.brand } }, modelMoney(data, effective, m))),
                  h(Bar, { pct: m.share * 100 }),
                  h('div', { style: { fontSize: 11, color: V.fg2, marginTop: 3 } },
                    `${t('input')} ${fmtTokens(m.input)} · ${t('cacheRead')} ${fmtTokens(m.cacheRead)} · ${t('output')} ${fmtTokens(m.output)} · ${fmtInt(m.requests)} ${t('requests')}`)))),
          h('div', { style: cardStyle },
            h('div', { style: sectionTitle }, cpuTitle()),
            data.cpu ? h(React.Fragment, null,
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 } },
                h('div', null, h('div', { style: labelStyle }, t('sysCpu')),
                  h('div', { style: { fontSize: 20, fontWeight: 650 } }, `${data.cpu.now.sysPct}%`),
                  h(Bar, { pct: data.cpu.now.sysPct })),
                h('div', null, h('div', { style: labelStyle }, t('procCpu')),
                  h('div', { style: { fontSize: 20, fontWeight: 650 } }, `${data.cpu.now.procPct}%`),
                  h('div', { style: { fontSize: 11, color: V.fg2 } }, `${data.cpu.now.procPctOfCore}% ${t('ofCore')}`),
                  h(Bar, { pct: data.cpu.now.procPct, color: V.warn }))),
              h(CpuChart, { series: data.cpu.series }),
              h('div', { style: { ...subStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' } },
                h('span', null, `${data.cpu.now.cores} ${t('cores')} · ${t('load')} ${data.cpu.now.loadavg.join(' / ')}`),
                h('span', null, `${t('memProc')} ${fmtBytes(data.cpu.now.memProc.rss)}`),
                h('span', null, `${t('memSys')} ${fmtBytes(data.cpu.now.memSys.used)} / ${fmtBytes(data.cpu.now.memSys.total)}`),
                h('span', null, `${t('uptimeProc')} ${fmtDuration(data.cpu.now.procUptimeSec)} · ${t('uptimeSys')} ${fmtDuration(data.cpu.now.sysUptimeSec)}`)),
              h('div', { style: { fontSize: 11, color: V.idle, marginTop: 6 } },
                `${data.cpu.now.platform} · Node ${data.cpu.now.node} · PID ${data.cpu.now.pid}`))
              : h('div', { style: subStyle }, t('noData')))),

        // sessions table
        h('div', { style: { ...cardStyle, marginBottom: 10 } },
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 } },
            h('div', { style: sectionTitle }, `${t('sessionDetail')} (${fmtInt(sortedSessions.length)})`),
            h('span', { style: { flex: 1 } }),
            h('input', {
              type: 'search', value: query, placeholder: t('search'),
              style: { ...inputStyle, width: 220 },
              onChange: (e) => setQuery(e.target.value),
            }),
            h('label', { style: { fontSize: 12, color: V.fg2 } }, t('sort')),
            h('select', { value: sort, style: { ...inputStyle, width: 'auto' }, onChange: (e) => setSort(e.target.value) },
              h('option', { value: 'total' }, t('byTotal')),
              h('option', { value: 'cost' }, t('byCost')),
              h('option', { value: 'recent' }, t('byRecent')),
              h('option', { value: 'created' }, t('byCreated')))),
          h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
              h('thead', null, h('tr', { style: { color: V.fg2, textAlign: 'left' } },
                [t('title'), t('model'), t('created'), t('recent'), t('turns'), t('requests'), t('totalTokens'), t('share'), t('cost')]
                  .map((x) => h('th', { key: x, style: { padding: '6px 8px', borderBottom: `1px solid ${V.b1}`, fontWeight: 500, whiteSpace: 'nowrap' } }, x)))),
              h('tbody', null, shownSessions.map((s) => h('tr', { key: s.id, style: { borderBottom: `1px solid ${V.b1}` } },
                h('td', { style: { padding: '6px 8px', maxWidth: 260 } },
                  h('div', { style: { color: V.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: s.title ?? s.id },
                    s.title ?? s.id.slice(0, 13)),
                  h('div', { style: { color: V.idle, fontSize: 11 } },
                    `${s.id.slice(0, 18)}${s.live ? ` · ${t('live')}` : ''}${s.seeded ? ' · seed' : ''}`)),
                h('td', { style: { padding: '6px 8px', color: V.fg2, whiteSpace: 'nowrap' } }, s.mainModel),
                h('td', { style: { padding: '6px 8px', color: V.fg2, whiteSpace: 'nowrap' } }, fmtDate(s.createdAt)),
                h('td', { style: { padding: '6px 8px', color: V.fg2, whiteSpace: 'nowrap' } }, fmtDate(s.updatedAt)),
                h('td', { style: { padding: '6px 8px', color: V.fg2 } }, `${s.turns}/${s.userMessages}`),
                h('td', { style: { padding: '6px 8px', color: V.fg2 } }, fmtInt(s.requests)),
                h('td', { style: { padding: '6px 8px', color: V.fg, fontWeight: 600 } }, fmtTokens(s.total)),
                h('td', { style: { padding: '6px 8px', minWidth: 90 } },
                  h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    h(Bar, { pct: data.totals.total > 0 ? (s.total / data.totals.total) * 100 : 0 }),
                    h('span', { style: { color: V.fg2 } }, `${data.totals.total > 0 ? ((s.total / data.totals.total) * 100).toFixed(1) : 0}%`))),
                h('td', { style: { padding: '6px 8px', color: V.brand, whiteSpace: 'nowrap' } }, fmtMoney(s._cost, cur))))))),
          sortedSessions.length > 30 ? h('button', {
            type: 'button', style: { ...btnStyle, marginTop: 10 },
            onClick: () => setShowAll(!showAll),
          }, showAll ? t('showLess') : `${t('showAll')} (${fmtInt(sortedSessions.length)})`) : null),

        // settings
        showSettings ? h('div', { style: { ...cardStyle, marginBottom: 10 } },
          h('div', { style: sectionTitle }, t('settings')),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 } },
            h('span', { style: { fontSize: 12, color: V.fg2 } }, t('priceMode')),
            ['official', 'custom'].map((m) => h('button', {
              key: m, type: 'button',
              style: { ...btnStyle, ...(effective.mode === m || (m === 'official' && effective.mode !== 'custom') ? { borderColor: V.brand, color: V.brand } : {}) },
              onClick: () => setDraft({ ...effective, mode: m }),
            }, m === 'official' ? t('officialPrices') : t('customPrices')))),
          isOfficial(effective) && data.pricing ? h('div', { style: { marginBottom: 12 } },
            h('div', { style: { fontSize: 12, color: V.fg, marginBottom: 6 } },
              `${t('priceSources')} · ${t('fetchedOn')} ${data.pricing.fetchedAt} · USD→CAD ${data.pricing.fx.usdCad} · CNY→CAD ${data.pricing.fx.cnyCad} (${data.pricing.fx.asOf}, ${data.pricing.fx.source})`),
            data.pricing.entries.map((e, i) => h('div', {
              key: i,
              style: { fontSize: 11, color: V.fg2, lineHeight: 1.6, padding: '6px 0', borderBottom: `1px solid ${V.b1}` },
            },
              h('div', { style: { color: V.fg, fontWeight: 600 } }, `${e.models} · ${e.vendor}`),
              h('div', null, `${e.period} · ${e.prices}`),
              e.peakRule && e.peakRule !== '无峰谷价' && e.peakRule !== '—' ? h('div', null, e.peakRule) : null,
              h('div', { style: { color: V.idle } }, e.source))),
            data.pricing.notes.map((n, i) => h('div', { key: `n${i}`, style: { fontSize: 11, color: V.idle, lineHeight: 1.6 } }, `· ${n}`))) : null,
          isOfficial(effective) ? null : h('div', { style: { fontSize: 12, color: V.fg, marginBottom: 8 } }, t('per1m')),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 } },
            h('label', { style: { display: 'grid', gap: 3, fontSize: 11, color: V.fg2 } }, t('currency'),
              h('input', {
                type: 'text', value: effective.currency, style: inputStyle,
                onChange: (e) => setDraft({ ...effective, currency: e.target.value }),
              })),
            h('label', { style: { display: 'grid', gap: 3, fontSize: 11, color: V.fg2 } }, t('budget'),
              h('input', {
                type: 'number', min: '0', step: '1', value: effective.budget, style: inputStyle,
                onChange: (e) => setDraft({ ...effective, budget: Number(e.target.value) }),
              }))),
          isOfficial(effective) ? null : h(React.Fragment, null,
            priceInputs('*', t('defaultPrice')),
            data.models.map((m) => priceInputs(m.model, m.model))),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('button', {
              type: 'button', style: { ...btnStyle, borderColor: V.brand, color: V.brand },
              onClick: () => { saveSettings(effective); setSettings(effective); setDraft(null); setSavedAt(Date.now()); },
            }, t('save')),
            h('button', {
              type: 'button', style: btnStyle,
              onClick: () => { setDraft(structuredClone(DEFAULT_SETTINGS)); },
            }, t('reset')),
            savedAt ? h('span', { style: { fontSize: 12, color: V.ok } }, `${t('saved')} ${fmtDate(savedAt)}`) : null)) : null,

        h('div', { style: { fontSize: 11, color: V.idle, lineHeight: 1.6 } },
          `${t('estNote')} API /token-stats/v1/stats · ${fmtDate(data.generatedAt)}`));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        CTX = ctx;
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: () => t('panel'),
        }, PanelIcon));
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PANEL_ID,
        }, StatsPage));

        // Frame every sidebar panel row (user request): one bordered box
        // per entry plus a small box around each glyph, this plugin's row
        // included. Strictly scoped to the shell panel list; the style
        // element is removed when the plugin unloads.
        try {
          ctx.effect(() => {
            const el = document.createElement('style');
            el.dataset.plugin = 'token-stats';
            el.textContent = SIDEBAR_FRAME_CSS;
            document.head.appendChild(el);
            return () => el.remove();
          }, 'token-stats sidebar frames');
        } catch { /* style injection unavailable */ }

        // Right sidebar tab: prefer the betterSidebar service (this
        // profile's right column), fall back to the native right sidebar
        // when it never appears. Same registration pattern paper-reader
        // ships and verifies in this profile.
        let disposeBetter = null;
        let disposeNative = null;
        let nativeTimer = null;
        const mountBetter = () => {
          const svc = safeGet('betterSidebar');
          if (!svc || disposeBetter) return;
          if (disposeNative) { try { disposeNative(); } catch { /* ignore */ } disposeNative = null; }
          if (nativeTimer) { clearTimeout(nativeTimer); nativeTimer = null; }
          disposeBetter = svc.registerTab({
            id: 'token-stats:main',
            title: () => t('panel'),
            description: () => t('tabDesc'),
            icon: StatsIcon,
            order: 66,
            single: true,
            component: SidebarStats,
          });
        };
        const mountNative = () => {
          if (disposeBetter || disposeNative) return;
          const sidebar = safeGet('sidebarRight');
          const tabs = safeGet('sidebarRightTabs');
          if (!sidebar || !tabs) return;
          try {
            const disposeType = tabs.register({
              id: 'token-stats:main',
              kind: 'token-stats:main',
              keepMounted: true,
              priority: 'extension',
              title: () => t('panel'),
              guide: [{ id: 'token-stats', order: 66, title: () => t('panel'), icon: StatsIcon }],
            });
            const disposeBody = ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: 'token-stats:main',
              inject: () => ({ ctx }),
            }, NativeBody);
            disposeNative = () => {
              try { disposeBody(); } catch { /* ignore */ }
              try { disposeType(); } catch { /* ignore */ }
            };
          } catch { /* native registration unavailable */ }
        };
        ctx.effect(() => {
          mountBetter();
          let off = null;
          try {
            off = ctx.on('internal/service', (name) => {
              if (name === 'betterSidebar') mountBetter();
            });
          } catch { off = null; }
          nativeTimer = setTimeout(mountNative, 2500);
          return () => {
            if (off) off();
            if (nativeTimer) clearTimeout(nativeTimer);
            if (disposeBetter) { try { disposeBetter(); } catch { /* ignore */ } disposeBetter = null; }
            if (disposeNative) { try { disposeNative(); } catch { /* ignore */ } disposeNative = null; }
          };
        }, 'token-stats right sidebar registration');
      },
    };
  },
});
