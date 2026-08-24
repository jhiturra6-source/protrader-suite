import React, { useState, useEffect, useRef } from 'react';
import { createChart, LineStyle } from 'lightweight-charts';
import { TrendingUp, Calculator, BarChart2, Search, Loader2 } from 'lucide-react';
import { useMarketData } from './hooks/useMarketData';
import Toolbar from './components/Toolbar/Toolbar';
import ChartDashboard from './components/Chart/ChartDashboard';

// --- UTILIDADES DE FORMATEO ---
const formatInputDisplay = (val) => {
  if (!val && val !== 0) return "";
  const parts = val.toString().split(",");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
};

const parseToFloat = (val) => {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/\./g, '').replace(/,/g, '.'));
};

const formatCurrency = (val) => {
  if (isNaN(val)) return "0,00";
  const fixed = val.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formattedInt},${decPart}`;
};

// --- CÁLCULO DE INDICADORES ---
const calculateSMA = (data, period) => {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    result.push({ time: data[i].time, value: parseFloat((sum / period).toFixed(2)) });
  }
  return result;
};

const calculateEMA = (data, period) => {
  const result = [];
  const multiplier = 2 / (period + 1);
  let prevEMA = null;
  for (let i = 0; i < data.length; i++) {
    const close = data[i].close;
    if (i < period - 1) continue;
    if (prevEMA === null) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += data[j].close;
      prevEMA = sum / (i + 1);
    } else {
      prevEMA = (close - prevEMA) * multiplier + prevEMA;
    }
    result.push({ time: data[i].time, value: parseFloat(prevEMA.toFixed(2)) });
  }
  return result;
};

// --- OSCILADORES ---
const calculateRSI = (data, period = 14) => {
  const result = [];
  let gains = 0, losses = 0;
  for (let i = 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
    
    if (i >= period) {
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push({ time: data[i].time, value: parseFloat(rsi.toFixed(2)) });
      
      // Rolling update
      const prevDiff = data[i - period + 1].close - data[i - period].close;
      if (prevDiff >= 0) gains -= prevDiff;
      else losses -= -prevDiff;
    }
  }
  return result;
};

const calculateStochastic = (data, period = 14, signalPeriod = 3) => {
  const getK = (slice) => {
    const currentClose = slice[slice.length - 1].close;
    let highestHigh = -Infinity, lowestLow = Infinity;
    slice.forEach(d => {
      if (d.high > highestHigh) highestHigh = d.high;
      if (d.low < lowestLow) lowestLow = d.low;
    });
    return ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  };

  const rawK = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const k = getK(slice);
    rawK.push({ time: data[i].time, value: k });
  }

  const slowD = [];
  let sum = 0;
  for (let i = 0; i < rawK.length; i++) {
    sum += rawK[i].value;
    if (i >= signalPeriod - 1) {
      const d = sum / signalPeriod;
      slowD.push({ time: rawK[i].time, value: parseFloat(d.toFixed(2)) });
      sum -= rawK[i - signalPeriod + 1].value;
    }
  }
  return { fastK: rawK, slowD };
};

const calculateMACD = (data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  const emaFast = calculateEMA(data, fastPeriod);
  const emaSlow = calculateEMA(data, slowPeriod);
  const macdLine = [];
  for (let i = 0; i < emaFast.length; i++) {
    const slowMatch = emaSlow.find(e => e.time === emaFast[i].time);
    if (slowMatch) {
      macdLine.push({ time: emaFast[i].time, value: parseFloat((emaFast[i].value - slowMatch.value).toFixed(2)) });
    }
  }
  
  // Signal Line (EMA of MACD)
  const calcEmaFromValues = (values, period) => {
    const result = [];
    const multiplier = 2 / (period + 1);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) continue;
      if (prev === null) {
        let sum = 0;
        for (let j = 0; j <= i; j++) sum += values[j].value;
        prev = sum / (i + 1);
      } else {
        prev = (values[i].value - prev) * multiplier + prev;
      }
      result.push({ time: values[i].time, value: parseFloat(prev.toFixed(2)) });
    }
    return result;
  };
  const signalLine = calcEmaFromValues(macdLine, signalPeriod);
  const histogram = [];
  for (let i = 0; i < macdLine.length; i++) {
    const sigMatch = signalLine.find(s => s.time === macdLine[i].time);
    if (sigMatch) {
      histogram.push({ time: macdLine[i].time, value: parseFloat((macdLine[i].value - sigMatch.value).toFixed(2)) });
    }
  }
  return { macdLine, signalLine, histogram };
};

export default function App() {
  const [activeMenu, setActiveMenu] = useState(1);
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [currentTicker, setCurrentTicker] = useState("AAPL");
  const [interval, setInterval] = useState("1d");
  const [activeTool, setActiveTool] = useState("pointer");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [fundamentals, setFundamentals] = useState(null);
  
  const [drawings, setDrawings] = useState(() => {
    try {
      const saved = localStorage.getItem('protrader-drawings');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('protrader-drawings', JSON.stringify(drawings));
  }, [drawings]);

  const [currentDrawing, setCurrentDrawing] = useState(null);
  const [trendLineColor, setTrendLineColor] = useState("#38bdf8"); 
  const [draggingTextId, setDraggingTextId] = useState(null); 
  const [draggingHandle, setDraggingHandle] = useState(null); // { id, pointIndex }

  const [showSMA200, setShowSMA200] = useState(false);
  const [sma200Period, setSma200Period] = useState(200);
  const [showSMA50, setShowSMA50] = useState(true);
  const [sma50Period, setSma50Period] = useState(50);
  const [showEMA21, setShowEMA21] = useState(false);
  const [ema21Period, setEma21Period] = useState(21);
  const [showEMA10, setShowEMA10] = useState(false);
  const [ema10Period, setEma10Period] = useState(10);

  const [showRSI, setShowRSI] = useState(false);
  const [showStochastic, setShowStochastic] = useState(false);
  const [showMACD, setShowMACD] = useState(false);

  const [tooltipData, setTooltipData] = useState(null);

  const [capital, setCapital] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("1,5");
  
  const marketData = useMarketData(currentTicker, interval);
  const { entryPrice, setEntryPrice, stopLoss, setStopLoss, takeProfit, setTakeProfit } = marketData;
  
  useEffect(() => {
    setChartData(marketData.chartData);
    setIsLoadingData(marketData.isLoadingData);
    setFundamentals(marketData.fundamentals);
  }, [marketData.chartData, marketData.isLoadingData, marketData.fundamentals]);

  const [shares, setShares] = useState("100");

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  
  const indicatorsRef = useRef({});
  const linesRef = useRef({});

  const numCapital = parseToFloat(capital);
  const numEntryPrice = parseToFloat(entryPrice);
  const numStopLoss = parseToFloat(stopLoss);
  const numTakeProfit = parseToFloat(takeProfit);
  const numShares = parseToFloat(shares);

  const m1_riskPerShare = numEntryPrice - numStopLoss;
  const m1_totalRisk = numShares * m1_riskPerShare;
  const m1_projectedProfit = (numTakeProfit - numEntryPrice) * numShares;
  const isInvalidLong = numEntryPrice <= numStopLoss && numEntryPrice > 0;

  const handleNumberChange = (setter) => (e) => {
    let val = e.target.value.replace(/\./g, '');
    val = val.replace(/[^0-9,]/g, '');
    const parts = val.split(',');
    if (parts.length > 2) val = parts[0] + ',' + parts.slice(1).join('');
    setter(val);
  };

  const handleSearchTicker = (e) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;
    setCurrentTicker(tickerInput.toUpperCase().trim());
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: 'solid', color: '#090d16' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#111827' }, horzLines: { color: '#111827' } },
      crosshair: { 
        mode: 0, 
        vertLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0284c7' },
        horzLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0284c7' }
      },
      rightPriceScale: { borderColor: '#1e293b', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { 
        borderColor: '#1e293b', 
        timeVisible: true, 
        rightOffset: 12,
      },
      width: chartContainerRef.current.clientWidth,
      height: 500, 
    });

    const series = chart.addCandlestickSeries({
      upColor: '#38761D', downColor: '#FF6966', borderVisible: false, 
      wickUpColor: '#38761D', wickDownColor: '#FF6966',
      lastValueVisible: false, priceLineVisible: false
    });

    chartRef.current = chart;
    seriesRef.current = series;

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => setChartSync(Date.now()));
    chart.subscribeCrosshairMove((param) => {
      setChartSync(Date.now()); 
      
      if (!param.time || !param.point || !param.seriesData.get(series)) {
        setTooltipData(null);
        return;
      }
      
      const data = param.seriesData.get(series);
      const yHigh = series.priceToCoordinate(data.high);
      const yLow = series.priceToCoordinate(data.low);
      
      if (yHigh === null || yLow === null) return setTooltipData(null);

      const topY = Math.min(yHigh, yLow) - 5; 
      const bottomY = Math.max(yHigh, yLow) + 5;

      if (param.point.y < topY || param.point.y > bottomY) {
        setTooltipData(null);
        return;
      }

      const diff = data.close - data.open;
      const pct = (diff / data.open) * 100;

      const calcValues = {};
      if (indicatorsRef.current.sma200) {
        const val = param.seriesData.get(indicatorsRef.current.sma200);
        calcValues.sma200 = val ? formatCurrency(val.value) : '-';
      }
      if (indicatorsRef.current.sma50) {
        const val = param.seriesData.get(indicatorsRef.current.sma50);
        calcValues.sma50 = val ? formatCurrency(val.value) : '-';
      }
      if (indicatorsRef.current.ema21) {
        const val = param.seriesData.get(indicatorsRef.current.ema21);
        calcValues.ema21 = val ? formatCurrency(val.value) : '-';
      }
      if (indicatorsRef.current.ema10) {
        const val = param.seriesData.get(indicatorsRef.current.ema10);
        calcValues.ema10 = val ? formatCurrency(val.value) : '-';
      }

      setTooltipData({
        x: param.point.x,
        y: param.point.y,
        ticker: currentTicker,
        time: typeof param.time === 'object' ? `${param.time.year}-${param.time.month}-${param.time.day}` : param.time,
        open: formatCurrency(data.open),
        high: formatCurrency(data.high),
        low: formatCurrency(data.low),
        close: formatCurrency(data.close),
        change: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct.toFixed(2)}%)`,
        isUp: diff >= 0,
        ma: calcValues
      });
    });

    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      indicatorsRef.current = {};
      linesRef.current = {};
    };
  }, [currentTicker]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || chartData.length === 0) return;
    const chart = chartRef.current;
    seriesRef.current.setData(chartData);

    const syncSeries = (key, show, data, color) => {
      if (show) {
        if (!indicatorsRef.current[key]) {
          indicatorsRef.current[key] = chart.addLineSeries({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        }
        indicatorsRef.current[key].setData(data);
      } else {
        if (indicatorsRef.current[key] && chartRef.current) {
          try { chart.removeSeries(indicatorsRef.current[key]); } catch {}
          delete indicatorsRef.current[key];
        }
      }
    };

    syncSeries('sma200', showSMA200, calculateSMA(chartData, sma200Period), '#f59e0b');
    syncSeries('sma50', showSMA50, calculateSMA(chartData, sma50Period), '#3b82f6');
    syncSeries('ema21', showEMA21, calculateEMA(chartData, ema21Period), '#ec4899');
    syncSeries('ema10', showEMA10, calculateEMA(chartData, ema10Period), '#06b6d4');
  }, [chartData, showSMA200, sma200Period, showSMA50, sma50Period, showEMA21, ema21Period, showEMA10, ema10Period]);

  const handleMouseDown = (e) => {
    if (activeTool === 'pointer') {
      // Check if we clicked on a handle of an existing drawing
      const target = e.target.closest('[data-handle]');
      if (target) {
        const { id, pointindex } = target.dataset;
        setDraggingHandle({ id: Number(id), pointIndex: Number(pointindex) });
        e.stopPropagation();
        return;
      }
      return;
    }
    if (activeTool === 'eraser' || activeTool === 'text') return;
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!chartRef.current || !seriesRef.current) return;
    
    const logical = chartRef.current.timeScale().coordinateToLogical(x);
    const price = seriesRef.current.coordinateToPrice(y);

    if (!currentDrawing) {
      setCurrentDrawing({ type: activeTool, color: trendLineColor, logical1: logical, price1: price, logical2: logical, price2: price });
    } else {
      const finished = { ...currentDrawing, id: Date.now(), logical2: logical, price2: price };
      setDrawings(prev => [...prev, finished]);
      setCurrentDrawing(null);
    }
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!chartRef.current || !seriesRef.current) return;
    
    if (!chartRef.current || !seriesRef.current) return;
    
    const logical = chartRef.current.timeScale().coordinateToLogical(x);
    const price = seriesRef.current.coordinateToPrice(y);

    if (draggingHandle) {
      setDrawings(prev => prev.map(d => {
        if (d.id !== draggingHandle.id) return d;
        const keyLogical = draggingHandle.pointIndex === 1 ? 'logical1' : 'logical2';
        const keyPrice = draggingHandle.pointIndex === 1 ? 'price1' : 'price2';
        return { ...d, [keyLogical]: logical, [keyPrice]: price };
      }));
      return;
    }

    if (draggingTextId) {
      setDrawings(prev => prev.map(d => d.id === draggingTextId ? { ...d, logical1: logical, price1: price } : d));
      return;
    }

    if (!currentDrawing) return;
    e.stopPropagation();
    setCurrentDrawing(prev => ({ ...prev, logical2: logical, price2: price }));
  };

  const handleMouseUp = () => {
    if (draggingTextId) setDraggingTextId(null);
    if (draggingHandle) setDraggingHandle(null);
  };

  const handleChartClick = (e) => {
    if (activeTool === 'text') {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const logical = chartRef.current.timeScale().coordinateToLogical(x);
      const price = seriesRef.current.coordinateToPrice(y);

      const textVal = prompt("Ingrese el texto:", "Zona de interés");
      if (textVal) setDrawings(prev => [...prev, { id: Date.now(), type: 'text', logical1: logical, price1: price, text: textVal }]);
      setActiveTool("pointer"); 
    }
  };

  const deleteDrawing = (id, e) => {
    if (e) e.stopPropagation();
    setDrawings(prev => prev.filter(d => d.id !== id));
  };

  const renderDrawing = (d) => {
    if (!chartRef.current || !seriesRef.current) return null;
    const timeScale = chartRef.current.timeScale();
    const series = seriesRef.current;

    const x1 = timeScale.logicalToCoordinate(d.logical1);
    const y1 = series.priceToCoordinate(d.price1);
    
    let x2 = x1, y2 = y1;
    if (d.logical2 !== undefined) {
      x2 = timeScale.logicalToCoordinate(d.logical2);
      y2 = series.priceToCoordinate(d.price2);
    }

    if (x1 === null || y1 === null) return null; 

    const commonProps = {
      style: { pointerEvents: activeTool === 'eraser' ? 'auto' : 'none' },
      className: activeTool === 'eraser' ? 'cursor-pointer hover:opacity-50 transition-opacity' : '',
      onClick: (e) => { if (activeTool === 'eraser') deleteDrawing(d.id, e); }
    };

    if (d.type === 'pencil') {
      return (
        <g key={d.id} {...commonProps}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="15" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color || '#38bdf8'} strokeWidth="2" markerEnd="url(#arrow)" />
          <circle cx={x1} cy={y1} r="5" fill={d.color || '#38bdf8'} data-handle data-id={d.id} data-pointindex="1" className="cursor-grab" />
          <circle cx={x2} cy={y2} r="5" fill={d.color || '#38bdf8'} data-handle data-id={d.id} data-pointindex="2" className="cursor-grab" />
        </g>
      );
    }
    if (d.type === 'ruler') {
      const isUp = d.price2 >= d.price1;
      const rColor = isUp ? '#38761D' : '#FF6966';
      
      const pctDiff = ((d.price2 - d.price1) / Math.abs(d.price1 || 1)) * 100;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      return (
        <g key={d.id} {...commonProps}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="15" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={rColor} strokeWidth="2" strokeDasharray="4" markerEnd={`url(#arrow-${isUp ? 'up' : 'down'})`} />
          <circle cx={x1} cy={y1} r="5" fill={rColor} data-handle data-id={d.id} data-pointindex="1" className="cursor-grab" />
          <circle cx={x2} cy={y2} r="5" fill={rColor} data-handle data-id={d.id} data-pointindex="2" className="cursor-grab" />
          <rect x={midX - 30} y={midY - 12} width="60" height="20" rx="4" fill="#0f172a" stroke={rColor} strokeWidth="1" />
          <text x={midX} y={midY + 2} fill={rColor} fontSize="10" fontWeight="bold" textAnchor="middle">
            {pctDiff >= 0 ? '+' : ''}{pctDiff.toFixed(2)}%
          </text>
        </g>
      );
    }
    if (d.type === 'line' || d.type === 'horizontal-line' || d.type === 'vertical-line') {
      let x1 = timeScale.logicalToCoordinate(d.logical1);
      let y1 = series.priceToCoordinate(d.price1);
      let x2 = timeScale.logicalToCoordinate(d.logical2);
      let y2 = series.priceToCoordinate(d.price2);

      if (d.type === 'horizontal-line') { x1 = 0; x2 = chartRef.current.timeScale().width(); }
      else if (d.type === 'vertical-line') { y1 = 0; y2 = 400; } // Altura del chart

      return (
        <g key={d.id} {...commonProps}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color || '#38bdf8'} strokeWidth="1.5" />
          {d.type !== 'horizontal-line' && d.type !== 'vertical-line' && (
            <>
              <circle cx={x1} cy={y1} r="5" fill={d.color || '#38bdf8'} data-handle data-id={d.id} data-pointindex="1" className="cursor-grab" />
              <circle cx={x2} cy={y2} r="5" fill={d.color || '#38bdf8'} data-handle data-id={d.id} data-pointindex="2" className="cursor-grab" />
            </>
          )}
        </g>
      );
    }
    if (d.type === 'rectangle') {
      const rectX = Math.min(x1, x2);
      const rectY = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      return (
        <g key={d.id} {...commonProps}>
          <rect x={rectX} y={rectY} width={width} height={height} fill={`${d.color || '#38bdf8'}20`} stroke={d.color || '#38bdf8'} strokeWidth="1.5" />
          <circle cx={x1} cy={y1} r="5" fill={d.color || '#38bdf8'} data-handle data-id={d.id} data-pointindex="1" className="cursor-grab" />
          <circle cx={x2} cy={y2} r="5" fill={d.color || '#38bdf8'} data-handle data-id={d.id} data-pointindex="2" className="cursor-grab" />
        </g>
      );
    }
    if (d.type === 'text') {
      const isPointer = activeTool === 'pointer';
      return (
        <g 
          key={d.id}
          onMouseDown={(e) => { 
            if(isPointer) { e.stopPropagation(); setDraggingTextId(d.id); } 
          }}
          onDoubleClick={(e) => {
            if (isPointer) {
              e.stopPropagation();
              const newText = prompt("Editar texto:", d.text);
              if (newText) {
                setDrawings(prev => prev.map(item => item.id === d.id ? { ...item, text: newText } : item));
              }
            }
          }}
          className={`${isPointer ? 'cursor-move' : ''} ${activeTool === 'eraser' ? 'cursor-pointer hover:opacity-50' : ''}`}
          style={{ pointerEvents: (isPointer || activeTool === 'eraser') ? 'auto' : 'none' }}
          onClick={(e) => { if (activeTool === 'eraser') deleteDrawing(d.id, e); }}
        >
          <rect x={x1 - 10} y={y1 - 16} width={(d.text.length * 7) + 20} height={24} rx="4" fill="#0f172a80" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2" className="opacity-50 hover:opacity-100 transition-opacity" />
          <text x={x1} y={y1} fill="#38bdf8" fontSize="11" fontWeight="bold">
            {d.text}
          </text>
        </g>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto space-y-6">        
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl"><TrendingUp className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">ProTrader Suite</h1>
              <p className="text-slate-500 text-xs">Gestión de Riesgo & Gráficos Profesionales</p>
            </div>
          </div>
          <div className="flex p-1 bg-slate-900 rounded-xl w-full md:w-auto border border-slate-800">
            <button onClick={() => setActiveMenu(1)} className={`flex-1 md:w-40 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${activeMenu === 1 ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}>
              <BarChart2 className="w-3.5 h-3.5" /> Evaluar Posición
            </button>
            <button onClick={() => setActiveMenu(2)} className={`flex-1 md:w-40 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${activeMenu === 2 ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}>
              <Calculator className="w-3.5 h-3.5" /> Tamaño Ideal
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">          
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Parámetros de Riesgo</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Capital</label>
                    <input type="text" inputMode="decimal" value={formatInputDisplay(capital)} onChange={handleNumberChange(setCapital)} className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Riesgo %</label>
                    <div className="relative">
                      <input type="text" inputMode="decimal" value={formatInputDisplay(riskPercent)} onChange={handleNumberChange(setRiskPercent)} className="w-full pl-2 pr-6 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-emerald-500" />
                      <div className="absolute right-2.5 top-2 text-slate-500 text-xs pointer-events-none">%</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-medium text-blue-400 mb-1">Entrada</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(entryPrice)} onChange={handleNumberChange(setEntryPrice)} className="w-full px-2 py-1.5 bg-slate-900 border border-blue-900/50 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-rose-400 mb-1">Stop Loss</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(stopLoss)} onChange={handleNumberChange(setStopLoss)} className="w-full px-2 py-1.5 bg-slate-900 border border-rose-900/50 rounded-xl text-rose-100 text-sm focus:ring-2 focus:ring-rose-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-medium text-emerald-400 mb-1">Take Profit</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(takeProfit)} onChange={handleNumberChange(setTakeProfit)} className="w-full px-2 py-1.5 bg-slate-900 border border-emerald-900/50 rounded-xl text-emerald-100 text-sm focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">Acciones</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(shares)} onChange={handleNumberChange(setShares)} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-slate-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Indicadores</h2>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={showSMA200} onChange={(e) => setShowSMA200(e.target.checked)} className="accent-amber-500" />
                  SMA
                  <input type="number" value={sma200Period} onChange={(e) => setSma200Period(Number(e.target.value))} className="w-12 px-1 bg-slate-950 border border-slate-700 rounded text-right" />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={showSMA50} onChange={(e) => setShowSMA50(e.target.checked)} className="accent-blue-500" />
                  SMA
                  <input type="number" value={sma50Period} onChange={(e) => setSma50Period(Number(e.target.value))} className="w-12 px-1 bg-slate-950 border border-slate-700 rounded text-right" />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={showEMA21} onChange={(e) => setShowEMA21(e.target.checked)} className="accent-pink-500" />
                  EMA
                  <input type="number" value={ema21Period} onChange={(e) => setEma21Period(Number(e.target.value))} className="w-12 px-1 bg-slate-950 border border-slate-700 rounded text-right" />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={showEMA10} onChange={(e) => setShowEMA10(e.target.checked)} className="accent-cyan-500" />
                  EMA
                  <input type="number" value={ema10Period} onChange={(e) => setEma10Period(Number(e.target.value))} className="w-12 px-1 bg-slate-950 border border-slate-700 rounded text-right" />
                </div>
                
                <div className="h-px bg-slate-800 my-2"></div>
                
                <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)} className="accent-purple-500" /> RSI (14)</label>
                <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showStochastic} onChange={(e) => setShowStochastic(e.target.checked)} className="accent-orange-500" /> Stochastic</label>
                <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showMACD} onChange={(e) => setShowMACD(e.target.checked)} className="accent-indigo-500" /> MACD</label>
              </div>
            </div>

            {fundamentals && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
                <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Fundamentales</h2>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">EPS Actual</span><span className="text-emerald-400 font-bold">{fundamentals.epsTrailing}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">EPS Estimado</span><span className="text-blue-400 font-bold">{fundamentals.epsForward}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">EPS Proy. Trim.</span><span className="text-purple-400 font-bold">{fundamentals.epsEstimateNextQuarter}</span></div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-9 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative">
              <form onSubmit={handleSearchTicker} className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input type="text" value={tickerInput} onChange={(e) => setTickerInput(e.target.value)} placeholder="Símbolo (ej: AAPL)" className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-emerald-500 uppercase" />
                </div>
                <div className="flex bg-slate-950 border border-slate-700 rounded-xl overflow-hidden">
                  {['1d', '1wk', '1mo'].map((i) => (
                    <button key={i} type="button" onClick={() => setInterval(i)} className={`px-3 py-1 text-xs font-medium uppercase transition-colors ${interval === i ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                      {i}
                    </button>
                  ))}
                </div>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors">Buscar</button>
                {isLoadingData && <Loader2 className="w-5 h-5 animate-spin text-emerald-400 my-auto" />}
              </form>

              <div className="relative">
                <Toolbar 
                  activeTool={activeTool} 
                  setActiveTool={setActiveTool} 
                  trendLineColor={trendLineColor} 
                  setTrendLineColor={setTrendLineColor} 
                  onClearDrawings={() => { setDrawings([]); setCurrentDrawing(null); }}
                />
                  <ChartDashboard 
                  chartData={chartData}
                  ref={chartContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onClick={handleChartClick}
                  drawings={drawings}
                  currentDrawing={currentDrawing}
                  renderDrawing={renderDrawing}
                  indicators={[
                    showRSI && chartData.length > 0 && { title: "RSI (14)", data: calculateRSI(chartData), color: "#a855f7", min: 0, max: 100, overbought: 70, oversold: 30 },
                    showStochastic && chartData.length > 0 && { title: "Stochastic %K", data: calculateStochastic(chartData).fastK, color: "#f97316", min: 0, max: 100, overbought: 80, oversold: 20 },
                    showMACD && chartData.length > 0 && { title: "MACD (12, 26, 9)", data: calculateMACD(chartData).macdLine, color: "#6366f1", min: -20, max: 20, overbought: 10, oversold: -10 }
                  ].filter(Boolean)}
                />

                {tooltipData && (
                  <div className="absolute z-10 bg-slate-900/95 border border-slate-700 rounded-xl p-3 text-xs shadow-2xl pointer-events-none" style={{ left: tooltipData.x + 15, top: tooltipData.y + 15, minWidth: '140px' }}>
                    <div className="font-bold text-white mb-1">{tooltipData.ticker} <span className="font-normal text-slate-400">{tooltipData.time}</span></div>
                    <div className={`grid grid-cols-2 gap-x-4 gap-y-1 ${tooltipData.isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <span>A: {tooltipData.open}</span><span>C: {tooltipData.close}</span>
                      <span>M: {tooltipData.high}</span><span>m: {tooltipData.low}</span>
                    </div>
                    <div className={`mt-1 font-bold ${tooltipData.isUp ? 'text-emerald-400' : 'text-rose-400'}`}>{tooltipData.change}</div>
                    {tooltipData.ma && Object.keys(tooltipData.ma).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700 grid grid-cols-2 gap-x-2 gap-y-1 text-slate-300">
                        {tooltipData.ma.sma200 && <span>SMA200: {tooltipData.ma.sma200}</span>}
                        {tooltipData.ma.sma50 && <span>SMA50: {tooltipData.ma.sma50}</span>}
                        {tooltipData.ma.ema21 && <span>EMA21: {tooltipData.ma.ema21}</span>}
                        {tooltipData.ma.ema10 && <span>EMA10: {tooltipData.ma.ema10}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {showRSI && chartData.length > 0 && (
              <OscillatorPanel title="RSI (14)" data={calculateRSI(chartData)} color="#a855f7" min={0} max={100} overbought={70} oversold={30} />
            )}
            {showStochastic && chartData.length > 0 && (
              <OscillatorPanel title="Stochastic %K" data={calculateStochastic(chartData).fastK} color="#f97316" min={0} max={100} overbought={80} oversold={20} />
            )}
            {showMACD && chartData.length > 0 && (
              <MACDPanel data={calculateMACD(chartData)} />
            )}

            {activeMenu === 2 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
                <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Tamaño de Posición Ideal</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                    <div className="text-xs text-slate-400 mb-1">Riesgo por Acción</div>
                    <div className="text-xl font-bold text-rose-400">{formatCurrency(m1_riskPerShare)}</div>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                    <div className="text-xs text-slate-400 mb-1">Riesgo Total</div>
                    <div className="text-xl font-bold text-amber-400">{formatCurrency(m1_totalRisk)}</div>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                    <div className="text-xs text-slate-400 mb-1">Ganancia Proyectada</div>
                    <div className="text-xl font-bold text-emerald-400">{formatCurrency(m1_projectedProfit)}</div>
                  </div>
                </div>
                {isInvalidLong && (
                  <div className="mt-4 p-3 bg-rose-950/50 border border-rose-900 rounded-xl text-rose-300 text-xs text-center">
                    ⚠️ Advertencia: El precio de entrada debe ser mayor al Stop Loss para una posición larga.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const OscillatorPanel = ({ title, data, color, max, overbought, oversold }) => {
  if (!data || data.length === 0) return null;
  const last = data[data.length - 1].value;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="text-xs font-mono" style={{ color }}>{last.toFixed(2)}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-slate-700 to-transparent" style={{ width: `${(last / max) * 100}%` }}></div>
        <div className="absolute top-0 bottom-0 w-px bg-rose-500" style={{ left: `${(overbought / max) * 100}%` }}></div>
        <div className="absolute top-0 bottom-0 w-px bg-emerald-500" style={{ left: `${(oversold / max) * 100}%` }}></div>
      </div>
    </div>
  );
};

const MACDPanel = ({ data }) => {
  if (!data || !data.macdLine || data.macdLine.length === 0) return null;
  const last = data.macdLine[data.macdLine.length - 1].value;
  const hist = data.histogram[data.histogram.length - 1]?.value || 0;
  const isPos = last >= 0;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold text-white">MACD (12, 26, 9)</h3>
        <div className="flex gap-3 text-xs font-mono">
          <span className={isPos ? 'text-emerald-400' : 'text-rose-400'}>MACD: {last.toFixed(2)}</span>
          <span className={hist >= 0 ? 'text-emerald-400' : 'text-rose-400'}>HIST: {hist.toFixed(2)}</span>
        </div>
      </div>
      <div className="h-2 bg-slate-800 rounded-full relative overflow-hidden">
        <div className={`absolute top-0 bottom-0 w-px bg-slate-500 left-1/2`}></div>
        <div className={`absolute inset-y-0 ${isPos ? 'left-1/2' : 'right-1/2'} ${isPos ? 'bg-emerald-500/50' : 'bg-rose-500/50'}`} style={{ width: `${Math.min(Math.abs(last) * 5, 50)}%` }}></div>
      </div>
    </div>
  );
};
