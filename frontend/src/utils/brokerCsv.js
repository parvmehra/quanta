export const BROKER_CONFIGS = {
  zerodha: {
    name: 'Zerodha (Kite)',
    columns: { symbol: 'tradingsymbol', shares: 'quantity', avgPrice: 'average_price', name: 'instrument' },
    suffix: '.NS',
    instructions: 'Export your holdings from Kite → Portfolio → Holdings → Download CSV',
    sampleHeader: 'tradingsymbol,quantity,average_price,instrument',
  },
  groww: {
    name: 'Groww',
    columns: { symbol: 'symbol', shares: 'quantity', avgPrice: 'avg_price', name: 'company_name' },
    suffix: '.NS',
    instructions: 'Go to Groww → Stocks → Holdings → Download Statement as CSV',
    sampleHeader: 'symbol,quantity,avg_price,company_name',
  },
  angelone: {
    name: 'Angel One',
    columns: { symbol: 'scrip_name', shares: 'quantity', avgPrice: 'buy_avg', name: 'scrip_name' },
    suffix: '.NS',
    instructions: 'Open Angel One → Portfolio → Holdings → Export to CSV',
    sampleHeader: 'scrip_name,quantity,buy_avg',
  },
  upstox: {
    name: 'Upstox',
    columns: { symbol: 'symbol', shares: 'quantity', avgPrice: 'avg_price', name: 'company' },
    suffix: '.NS',
    instructions: 'Open Upstox → Portfolio → Holdings → Download CSV',
    sampleHeader: 'symbol,quantity,avg_price,company',
  },
  generic: {
    name: 'Generic CSV',
    columns: { symbol: 'symbol', shares: 'shares', avgPrice: 'avg_price', name: 'name' },
    suffix: '',
    instructions: 'Your CSV needs the columns symbol, shares and avg_price (name is optional). Use full Yahoo symbols, e.g. AAPL or TCS.NS.',
    sampleHeader: 'symbol,shares,avg_price,name',
  },
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const toNumber = (v) => {
  const n = Number(String(v ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

export function mapRows(rows, brokerKey) {
  const config = BROKER_CONFIGS[brokerKey] || BROKER_CONFIGS.generic;
  const cols = config.columns;
  const holdings = [];
  const skipped = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    let symbol = String(row[cols.symbol] ?? '').trim().toUpperCase();
    if (!symbol) { skipped.push({ line, reason: 'missing symbol' }); return; }
    if (config.suffix && !symbol.includes('.')) symbol += config.suffix;
    const shares = toNumber(row[cols.shares]);
    const avgPrice = toNumber(row[cols.avgPrice]);
    if (!(shares > 0)) { skipped.push({ line, symbol, reason: 'quantity must be greater than zero' }); return; }
    if (!(avgPrice >= 0)) { skipped.push({ line, symbol, reason: 'invalid average price' }); return; }
    holdings.push({ symbol, shares, avgPrice, name: row[cols.name] || symbol });
  });
  return { holdings, skipped };
}
