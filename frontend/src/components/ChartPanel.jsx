import React, { useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import PriceChart from './PriceChart';
import LightweightCandlestickChart from './LightweightCandlestickChart';
import { ErrorState, Skeleton, Tabs } from './ui/ui';
import { withIndicators } from '../utils/indicators';
import '../styles/stock.css';

const RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'].map((r) => ({ id: r, label: r }));

export default function ChartPanel({ symbol, defaultRange = '1M', full = false, height }) {
  const [range, setRange] = useState(defaultRange);
  const [mode, setMode] = useState('line');
  const [ind, setInd] = useState({ sma: true, bb: false, rsi: false });
  const chart = useFetch(`/api/stocks/chart/${encodeURIComponent(symbol)}?range=${range}`);
  const candleData = useMemo(() => (chart.data?.points ? withIndicators(chart.data.points) : []), [chart.data]);
  const h = height || (full ? 460 : 320);
  const ready = chart.data && chart.data.range === range && chart.data.symbol === symbol;

  return (
    <section className="panel" aria-label="Price chart">
      <div className="panel-head">
        <Tabs tabs={RANGES} value={range} onChange={setRange} label="Time range" />
        {full && (
          <span className="sd-chart-tools">
            <Tabs tabs={[{ id: 'line', label: 'Line' }, { id: 'candles', label: 'Candles' }]} value={mode} onChange={setMode} label="Chart type" />
            {mode === 'candles' && (
              <>
                <label className="sd-check"><input type="checkbox" checked={ind.sma} onChange={(e) => setInd({ ...ind, sma: e.target.checked })} /> SMA 20</label>
                <label className="sd-check"><input type="checkbox" checked={ind.bb} onChange={(e) => setInd({ ...ind, bb: e.target.checked })} /> Bollinger</label>
                <label className="sd-check"><input type="checkbox" checked={ind.rsi} onChange={(e) => setInd({ ...ind, rsi: e.target.checked })} /> RSI 14</label>
              </>
            )}
          </span>
        )}
      </div>
      <div className="sd-chart-body">
        {chart.error && !chart.data ? (
          <ErrorState title="Chart unavailable" onRetry={chart.refresh}>{chart.error}</ErrorState>
        ) : !ready ? (
          <Skeleton width="100%" height={h} style={{ display: 'block' }} />
        ) : full && mode === 'candles' ? (
          <div style={{ height: h }}>
            <LightweightCandlestickChart key={`${symbol}-${range}`} data={candleData} symbol={symbol} showSMA={ind.sma} showBollinger={ind.bb} showRSI={ind.rsi} intraday={range === '1D' || range === '1W'} />
          </div>
        ) : (
          <PriceChart points={chart.data.points} range={range} symbol={symbol} previousClose={chart.data.previousClose} showVolume={full} height={h} />
        )}
      </div>
      <div className="panel-note">
        {chart.data ? `${chart.data.points.length} points, ${chart.data.interval} interval. ` : ''}Prices: Yahoo Finance, may be delayed. Times shown in your local time zone.
      </div>
    </section>
  );
}
