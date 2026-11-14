import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Skeleton } from './ui';
import './DataTable.css';

const cmp = (a, b) => {
  const an = a === null || a === undefined || Number.isNaN(a);
  const bn = b === null || b === undefined || Number.isNaN(b);
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b));
  return a - b;
};

export default function DataTable({ columns, rows, rowKey, defaultSort, loading = false, skeletonRows = 6, empty = 'No data', caption, dense = false }) {
  const [sort, setSort] = useState(defaultSort || null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = (r) => (col.sortValue ? col.sortValue(r) : r[col.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((x, y) => {
      const a = val(x); const b = val(y);
      const aMissing = a === null || a === undefined || Number.isNaN(a);
      const bMissing = b === null || b === undefined || Number.isNaN(b);
      if (aMissing || bMissing) return cmp(a, b);
      return cmp(a, b) * dir;
    });
  }, [rows, sort, columns]);

  const toggle = (col) => {
    if (!col.sortable) return;
    setSort((s) => (s && s.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: col.align === 'right' ? 'desc' : 'asc' }));
  };

  return (
    <div className={`dt-wrap${dense ? ' dt-dense' : ''}`}>
      <table className="dt">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={`${c.align === 'right' ? 'dt-r' : ''}${c.hideBelow ? ` dt-hide-${c.hideBelow}` : ''}`}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sortable ? (
                    <button type="button" className="dt-sort" onClick={() => toggle(c)}>
                      {c.label}
                      {active ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} className="dt-sort__idle" />}
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: skeletonRows }).map((_, i) => (
            <tr key={`sk-${i}`}>
              {columns.map((c) => (
                <td key={c.key} className={`${c.align === 'right' ? 'dt-r' : ''}${c.hideBelow ? ` dt-hide-${c.hideBelow}` : ''}`}>
                  <Skeleton width={c.align === 'right' ? 60 : 90} />
                </td>
              ))}
            </tr>
          ))}
          {!loading && sorted.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={`${c.align === 'right' ? 'dt-r' : ''}${c.hideBelow ? ` dt-hide-${c.hideBelow}` : ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {!loading && sorted.length === 0 && (
            <tr><td colSpan={columns.length} className="dt-empty">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
