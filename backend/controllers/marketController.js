import yahooFinancePkg from 'yahoo-finance2';

const yahooFinance = typeof yahooFinancePkg === 'function'
  ? new yahooFinancePkg({ suppressNotices: ['yahooSurvey'] })
  : yahooFinancePkg;

const SOURCE = 'Yahoo Finance';
const OVERVIEW_TTL_MS = 60 * 1000;
const MOVERS_TTL_MS = 2 * 60 * 1000;
const MIN_US_MARKET_CAP = 2_000_000_000;

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', region: 'US' },
  { symbol: '^IXIC', name: 'NASDAQ Composite', region: 'US' },
  { symbol: '^DJI', name: 'Dow Jones', region: 'US' },
  { symbol: '^NSEI', name: 'NIFTY 50', region: 'IN' },
  { symbol: '^BSESN', name: 'S&P BSE SENSEX', region: 'IN' },
];

const NIFTY_50 = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'BHARTIARTL', 'SBIN', 'LT', 'ITC', 'HINDUNILVR',
  'KOTAKBANK', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'SUNPHARMA', 'ASIANPAINT', 'HCLTECH', 'NTPC', 'ULTRACEMCO', 'TITAN',
  'ONGC', 'POWERGRID', 'M&M', 'WIPRO', 'NESTLEIND', 'TATASTEEL', 'JSWSTEEL', 'COALINDIA', 'ADANIENT', 'ADANIPORTS',
  'BAJAJFINSV', 'TECHM', 'INDUSINDBK', 'GRASIM', 'HINDALCO', 'DRREDDY', 'CIPLA', 'EICHERMOT', 'APOLLOHOSP', 'BPCL',
  'TATACONSUM', 'SBILIFE', 'HDFCLIFE', 'BRITANNIA', 'DIVISLAB', 'HEROMOTOCO', 'TRENT', 'TMPV', 'SHRIRAMFIN', 'BAJAJ-AUTO',
].map((s) => `${s}.NS`);

const cache = new Map();
const fresh = (key, ttl) => {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < ttl ? hit.data : null;
};

const toRow = (q) => ({
  symbol: q.symbol,
  name: q.shortName || q.longName || q.symbol,
  price: q.regularMarketPrice ?? null,
  change: q.regularMarketChange ?? null,
  changePercent: q.regularMarketChangePercent ?? null,
  volume: q.regularMarketVolume ?? null,
  marketCap: q.marketCap ?? null,
  currency: q.currency || (q.symbol?.endsWith('.NS') || q.symbol?.endsWith('.BO') ? 'INR' : 'USD'),
});

const hasPrice = (r) => r.price !== null && r.price > 0 && r.changePercent !== null;

const unavailable = (res, what, err) => {
  console.warn(`Market ${what} unavailable:`, err?.message);
  return res.status(503).json({ code: 'DATA_UNAVAILABLE', message: `${what} data is temporarily unavailable.` });
};

export const getOverview = async (_req, res) => {
  const cached = fresh('overview', OVERVIEW_TTL_MS);
  if (cached) return res.json(cached);
  try {
    const quotes = await yahooFinance.quote(INDICES.map((i) => i.symbol), {}, { validateResult: false });
    const bySymbol = new Map((Array.isArray(quotes) ? quotes : [quotes]).map((q) => [q.symbol, q]));
    const indices = INDICES.map((i) => {
      const q = bySymbol.get(i.symbol);
      const row = q ? toRow(q) : null;
      return {
        symbol: i.symbol,
        name: i.name,
        region: i.region,
        price: row?.price ?? null,
        change: row?.change ?? null,
        changePercent: row?.changePercent ?? null,
        asOf: q?.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : null,
        marketState: q?.marketState ?? null,
      };
    }).filter((i) => i.price > 0);
    if (!indices.length) throw new Error('no index quotes returned');
    const data = { source: SOURCE, delayed: true, fetchedAt: new Date().toISOString(), indices };
    cache.set('overview', { at: Date.now(), data });
    return res.json(data);
  } catch (err) {
    return unavailable(res, 'Index', err);
  }
};

async function usMovers() {
  const run = async (scrId) => {
    const r = await yahooFinance.screener({ scrIds: scrId, count: 50 }, {}, { validateResult: false });
    return (r.quotes || [])
      .filter((q) => (q.marketCap ?? 0) >= MIN_US_MARKET_CAP)
      .map(toRow).filter(hasPrice).slice(0, 10);
  };
  const [gainers, losers, active] = await Promise.all([run('day_gainers'), run('day_losers'), run('most_actives')]);
  return {
    universe: `US-listed stocks, Yahoo predefined screeners, market cap ≥ $${MIN_US_MARKET_CAP / 1e9}B`,
    gainers, losers, active,
  };
}

async function indiaMovers() {
  const quotes = await yahooFinance.quote(NIFTY_50, {}, { validateResult: false });
  const rows = (Array.isArray(quotes) ? quotes : [quotes]).map(toRow).filter(hasPrice);
  const byChange = [...rows].sort((a, b) => b.changePercent - a.changePercent);
  return {
    universe: 'NIFTY 50 constituents (fixed list of 50 symbols)',
    gainers: byChange.filter((r) => r.changePercent > 0).slice(0, 10),
    losers: [...byChange].reverse().filter((r) => r.changePercent < 0).slice(0, 10),
    active: [...rows].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 10),
  };
}

export const getMovers = async (req, res) => {
  const region = String(req.query.region || 'US').toUpperCase();
  if (!['US', 'IN'].includes(region)) return res.status(400).json({ message: 'region must be US or IN' });
  const key = `movers:${region}`;
  const cached = fresh(key, MOVERS_TTL_MS);
  if (cached) return res.json(cached);
  try {
    const body = region === 'US' ? await usMovers() : await indiaMovers();
    if (!body.gainers.length && !body.losers.length && !body.active.length) throw new Error('empty result');
    const data = { region, source: SOURCE, delayed: true, fetchedAt: new Date().toISOString(), ...body };
    cache.set(key, { at: Date.now(), data });
    return res.json(data);
  } catch (err) {
    return unavailable(res, 'Movers', err);
  }
};
