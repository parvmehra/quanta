import { yahooFinance, VALID_SYMBOL } from '../services/yahoo.js';

const SOURCE = 'Yahoo Finance';
const DAY = 24 * 60 * 60 * 1000;

const RANGES = {
  '1D': { interval: '5m', lookbackDays: 6, sessions: 1, ttl: 60 * 1000 },
  '1W': { interval: '30m', lookbackDays: 10, sessions: 5, ttl: 2 * 60 * 1000 },
  '1M': { interval: '1d', lookbackDays: 31, ttl: 10 * 60 * 1000 },
  '3M': { interval: '1d', lookbackDays: 93, ttl: 10 * 60 * 1000 },
  '6M': { interval: '1d', lookbackDays: 186, ttl: 10 * 60 * 1000 },
  '1Y': { interval: '1d', lookbackDays: 366, ttl: 10 * 60 * 1000 },
  '5Y': { interval: '1wk', lookbackDays: 366 * 5 + 7, ttl: 30 * 60 * 1000 },
  MAX: { interval: '1mo', from: new Date('1980-01-01'), ttl: 60 * 60 * 1000 },
};

const cache = new Map();
const fresh = (key) => {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < hit.ttl ? hit.data : null;
};
const remember = (key, data, ttl) => {
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), ttl, data });
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const iso = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

export const cleanSymbol = (raw) => {
  let s = String(raw || '');
  try { s = decodeURIComponent(s); } catch { }
  s = s.trim().toUpperCase();
  return VALID_SYMBOL.test(s) ? s : null;
};

export const isValidRange = (range) => Object.prototype.hasOwnProperty.call(RANGES, range);

const unavailable = (res, code, what, err) => {
  console.warn(`${what} unavailable:`, err?.message);
  return res.status(503).json({ code, message: `${what} is temporarily unavailable.` });
};

export async function loadChart(symbol, range) {
  const cfg = RANGES[range];
  const key = `chart:${symbol}:${range}`;
  const cached = fresh(key);
  if (cached) return cached;

  const period1 = cfg.from || new Date(Date.now() - cfg.lookbackDays * DAY);
  const result = await yahooFinance.chart(symbol, { period1, interval: cfg.interval, includePrePost: false }, { validateResult: false });

  let points = (result.quotes || [])
    .filter((q) => q && q.date && num(q.close) !== null && num(q.open) !== null && num(q.high) !== null && num(q.low) !== null)
    .map((q) => ({ t: new Date(q.date).getTime(), open: q.open, high: q.high, low: q.low, close: q.close, volume: num(q.volume) ?? 0 }));

  if (cfg.sessions) {
    const days = [...new Set(points.map((p) => new Date(p.t).toISOString().slice(0, 10)))].slice(-cfg.sessions);
    points = points.filter((p) => days.includes(new Date(p.t).toISOString().slice(0, 10)));
  }
  if (!points.length) throw new Error('no data points');

  const meta = result.meta || {};
  const data = {
    symbol,
    range,
    interval: cfg.interval,
    currency: meta.currency || null,
    previousClose: num(meta.chartPreviousClose) ?? num(meta.previousClose),
    source: SOURCE,
    delayed: true,
    fetchedAt: new Date().toISOString(),
    points,
  };
  remember(key, data, cfg.ttl);
  return data;
}

export async function loadFundamentals(symbol) {
  const key = `fund:${symbol}`;
  const cached = fresh(key);
  if (cached) return cached;

  const r = await yahooFinance.quoteSummary(
    symbol,
    { modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile'] },
    { validateResult: false },
  );
  const p = r.price || {};
  const sd = r.summaryDetail || {};
  const ks = r.defaultKeyStatistics || {};
  const fd = r.financialData || {};
  const ap = r.assetProfile || {};

  const data = {
    symbol,
    name: p.longName || p.shortName || null,
    currency: p.currency || sd.currency || null,
    exchange: p.exchangeName || null,
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    profile: {
      sector: ap.sector || null,
      industry: ap.industry || null,
      website: ap.website || null,
      country: ap.country || null,
      city: ap.city || null,
      employees: num(ap.fullTimeEmployees),
      description: ap.longBusinessSummary || null,
    },
    range52: { low: num(sd.fiftyTwoWeekLow), high: num(sd.fiftyTwoWeekHigh) },
    valuation: {
      marketCap: num(p.marketCap) ?? num(sd.marketCap),
      enterpriseValue: num(ks.enterpriseValue),
      trailingPE: num(sd.trailingPE),
      forwardPE: num(sd.forwardPE) ?? num(ks.forwardPE),
      pegRatio: num(ks.pegRatio),
      priceToSales: num(sd.priceToSalesTrailing12Months),
      priceToBook: num(ks.priceToBook),
      evToEbitda: num(ks.enterpriseToEbitda),
      evToRevenue: num(ks.enterpriseToRevenue),
    },
    profitability: {
      grossMargin: num(fd.grossMargins),
      operatingMargin: num(fd.operatingMargins),
      profitMargin: num(fd.profitMargins) ?? num(ks.profitMargins),
      returnOnEquity: num(fd.returnOnEquity),
      returnOnAssets: num(fd.returnOnAssets),
    },
    growth: {
      revenueGrowth: num(fd.revenueGrowth),
      earningsGrowth: num(fd.earningsGrowth),
    },
    perShare: {
      epsTrailing: num(ks.trailingEps),
      epsForward: num(ks.forwardEps),
      bookValue: num(ks.bookValue),
      revenuePerShare: num(fd.revenuePerShare),
    },
    dividends: {
      dividendYield: num(sd.dividendYield),
      dividendRate: num(sd.dividendRate),
      payoutRatio: num(sd.payoutRatio),
      exDividendDate: iso(sd.exDividendDate),
    },
    trading: {
      beta: num(sd.beta) ?? num(ks.beta),
      averageVolume: num(sd.averageVolume),
      averageVolume10Day: num(sd.averageVolume10days),
      fiftyDayAverage: num(sd.fiftyDayAverage),
      twoHundredDayAverage: num(sd.twoHundredDayAverage),
      sharesOutstanding: num(ks.sharesOutstanding),
      floatShares: num(ks.floatShares),
    },
    health: {
      totalRevenue: num(fd.totalRevenue),
      ebitda: num(fd.ebitda),
      totalCash: num(fd.totalCash),
      totalDebt: num(fd.totalDebt),
      debtToEquity: num(fd.debtToEquity),
      currentRatio: num(fd.currentRatio),
      quickRatio: num(fd.quickRatio),
      freeCashflow: num(fd.freeCashflow),
      operatingCashflow: num(fd.operatingCashflow),
    },
    analyst: {
      targetMean: num(fd.targetMeanPrice),
      targetHigh: num(fd.targetHighPrice),
      targetLow: num(fd.targetLowPrice),
      recommendation: fd.recommendationKey && fd.recommendationKey !== 'none' ? fd.recommendationKey : null,
      analystCount: num(fd.numberOfAnalystOpinions),
    },
    related: [],
  };

  try {
    const rec = await yahooFinance.recommendationsBySymbol(symbol, {}, { validateResult: false });
    const list = Array.isArray(rec) ? rec[0]?.recommendedSymbols : rec?.recommendedSymbols;
    data.related = (list || []).filter((x) => x?.symbol).slice(0, 6).map((x) => ({ symbol: x.symbol, score: num(x.score) }));
  } catch {
    data.related = [];
  }

  remember(key, data, 15 * 60 * 1000);
  return data;
}

export const getChart = async (req, res) => {
  const symbol = cleanSymbol(req.params.symbol);
  const range = String(req.query.range || '1M').toUpperCase();
  if (!symbol) return res.status(400).json({ message: 'Invalid symbol.' });
  if (!isValidRange(range)) return res.status(400).json({ message: `range must be one of ${Object.keys(RANGES).join(', ')}` });
  try {
    return res.json(await loadChart(symbol, range));
  } catch (err) {
    return unavailable(res, 'CHART_UNAVAILABLE', 'Chart data', err);
  }
};

export const getFundamentals = async (req, res) => {
  const symbol = cleanSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ message: 'Invalid symbol.' });
  try {
    return res.json(await loadFundamentals(symbol));
  } catch (err) {
    return unavailable(res, 'FUNDAMENTALS_UNAVAILABLE', 'Company data', err);
  }
};

export const getSparklines = async (req, res) => {
  const symbols = [...new Set(String(req.query.symbols || '').split(',').map(cleanSymbol).filter(Boolean))].filter((x) => !x.startsWith('^')).slice(0, 20);
  if (!symbols.length) return res.status(400).json({ message: 'symbols query parameter is required (comma-separated)' });
  const out = {};
  const queue = [...symbols];
  const worker = async () => {
    while (queue.length) {
      const sym = queue.shift();
      try {
        const chart = await loadChart(sym, '1M');
        const closes = chart.points.map((p) => p.close);
        const step = Math.max(1, Math.ceil(closes.length / 30));
        const sampled = closes.filter((_, i) => i % step === 0 || i === closes.length - 1);
        const first = closes[0];
        out[sym] = { closes: sampled, changePct: closes.length > 1 && first ? Math.round(((closes[closes.length - 1] - first) / first) * 10000) / 100 : null };
      } catch {
        out[sym] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, symbols.length) }, worker));
  res.json({ range: '1M', source: SOURCE, fetchedAt: new Date().toISOString(), sparklines: out });
};
