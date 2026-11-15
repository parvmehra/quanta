import React from 'react';

export default function Sparkline({ closes, width = 96, height = 28, label }) {
  if (!Array.isArray(closes) || closes.length < 2) return <span className="spark spark--na" style={{ width, height }} aria-label="No chart data">—</span>;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pad = 2;
  const x = (i) => pad + (i * (width - pad * 2)) / (closes.length - 1);
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  const points = closes.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = closes[closes.length - 1] >= closes[0];
  const color = up ? 'var(--q-positive)' : 'var(--q-negative)';
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label || `Price trend, ${up ? 'up' : 'down'} over the period`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(closes.length - 1)} cy={y(closes[closes.length - 1])} r="2" fill={color} />
    </svg>
  );
}
