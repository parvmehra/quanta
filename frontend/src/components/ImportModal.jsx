import React, { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { BROKER_CONFIGS, mapRows, parseCsv } from '../utils/brokerCsv';
import { apiMessage, importHoldings } from '../services/trading';
import { displaySymbol, formatNumber } from '../utils/format';
import './ImportModal.css';

const MAX_BYTES = 1_000_000;

export default function ImportModal({ open, onClose, onImported }) {
  const [broker, setBroker] = useState('zerodha');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [text, setText] = useState('');
  const [skipped, setSkipped] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!text) return;
    const parsed = parseCsv(text);
    if (!parsed.length) { setRows([]); setSkipped([]); setError('The file has no data rows.'); return; }
    const { holdings, skipped: sk } = mapRows(parsed, broker);
    setRows(holdings);
    setSkipped(sk);
    setError(holdings.length ? null : `No valid holdings found. Expected columns: ${BROKER_CONFIGS[broker].sampleHeader}`);
  }, [text, broker]);

  if (!open) return null;

  const reset = () => { setFile(null); setRows([]); setSkipped([]); setText(''); setError(null); };

  const readFile = (f) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setError('Please choose a .csv file.'); return; }
    if (f.size > MAX_BYTES) { setError('That file is larger than 1 MB.'); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setText(String(e.target.result || ''));
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsText(f);
  };

  const sample = () => {
    const c = BROKER_CONFIGS[broker];
    const body = `${c.sampleHeader}\n${broker === 'generic' ? 'AAPL,10,150.00,Apple Inc.' : 'RELIANCE,10,2400.00,Reliance Industries'}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `sample_${broker}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await importHoldings(rows.map((r) => ({ symbol: r.symbol, shares: r.shares, avgPrice: r.avgPrice, name: r.name })));
      toast.success(`Imported ${res.imported} holding${res.imported === 1 ? '' : 's'}`);
      reset();
      onImported?.();
      onClose();
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="im-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="im" role="dialog" aria-modal="true" aria-label="Import holdings from CSV">
        <div className="panel-head">
          <h2 className="panel-title">Import holdings from CSV</h2>
          <button type="button" className="shell-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="im-body">
          <label className="im-field">
            <span>Broker format</span>
            <select value={broker} onChange={(e) => setBroker(e.target.value)}>
              {Object.entries(BROKER_CONFIGS).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}
            </select>
          </label>
          <p className="im-help">{BROKER_CONFIGS[broker].instructions}{BROKER_CONFIGS[broker].suffix ? ` Symbols are treated as NSE listings (${BROKER_CONFIGS[broker].suffix}) unless they already include a suffix.` : ''} <button type="button" className="shell-link-btn" onClick={sample}>Download a sample</button></p>

          <div
            className={`im-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]); }}
          >
            <Upload size={20} aria-hidden="true" />
            <span>{file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : 'Drop a CSV file here or'}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}>Choose file</button>
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => readFile(e.target.files[0])} />
          </div>

          {error && <p className="im-error" role="alert">{error}</p>}

          {rows.length > 0 && (
            <>
              <p className="im-help"><strong>{rows.length}</strong> holding{rows.length === 1 ? '' : 's'} ready to import{skipped.length ? `, ${skipped.length} row${skipped.length === 1 ? '' : 's'} skipped` : ''}. Imported holdings are added to your portfolio without changing your wallet.</p>
              <div className="im-preview">
                <table className="dt dt-dense">
                  <thead><tr><th>Symbol</th><th className="dt-r">Shares</th><th className="dt-r">Avg price</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (<tr key={`${r.symbol}-${i}`}><td>{displaySymbol(r.symbol)}</td><td className="dt-r">{formatNumber(r.shares, 4)}</td><td className="dt-r">{formatNumber(r.avgPrice)}</td></tr>))}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 && <p className="im-help">Showing the first 50 rows.</p>}
            </>
          )}
          {skipped.length > 0 && (
            <details className="im-skipped">
              <summary>{skipped.length} skipped row{skipped.length === 1 ? '' : 's'}</summary>
              <ul>{skipped.slice(0, 30).map((s) => <li key={s.line}>Line {s.line}{s.symbol ? ` (${s.symbol})` : ''}: {s.reason}</li>)}</ul>
            </details>
          )}
        </div>
        <div className="im-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-accent" onClick={submit} disabled={!rows.length || busy}>{busy ? 'Importing…' : `Import ${rows.length || ''} holdings`}</button>
        </div>
      </div>
    </div>
  );
}
