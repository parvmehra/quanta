import React from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import './ui.css';

/** Signed percentage / value with colour AND arrow (never colour alone). */
export function ChangeValue({ value, suffix = '%', digits = 2, className = '' }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return <span className={`q-change q-change--na ${className}`}>—</span>;
  }
  const n = Number(value);
  const dir = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  const sign = n > 0 ? '+' : '';
  return (
    <span className={`q-change q-change--${dir} ${className}`}>
      {arrow && <span aria-hidden="true">{arrow}</span>} {sign}{n.toFixed(digits)}{suffix}
    </span>
  );
}

/** Segmented tabs. tabs: [{ id, label }] */
export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="q-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`q-tabs__tab${value === t.id ? ' is-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`q-badge q-badge--${tone}`}>{children}</span>;
}

export function Skeleton({ width = '100%', height = 14, style }) {
  return <span className="q-skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="q-state" role="status">
      <Inbox size={28} aria-hidden="true" />
      <h2 className="q-state__title">{title}</h2>
      {children && <p className="q-state__text">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', children, onRetry }) {
  return (
    <div className="q-state q-state--error" role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <h2 className="q-state__title">{title}</h2>
      {children && <p className="q-state__text">{children}</p>}
      {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}
