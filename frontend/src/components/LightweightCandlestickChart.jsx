import React, { useEffect, useRef, useCallback } from 'react';
import { 
  createChart, 
  ColorType, 
  CrosshairMode, 
  LineStyle, 
  CandlestickSeries, 
  HistogramSeries, 
  LineSeries 
} from 'lightweight-charts';

const LightweightCandlestickChart = ({
  data = [],
  showSMA = true,
  showBollinger = false,
  showRSI = false,
  symbol = '',
  intraday = false,
}) => {
  const chartWrapperRef = useRef(null);
  const mainChartContainerRef = useRef(null);
  const rsiContainerRef = useRef(null);

  const chartRef = useRef(null);
  const rsiChartRef = useRef(null);

  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const smaSeriesRef = useRef(null);
  const bbUpperSeriesRef = useRef(null);
  const bbLowerSeriesRef = useRef(null);
  const rsiSeriesRef = useRef(null);
  const rsiOverboughtRef = useRef(null);
  const rsiOversoldRef = useRef(null);
  const priceLineRef = useRef(null);

  const prevSymbolRef = useRef(symbol);
  const hasFittedRef = useRef(false);

  const convertData = useCallback((rawData) => {
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      return { candles: [], volumes: [], sma: [], bbUpper: [], bbLower: [], rsi: [] };
    }

    const parsed = rawData
      .map((d, idx) => {
        let time;
        if (d.date && typeof d.date === 'string' && d.date.includes('-')) {
          const parts = d.date.split('-');
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          time = Date.UTC(year, month - 1, day) / 1000;
        } else if (typeof d.date === 'number') {
          time = d.date > 1e11 ? Math.floor(d.date / 1000) : Math.floor(d.date);
        } else if (d.date === 'Live') {
          const today = new Date();
          time = Math.floor(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / 1000);
        } else {
          time = idx;
        }

        const open = Number(d.open);
        const close = Number(d.close !== undefined ? d.close : d.price);
        const fallback = !isNaN(close) ? close : (!isNaN(open) ? open : 0);
        const high = Number(d.high);
        const low = Number(d.low);

        return {
          ...d,
          time,
          open: !isNaN(open) ? open : fallback,
          close: !isNaN(close) ? close : fallback,
          high: !isNaN(high) ? high : Math.max(open || fallback, close || fallback),
          low: !isNaN(low) ? low : Math.min(open || fallback, close || fallback),
        };
      })
      .filter(d => typeof d.time === 'number' && !isNaN(d.time));

    parsed.sort((a, b) => a.time - b.time);

    const strictlyAscending = [];
    let lastTime = -Infinity;
    for (const d of parsed) {
      if (d.time === lastTime) {
        strictlyAscending[strictlyAscending.length - 1] = d;
      } else if (d.time > lastTime) {
        strictlyAscending.push(d);
        lastTime = d.time;
      }
    }

    const candles = strictlyAscending.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumes = strictlyAscending.map(d => ({
      time: d.time,
      value: Number(d.volume) || 0,
      color: d.close >= d.open
        ? 'rgba(16, 185, 129, 0.25)'
        : 'rgba(239, 68, 68, 0.25)',
    }));

    const sma = strictlyAscending
      .filter(d => typeof d.sma === 'number' && !isNaN(d.sma))
      .map(d => ({ time: d.time, value: d.sma }));

    const bbUpper = strictlyAscending
      .filter(d => typeof d.bbUpper === 'number' && !isNaN(d.bbUpper))
      .map(d => ({ time: d.time, value: d.bbUpper }));

    const bbLower = strictlyAscending
      .filter(d => typeof d.bbLower === 'number' && !isNaN(d.bbLower))
      .map(d => ({ time: d.time, value: d.bbLower }));

    const rsi = strictlyAscending
      .filter(d => typeof d.rsi === 'number' && !isNaN(d.rsi))
      .map(d => ({ time: d.time, value: d.rsi }));

    return { candles, volumes, sma, bbUpper, bbLower, rsi };
  }, []);

  useEffect(() => {
    if (!mainChartContainerRef.current) return;

    const container = mainChartContainerRef.current;
    const initialWidth = container.clientWidth || 600;
    const initialHeight = container.clientHeight || 380;

    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.5)',
        fontSize: 11,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.15)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1a2e23',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.15)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1a2e23',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: { top: 0.08, bottom: 0.18 },
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: intraday,
        secondsVisible: false,
        rightOffset: 5,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      borderVisible: false,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      drawTicks: false,
    });
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          if (chartRef.current) {
            chartRef.current.applyOptions({ width, height });
          }
          if (rsiChartRef.current && rsiContainerRef.current) {
            rsiChartRef.current.applyOptions({ width, height: 90 });
          }
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (priceLineRef.current && candleSeriesRef.current) {
        try {
          candleSeriesRef.current.removePriceLine(priceLineRef.current);
        } catch (e) {}
        priceLineRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      bbUpperSeriesRef.current = null;
      bbLowerSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (symbol !== prevSymbolRef.current) {
      prevSymbolRef.current = symbol;
      hasFittedRef.current = false;
    }
  }, [symbol]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const { candles, volumes, sma, bbUpper, bbLower, rsi } = convertData(data);

    if (candles.length === 0) return;

    candleSeriesRef.current.setData(candles);

    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(volumes);
    }

    const lastCandle = candles[candles.length - 1];
    if (priceLineRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(priceLineRef.current);
      } catch (e) {}
      priceLineRef.current = null;
    }
    if (lastCandle) {
      priceLineRef.current = candleSeriesRef.current.createPriceLine({
        price: lastCandle.close,
        color: lastCandle.close >= lastCandle.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      });
    }

    if (smaSeriesRef.current) {
      smaSeriesRef.current.setData(sma);
    }

    if (bbUpperSeriesRef.current) {
      bbUpperSeriesRef.current.setData(bbUpper);
    }
    if (bbLowerSeriesRef.current) {
      bbLowerSeriesRef.current.setData(bbLower);
    }

    if (rsiSeriesRef.current) {
      rsiSeriesRef.current.setData(rsi);
      if (rsiOverboughtRef.current) {
        rsiOverboughtRef.current.setData(rsi.map(d => ({ time: d.time, value: 70 })));
      }
      if (rsiOversoldRef.current) {
        rsiOversoldRef.current.setData(rsi.map(d => ({ time: d.time, value: 30 })));
      }
    }

    if (!hasFittedRef.current && candles.length > 0) {
      chartRef.current.timeScale().fitContent();
      if (rsiChartRef.current) {
        rsiChartRef.current.timeScale().fitContent();
      }
      hasFittedRef.current = true;
    }
  }, [data, convertData]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (showSMA) {
      if (!smaSeriesRef.current) {
        const smaSeries = chartRef.current.addSeries(LineSeries, {
          color: '#3b82f6',
          lineWidth: 2,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 3,
          priceLineVisible: false,
          title: 'SMA 15',
        });
        smaSeriesRef.current = smaSeries;
      }
      const { sma } = convertData(data);
      smaSeriesRef.current.setData(sma);
    } else {
      if (smaSeriesRef.current) {
        try {
          chartRef.current.removeSeries(smaSeriesRef.current);
        } catch (e) {}
        smaSeriesRef.current = null;
      }
    }
  }, [showSMA, data, convertData]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (showBollinger) {
      if (!bbUpperSeriesRef.current) {
        bbUpperSeriesRef.current = chartRef.current.addSeries(LineSeries, {
          color: 'rgba(59, 130, 246, 0.4)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          title: 'BB Upper',
        });
      }
      if (!bbLowerSeriesRef.current) {
        bbLowerSeriesRef.current = chartRef.current.addSeries(LineSeries, {
          color: 'rgba(59, 130, 246, 0.4)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          title: 'BB Lower',
        });
      }
      const { bbUpper, bbLower } = convertData(data);
      bbUpperSeriesRef.current.setData(bbUpper);
      bbLowerSeriesRef.current.setData(bbLower);
    } else {
      if (bbUpperSeriesRef.current) {
        try {
          chartRef.current.removeSeries(bbUpperSeriesRef.current);
        } catch (e) {}
        bbUpperSeriesRef.current = null;
      }
      if (bbLowerSeriesRef.current) {
        try {
          chartRef.current.removeSeries(bbLowerSeriesRef.current);
        } catch (e) {}
        bbLowerSeriesRef.current = null;
      }
    }
  }, [showBollinger, data, convertData]);

  useEffect(() => {
    if (!rsiContainerRef.current) return;

    if (showRSI) {
      if (!rsiChartRef.current) {
        const container = rsiContainerRef.current;
        const width = container.clientWidth || (chartWrapperRef.current?.clientWidth || 600);

        const rsiChart = createChart(container, {
          width,
          height: 90,
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: 'rgba(255, 255, 255, 0.4)',
            fontSize: 10,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          },
          grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: 'rgba(255, 255, 255, 0.1)', width: 1, style: LineStyle.Dashed, labelVisible: false },
            horzLine: { color: 'rgba(255, 255, 255, 0.1)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1a2e23' },
          },
          rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.04)',
            scaleMargins: { top: 0.05, bottom: 0.05 },
            autoScale: false,
          },
          timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.04)',
            visible: false,
          },
          handleScroll: false,
          handleScale: false,
        });

        rsiChartRef.current = rsiChart;

        const rsiSeries = rsiChart.addSeries(LineSeries, {
          color: '#ca8a04',
          lineWidth: 1.5,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 2,
          priceLineVisible: false,
          title: 'RSI(14)',
        });
        rsiSeriesRef.current = rsiSeries;

        const overbought = rsiChart.addSeries(LineSeries, {
          color: 'rgba(239, 68, 68, 0.25)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          title: '',
        });
        rsiOverboughtRef.current = overbought;

        const oversold = rsiChart.addSeries(LineSeries, {
          color: 'rgba(16, 185, 129, 0.25)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          title: '',
        });
        rsiOversoldRef.current = oversold;

        rsiChart.priceScale('right').applyOptions({
          autoScale: false,
          scaleMargins: { top: 0.05, bottom: 0.05 },
        });

        if (chartRef.current) {
          chartRef.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (range && rsiChartRef.current) {
              rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
            }
          });
          rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (range && chartRef.current) {
              chartRef.current.timeScale().setVisibleLogicalRange(range);
            }
          });
        }
      }

      const { rsi } = convertData(data);
      if (rsiSeriesRef.current) {
        rsiSeriesRef.current.setData(rsi);
        if (rsiOverboughtRef.current) {
          rsiOverboughtRef.current.setData(rsi.map(d => ({ time: d.time, value: 70 })));
        }
        if (rsiOversoldRef.current) {
          rsiOversoldRef.current.setData(rsi.map(d => ({ time: d.time, value: 30 })));
        }
      }
    } else {
      if (rsiChartRef.current) {
        try {
          rsiChartRef.current.remove();
        } catch (e) {}
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
        rsiOverboughtRef.current = null;
        rsiOversoldRef.current = null;
      }
    }
  }, [showRSI, data, convertData]);

  return (
    <div
      ref={chartWrapperRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div
        ref={mainChartContainerRef}
        style={{
          width: '100%',
          flex: 1,
          minHeight: showRSI ? '280px' : '340px',
          position: 'relative',
        }}
      />

      <div
        ref={rsiContainerRef}
        style={{
          width: '100%',
          height: showRSI ? '92px' : '0px',
          display: showRSI ? 'block' : 'none',
          marginTop: '2px',
          borderTop: showRSI ? '1px solid rgba(255,255,255,0.06)' : 'none',
          position: 'relative',
        }}
      />
    </div>
  );
};

export default LightweightCandlestickChart;
