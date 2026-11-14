import React, { useMemo } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPrice, formatVolume } from '../utils/format';

const fmt = (opts) => new Intl.DateTimeFormat('en-US', opts);
const TICK = {
  '1D': fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  '1W': fmt({ weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  short: fmt({ day: 'numeric', month: 'short' }),
  long: fmt({ month: 'short', year: 'numeric' }),
};
const FULL = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const FULL_DAY = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const tickFormatter = (range) => (t) => {
  const d = new Date(t);
  if (range === '1D') return TICK['1D'].format(d);
  if (range === '1W') return TICK['1W'].format(d).replace(',', '');
  if (range === '5Y' || range === 'MAX') return TICK.long.format(d);
  return TICK.short.format(d);
};

function ChartTooltip({ active, payload, symbol, intraday }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="pc-tip">
      <div className="pc-tip__time">{(intraday ? FULL : FULL_DAY).format(new Date(p.t))}</div>
      <div className="pc-tip__price">{formatPrice(p.close, symbol)}</div>
      <div className="pc-tip__sub">O {formatPrice(p.open, symbol)} · H {formatPrice(p.high, symbol)} · L {formatPrice(p.low, symbol)}</div>
      {p.volume > 0 && <div className="pc-tip__sub">Vol {formatVolume(p.volume)}</div>}
    </div>
  );
}

export default function PriceChart({ points, range, symbol, previousClose, showVolume = true, height = 360 }) {
  const data = useMemo(() => points.map((p, i) => ({ ...p, i })), [points]);
  const n = data.length;
  const up = n < 2 || data[n - 1].close >= (range === '1D' && previousClose ? previousClose : data[0].close);
  const color = up ? 'var(--q-positive)' : 'var(--q-negative)';
  const gradId = `pc-grad-${up ? 'up' : 'down'}`;
  const intraday = range === '1D' || range === '1W';

  const ticks = useMemo(() => {
    if (n < 2) return [0];
    const count = Math.min(6, n);
    return Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1)));
  }, [n]);
  const fmtTick = tickFormatter(range);
  const maxVol = useMemo(() => data.reduce((m, p) => Math.max(m, p.volume || 0), 0), [data]);
  const closes = data.map((p) => p.close);
  const yMin = Math.min(...closes, ...(range === '1D' && previousClose ? [previousClose] : []));
  const yMax = Math.max(...closes, ...(range === '1D' && previousClose ? [previousClose] : []));
  const pad = (yMax - yMin) * 0.08 || yMax * 0.01;

  return (
    <div className="pc" style={{ height }} role="img" aria-label={`Price chart for ${symbol}, ${range}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--q-border)" strokeOpacity={0.6} vertical={false} />
          <XAxis
            dataKey="i"
            type="number"
            domain={[0, Math.max(n - 1, 1)]}
            ticks={ticks}
            tickFormatter={(i) => (data[i] ? fmtTick(data[i].t) : '')}
            tick={{ fontSize: 11, fill: 'var(--q-text-3)' }}
            axisLine={{ stroke: 'var(--q-border)' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            domain={[yMin - pad, yMax + pad]}
            tickFormatter={(v) => (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(2))}
            tick={{ fontSize: 11, fill: 'var(--q-text-3)' }}
            axisLine={false}
            tickLine={false}
            width={58}
          />
          <YAxis yAxisId="vol" hide domain={[0, maxVol * 4 || 1]} />
          {showVolume && <Bar yAxisId="vol" dataKey="volume" fill="var(--q-text-3)" fillOpacity={0.35} isAnimationActive={false} />}
          {range === '1D' && previousClose ? (
            <ReferenceLine yAxisId="price" y={previousClose} stroke="var(--q-text-3)" strokeDasharray="4 4" label={{ value: 'Prev close', position: 'insideTopLeft', fill: 'var(--q-text-3)', fontSize: 10 }} />
          ) : null}
          <Area yAxisId="price" type="monotone" dataKey="close" stroke={color} strokeWidth={1.75} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4, fill: color, stroke: 'var(--q-surface)', strokeWidth: 2 }} isAnimationActive={false} />
          <Tooltip content={<ChartTooltip symbol={symbol} intraday={intraday} />} cursor={{ stroke: 'var(--q-text-3)', strokeDasharray: '3 3' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
