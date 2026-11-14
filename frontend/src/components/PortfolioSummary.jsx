import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChangeValue, EmptyState } from './ui/ui';
import { displaySymbol, formatMoney } from '../utils/format';

const PALETTE = ['#60A5FA', '#A78BFA', '#FBBF24', '#F472B6', '#22D3EE', '#FB923C', '#818CF8'];
const OTHER = '#64748B';
const sign = (n) => (n > 0 ? '+' : '');
const tone = (n) => (n > 0 ? 'positive' : n < 0 ? 'negative' : '');

export function StatStrip({ totals: t0, realized }) {
  const sym = t0.currency === 'INR' ? '.NS' : '';
  const hasPrices = t0.count > t0.unpriced;
  const totals = hasPrices ? t0 : { ...t0, value: null, invested: null, pnl: null, pnlPct: null, dayPnl: null, dayPnlPct: null };
  return (
    <div>
      <div className="strip-caption">{totals.currency === 'INR' ? 'India holdings (INR)' : 'US holdings (USD)'}</div>
      <div className="stat-strip">
        <div className="stat"><span className="stat__label">Portfolio value</span><span className="stat__value">{formatMoney(totals.value, sym)}</span><span className="stat__sub">{totals.count} position{totals.count === 1 ? '' : 's'}{totals.unpriced ? `, ${totals.unpriced} without a live price` : ''}</span></div>
        <div className="stat"><span className="stat__label">Invested</span><span className="stat__value">{formatMoney(totals.invested, sym)}</span><span className="stat__sub">Cost basis incl. fees</span></div>
        <div className="stat"><span className="stat__label">Unrealised P&amp;L</span><span className={`stat__value ${tone(totals.pnl)}`}>{sign(totals.pnl)}{formatMoney(totals.pnl, sym)}</span><span className="stat__sub"><ChangeValue value={totals.pnlPct} /></span></div>
        {realized !== undefined && (
          <div className="stat"><span className="stat__label">Realised P&amp;L</span><span className={`stat__value ${tone(realized?.pnl)}`}>{realized ? `${sign(realized.pnl)}${formatMoney(realized.pnl, sym)}` : formatMoney(0, sym)}</span><span className="stat__sub">{realized ? `${realized.trades} sale${realized.trades === 1 ? '' : 's'}` : 'No sales yet'}</span></div>
        )}
        <div className="stat"><span className="stat__label">Today&rsquo;s P&amp;L</span><span className={`stat__value ${tone(totals.dayPnl)}`}>{sign(totals.dayPnl)}{formatMoney(totals.dayPnl, sym)}</span><span className="stat__sub"><ChangeValue value={totals.dayPnlPct} /></span></div>
      </div>
    </div>
  );
}

export function Allocation({ positions, currency, by = 'symbol', sectors = {} }) {
  const priced = positions.filter((p) => p.currency === currency && p.value > 0);
  const groups = new Map();
  for (const p of priced) {
    const key = by === 'sector' ? (sectors[p.symbol] || 'Unclassified') : displaySymbol(p.symbol);
    groups.set(key, (groups.get(key) || 0) + p.value);
  }
  const rows = [...groups.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const top = rows.slice(0, PALETTE.length).map((r, i) => ({ ...r, color: PALETTE[i] }));
  const rest = rows.slice(PALETTE.length).reduce((s, r) => s + r.value, 0);
  const slices = [...top, ...(rest > 0 ? [{ name: 'Other', value: rest, color: OTHER }] : [])];
  if (!total) return <EmptyState title="Nothing to allocate">No priced holdings in this currency.</EmptyState>;
  return (
    <div className="panel-body" style={{ display: 'flex', gap: 'var(--sp-5)', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: 150, height: 150, flex: 'none' }} role="img" aria-label={`Allocation by ${by}`}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={1} stroke="var(--q-surface)" isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${((v / total) * 100).toFixed(1)}%`, n]}
              contentStyle={{ background: 'var(--q-surface-2)', border: '1px solid var(--q-border-strong)', borderRadius: 4, fontSize: 12 }}
              itemStyle={{ color: 'var(--q-text)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="legend" style={{ flex: 1, minWidth: 140 }}>
        {slices.map((s) => (<li key={s.name}><i style={{ background: s.color }} /><span>{s.name}</span><span>{((s.value / total) * 100).toFixed(1)}%</span></li>))}
      </ul>
    </div>
  );
}
