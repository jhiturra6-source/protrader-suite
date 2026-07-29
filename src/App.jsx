import React, { useState, useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import { 
  TrendingUp, Calculator, BarChart2, MousePointer2, 
  Type, Trash2, Eye, EyeOff, Search, Loader2, Eraser, MoveUpRight, Settings, X
} from 'lucide-react';

// --- UTILIDADES ---
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
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart}`;
};

// --- ALGORITMOS DE AGRUPACIÓN (Timeframes) ---
const aggregateData = (data, period) => {
  if (period === '1D' || !data.length) return data;
  const aggregated = [];
  let current = null;
  let currentKey = null;

  data.forEach(d => {
    const date = new Date(d.time);
    let key;
    if (period === '1W') {
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(date.setDate(diff));
      key = weekStart.toISOString().split('T')[0];
    } else if (period === '1M') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }

    if (key !== currentKey) {
      if (current) aggregated.push(current);
      currentKey = key;
      current = { time: key, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume };
    } else {
      current.high = Math.max(current.high, d.high);
      current.low = Math.min(current.low, d.low);
      current.close = d.close;
      current.volume += d.volume;
    }
  });
  if (current) aggregated.push(current);
  return aggregated;
};

// --- INDICADORES TÉCNICOS ---
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
    if (i < period - 1) continue;
    if (prevEMA === null) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += data[j].close;
      prevEMA = sum / (i + 1);
    } else {
      prevEMA = (data[i].close - prevEMA) * multiplier + prevEMA;
    }
    result.push({ time: data[i].time, value: parseFloat(prevEMA.toFixed(2)) });
  }
  return result;
};

const calculateRSI = (data, period = 14) => {
  let result = [];
  let gains = 0, losses = 0;
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains += change > 0 ? change : 0;
    losses += change < 0 ? Math.abs(change) : 0;
    if (i >= period) {
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push({ time: data[i].time, value: parseFloat((100 - (100 / (1 + rs))).toFixed(2)) });
      const oldestChange = data[i - period + 1].close - data[i - period].close;
      gains -= oldestChange > 0 ? oldestChange : 0;
      losses -= oldestChange < 0 ? Math.abs(oldestChange) : 0;
    }
  }
  return result;
};

const calculateMACD = (data) => {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const result = [];
  let j = 0;
  for (let i = 0; i < ema26.length; i++) {
    while (j < ema12.length && ema12[j].time !== ema26[i].time) j++;
    if (j < ema12.length) {
      result.push({ time: ema26[i].time, value: parseFloat((ema12[j].value - ema26[i].value).toFixed(2)) });
    }
  }
  return result;
};

export default function App() {
  const [activeMenu, setActiveMenu] = useState(1);
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [currentTicker, setCurrentTicker] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1D"); 
  const [visibleDates, setVisibleDates] = useState("Cargando...");
  
  // Dibujo interactivo SVG
  const [activeTool, setActiveTool] = useState("pointer");
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoint, setCurrentPoint] = useState(null);
  const [drawings, setDrawings] = useState([]);
  
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [rawChartData, setRawChartData] = useState([]); 
  const [chartData, setChartData] = useState([]); 

  // Visibilidad de Indicadores (Estilo Koyfin)
  const [showMainChart, setShowMainChart] = useState(true);
  const [showSMA200, setShowSMA200] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showEMA10, setShowEMA10] = useState(true);
  const [showMACD, setShowMACD] = useState(true);
  const [showRSI, setShowRSI] = useState(true);

  const [ohlcData, setOhlcData] = useState({ o: '-', h: '-', l: '-', c: '-', change: '-' });

  // Referencias DOM y Gráficos
  const mainChartContainerRef = useRef(null);
  const macdChartContainerRef = useRef(null);
  const rsiChartContainerRef = useRef(null);
  
  const chartsRef = useRef({});
  const seriesRef = useRef({});
  const linesRef = useRef({});

  const [capital, setCapital] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("1,5");
  const [entryPrice, setEntryPrice] = useState("150,00");
  const [stopLoss, setStopLoss] = useState("145,00");
  const [takeProfit, setTakeProfit] = useState("165,00");
  const [shares, setShares] = useState("100");

  const numCapital = parseToFloat(capital);
  const numRiskPercent = parseToFloat(riskPercent);
  const numEntryPrice = parseToFloat(entryPrice);
  const numStopLoss = parseToFloat(stopLoss);
  const numTakeProfit = parseToFloat(takeProfit);
  const numShares = parseToFloat(shares);

  const m1_riskPerShare = numEntryPrice - numStopLoss;
  const m1_totalRisk = numShares * m1_riskPerShare;
  const m1_projectedProfit = (numTakeProfit - numEntryPrice) * numShares;
  const m1_actualRiskPercent = numCapital > 0 ? (m1_totalRisk / numCapital) * 100 : 0; 
  const isInvalidLong = numEntryPrice <= numStopLoss && numEntryPrice > 0;

  const handleNumberChange = (setter) => (e) => {
    let val = e.target.value.replace(/\./g, '');
    val = val.replace(/[^0-9,]/g, '');
    const parts = val.split(',');
    if (parts.length > 2) val = parts[0] + ',' + parts.slice(1).join('');
    setter(val);
  };

  // API Fetch
  useEffect(() => {
    const fetchRealMarketData = async () => {
      setIsLoadingData(true);
      try {
        const response = await fetch(`/api/finance?symbol=${currentTicker}`);
        const json = await response.json();
        if (json.error) throw new Error(json.error);

        const result = json.chart.result[0];
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];
        const volumes = quotes.volume;

        const formattedData = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (quotes.open[i] !== null && quotes.close[i] !== null) {
            formattedData.push({
              time: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
              open: parseFloat(quotes.open[i].toFixed(2)),
              high: parseFloat(quotes.high[i].toFixed(2)),
              low: parseFloat(quotes.low[i].toFixed(2)),
              close: parseFloat(quotes.close[i].toFixed(2)),
              volume: volumes[i] || 0
            });
          }
        }

        if (formattedData.length > 0) {
          setRawChartData(formattedData);
        }
      } catch (error) {
        console.error("Error al obtener datos:", error);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchRealMarketData();
  }, [currentTicker]);

  useEffect(() => {
    setChartData(aggregateData(rawChartData, timeframe));
  }, [rawChartData, timeframe]);

  const handleSearchTicker = (e) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;
    setCurrentTicker(tickerInput.toUpperCase().trim());
  };

  const applyZoomFilter = (filter) => {
    if (!chartsRef.current.main || chartData.length === 0) return;
    const lastDate = new Date(chartData[chartData.length - 1].time);
    let startDate = new Date(lastDate);
    
    switch(filter) {
      case '1M': startDate.setMonth(startDate.getMonth() - 1); break;
      case '3M': startDate.setMonth(startDate.getMonth() - 3); break;
      case '6M': startDate.setMonth(startDate.getMonth() - 6); break;
      case 'YTD': startDate = new Date(lastDate.getFullYear(), 0, 1); break;
      case '1Y': startDate.setFullYear(startDate.getFullYear() - 1); break;
      case 'ALL': startDate = new Date(chartData[0].time); break;
      default: return;
    }
    
    try {
      chartsRef.current.main.timeScale().setVisibleRange({
        from: startDate.toISOString().split('T')[0],
        to: lastDate.toISOString().split('T')[0]
      });
    } catch (e) {
      console.warn("Rango inválido temporalmente");
    }
  };

  // --- INICIALIZACIÓN DE GRÁFICOS (SINCRONIZACIÓN BLINDADA) ---
  useEffect(() => {
    if (!mainChartContainerRef.current) return;

    const commonOptions = {
      layout: { background: { type: 'solid', color: '#151922' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale: { 
        borderColor: '#2a2e39', 
        timeVisible: true,
        rightOffset: 12, 
      },
    };

    // 1. Gráfico Principal (Velas + Volumen)
    const mainChart = createChart(mainChartContainerRef.current, commonOptions);
    chartsRef.current.main = mainChart;
    
    const candleSeries = mainChart.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350', 
      borderVisible: false, 
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });
    seriesRef.current.candles = candleSeries;

    const volumeSeries = mainChart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '', 
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    seriesRef.current.volume = volumeSeries;

    // Suscripción OHLC
    mainChart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData.get(candleSeries)) {
        const data = param.seriesData.get(candleSeries);
        const diff = data.close - data.open;
        const pct = (diff / data.open) * 100;
        setOhlcData({
          o: formatCurrency(data.open), h: formatCurrency(data.high), l: formatCurrency(data.low), c: formatCurrency(data.close),
          change: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct.toFixed(2)}%)`
        });
      }
    });

    // Rango de Fechas Visible en UI Superior (Solo leemos de mainChart)
    mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range && range.from && range.to) {
        const start = new Date(range.from * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const end = new Date(range.to * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        setVisibleDates(`${start} - ${end}`);
      }
    });

    // 2. MACD Chart
    if (macdChartContainerRef.current && showMACD) {
      const macdChart = createChart(macdChartContainerRef.current, { ...commonOptions, timeScale: { ...commonOptions.timeScale, visible: false } });
      chartsRef.current.macd = macdChart;
    }

    // 3. RSI Chart
    if (rsiChartContainerRef.current && showRSI) {
      const rsiChart = createChart(rsiChartContainerRef.current, { ...commonOptions, timeScale: { ...commonOptions.timeScale, visible: false } });
      chartsRef.current.rsi = rsiChart;
    }

    // Sincronización Maestra de TimeScales (LÓGICA BLINDADA ANTI-CRASH)
    const syncCharts = () => {
      const allCharts = [chartsRef.current.main, chartsRef.current.macd, chartsRef.current.rsi].filter(Boolean);
      
      allCharts.forEach(sourceChart => {
        // Usamos LogicalRange (índices) porque es mucho más seguro que TimeRange cuando un chart no ha cargado datos.
        sourceChart.timeScale().subscribeVisibleLogicalRangeChange(logicalRange => {
          if (!logicalRange) return;
          
          allCharts.forEach(targetChart => {
            if (targetChart !== sourceChart) {
              try {
                // Try-catch evita que la app colapse si targetChart aún no tiene datos suficientes.
                targetChart.timeScale().setVisibleLogicalRange(logicalRange);
              } catch (err) {
                // Silencioso. El gráfico se sincronizará en el siguiente render válido.
              }
            }
          });
        });
      });
    };
    syncCharts();

    const handleResize = () => {
      if (mainChartContainerRef.current && chartsRef.current.main) chartsRef.current.main.applyOptions({ width: mainChartContainerRef.current.clientWidth });
      if (macdChartContainerRef.current && chartsRef.current.macd) chartsRef.current.macd.applyOptions({ width: macdChartContainerRef.current.clientWidth });
      if (rsiChartContainerRef.current && chartsRef.current.rsi) chartsRef.current.rsi.applyOptions({ width: rsiChartContainerRef.current.clientWidth });
    };
    
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 50);

    return () => {
      window.removeEventListener('resize', handleResize);
      Object.values(chartsRef.current).forEach(chart => chart && chart.remove());
      chartsRef.current = {};
    };
  }, [showMACD, showRSI]); 

  // --- LLENADO DE DATOS E INDICADORES (Actualización en tiempo real) ---
  useEffect(() => {
    if (!seriesRef.current.candles || chartData.length === 0) return;
    
    const mainChart = chartsRef.current.main;
    
    seriesRef.current.candles.applyOptions({ visible: showMainChart });
    seriesRef.current.volume.applyOptions({ visible: showMainChart });

    if (showMainChart) {
      seriesRef.current.candles.setData(chartData);
      seriesRef.current.volume.setData(chartData.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? '#26a69a80' : '#ef535080' })));
    }

    const last = chartData[chartData.length - 1];
    if (last) {
      const diff = last.close - last.open;
      const pct = (diff / last.open) * 100;
      setOhlcData({
        o: formatCurrency(last.open), h: formatCurrency(last.high), l: formatCurrency(last.low), c: formatCurrency(last.close),
        change: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct.toFixed(2)}%)`
      });

      if (linesRef.current.tickerPrice) seriesRef.current.candles.removePriceLine(linesRef.current.tickerPrice);
      if (showMainChart) {
        linesRef.current.tickerPrice = seriesRef.current.candles.createPriceLine({
          price: last.close, color: '#3b82f6', lineWidth: 0, lineStyle: 0, axisLabelColor: '#3b82f6', axisLabelTextColor: '#ffffff', title: currentTicker
        });
      }
    }

    Object.keys(seriesRef.current).forEach(key => {
      if (key !== 'candles' && key !== 'volume' && seriesRef.current[key]) {
        if (mainChart && mainChart.timeScale) {
          try { mainChart.removeSeries(seriesRef.current[key]); } catch(e){}
        }
      }
    });

    if (showSMA200) {
      const line = mainChart.addLineSeries({ color: '#a855f7', lineWidth: 2, lineStyle: 0, title: 'SMA (200D)' });
      line.setData(calculateSMA(chartData, 200));
      seriesRef.current.sma200 = line;
    }
    if (showSMA50) {
      const line = mainChart.addLineSeries({ color: '#eab308', lineWidth: 2, lineStyle: 0, title: 'SMA (50D)' });
      line.setData(calculateSMA(chartData, 50));
      seriesRef.current.sma50 = line;
    }
    if (showEMA21) {
      const line = mainChart.addLineSeries({ color: '#f97316', lineWidth: 2, lineStyle: 0, title: 'EMA (21D)' });
      line.setData(calculateEMA(chartData, 21));
      seriesRef.current.ema21 = line;
    }
    if (showEMA10) {
      const line = mainChart.addLineSeries({ color: '#22c55e', lineWidth: 2, lineStyle: 0, title: 'EMA (10D)' });
      line.setData(calculateEMA(chartData, 10));
      seriesRef.current.ema10 = line;
    }

    if (chartsRef.current.macd && showMACD) {
      const line = chartsRef.current.macd.addLineSeries({ color: '#ef4444', lineWidth: 2, title: 'MACD' });
      line.setData(calculateMACD(chartData));
      seriesRef.current.macd = line;
    }
    
    if (chartsRef.current.rsi && showRSI) {
      const line = chartsRef.current.rsi.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'RSI (14D)' });
      line.setData(calculateRSI(chartData, 14));
      seriesRef.current.rsi = line;
    }

  }, [chartData, showMainChart, showSMA200, showSMA50, showEMA21, showEMA10, showMACD, showRSI, currentTicker]);

  useEffect(() => {
    if (!seriesRef.current.candles) return;
    const series = seriesRef.current.candles;

    if (linesRef.current.entry) series.removePriceLine(linesRef.current.entry);
    if (linesRef.current.sl) series.removePriceLine(linesRef.current.sl);
    if (linesRef.current.tp) series.removePriceLine(linesRef.current.tp);

    if (numEntryPrice > 0) {
      linesRef.current.entry = series.createPriceLine({
        price: numEntryPrice, color: '#3b82f6', lineWidth: 2, lineStyle: 2, 
        axisLabelColor: '#3b82f6', axisLabelTextColor: '#ffffff', title: ''
      });
    }
    if (numStopLoss > 0) {
      linesRef.current.sl = series.createPriceLine({
        price: numStopLoss, color: '#ef4444', lineWidth: 2, lineStyle: 2, 
        axisLabelColor: '#ef4444', axisLabelTextColor: '#ffffff', title: ''
      });
    }
    if (numTakeProfit > 0) {
      linesRef.current.tp = series.createPriceLine({
        price: numTakeProfit, color: '#10b981', lineWidth: 2, lineStyle: 2, 
        axisLabelColor: '#10b981', axisLabelTextColor: '#ffffff', title: ''
      });
    }
  }, [numEntryPrice, numStopLoss, numTakeProfit]);

  // --- LÓGICA DE DIBUJO SVG ---
  const handleSVGMouseDown = (e) => {
    if (activeTool === 'pointer' || activeTool === 'eraser') return;
    const rect = e.currentTarget.getBoundingClientRect();
    setIsDrawing(true);
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setStartPoint(pt);
    setCurrentPoint(pt);
  };
  const handleSVGMouseMove = (e) => {
    if (!isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCurrentPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const handleSVGMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (activeTool === 'arrow' && startPoint && currentPoint) {
      setDrawings(prev => [...prev, { id: Date.now(), type: 'arrow', x1: startPoint.x, y1: startPoint.y, x2: currentPoint.x, y2: currentPoint.y }]);
    } else if (activeTool === 'text' && currentPoint) {
      const textVal = prompt("Ingrese el texto:", "Texto");
      if (textVal) setDrawings(prev => [...prev, { id: Date.now(), type: 'text', x: currentPoint.x, y: currentPoint.y, text: textVal }]);
    }
    setStartPoint(null); setCurrentPoint(null);
  };
  const handleDeleteDrawing = (e, id) => {
    if (activeTool === 'eraser') {
      e.stopPropagation();
      setDrawings(prev => prev.filter(d => d.id !== id));
    }
  };
  const drawArrowHead = (x1, y1, x2, y2) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headlen = 12;
    return `${x2},${y2} ${x2 - headlen * Math.cos(angle - Math.PI/6)},${y2 - headlen * Math.sin(angle - Math.PI/6)} ${x2 - headlen * Math.cos(angle + Math.PI/6)},${y2 - headlen * Math.sin(angle + Math.PI/6)}`;
  };

  // --- Componente Reutilizable Sidebar Item ---
  const SelectionItem = ({ label, colorClass, state, setState }) => (
    <div className={`flex items-center justify-between p-2.5 bg-[#1e222d] rounded-md mb-1.5 border-l-4 ${colorClass} hover:bg-[#2a2e39] transition`}>
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setState(!state)}>
        {state ? <Eye className="w-4 h-4 text-slate-300" /> : <EyeOff className="w-4 h-4 text-slate-600" />}
        <span className={`text-xs font-semibold ${state ? 'text-white' : 'text-slate-500'}`}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5 opacity-50 hover:opacity-100 cursor-pointer">
        <Settings className="w-3.5 h-3.5 text-slate-400" />
        <X className="w-3.5 h-3.5 text-slate-400" onClick={() => setState(false)}/>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 p-2 md:p-4 font-sans selection:bg-blue-500/30 flex flex-col">
      <div className="max-w-[1600px] mx-auto w-full flex-1 flex flex-col gap-4">
        
        {/* Cabecera Superior: Koyfin Style */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-[#151922] border border-[#2a2e39] p-2.5 rounded-xl">
           <div className="flex items-center gap-3 overflow-x-auto pb-1 xl:pb-0 hide-scrollbar">
              <form onSubmit={handleSearchTicker} className="flex items-center">
                <div className="relative">
                  <input type="text" value={tickerInput} onChange={(e) => setTickerInput(e.target.value.toUpperCase())} className="bg-[#0b0e14] border border-[#2a2e39] text-white font-bold text-sm px-3 py-1.5 pl-8 rounded-lg w-32 focus:ring-1 focus:ring-blue-500 uppercase tracking-wider outline-none" placeholder="AAPL" />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </form>
              <div className="px-3 py-1.5 bg-[#2a2e39]/50 border border-[#2a2e39] text-blue-400 font-semibold text-sm rounded-lg whitespace-nowrap min-w-[170px] text-center">
                 {visibleDates}
              </div>
              <div className="flex items-center gap-0.5 text-slate-300 text-xs font-bold">
                 {['1M', '3M', '6M', 'YTD', '1Y', 'ALL'].map(range => (
                    <button key={range} onClick={() => applyZoomFilter(range)} className="px-2.5 py-1.5 rounded-lg hover:bg-[#2a2e39] hover:text-white transition">{range}</button>
                 ))}
              </div>
              <div className="ml-1 border-l border-[#2a2e39] pl-2">
                 <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="bg-[#0b0e14] text-blue-400 border border-[#2a2e39] font-bold text-sm rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                    <option value="1D">Daily</option>
                    <option value="1W">Weekly</option>
                    <option value="1M">Monthly</option>
                 </select>
              </div>
           </div>
           
           <div className="flex items-center gap-4 text-sm font-mono font-bold bg-[#0b0e14] px-4 py-1.5 rounded-xl border border-[#2a2e39] whitespace-nowrap">
              <div><span className="text-slate-500">O:</span> <span className="text-white">{ohlcData.o}</span></div>
              <div><span className="text-slate-500">H:</span> <span className="text-emerald-400">{ohlcData.h}</span></div>
              <div><span className="text-slate-500">L:</span> <span className="text-rose-400">{ohlcData.l}</span></div>
              <div><span className="text-slate-500">C:</span> <span className="text-white">{ohlcData.c}</span></div>
              <div className="pl-2 border-l border-[#2a2e39]"><span className={ohlcData.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}>{ohlcData.change}</span></div>
           </div>
        </div>

        {/* DISTRIBUCIÓN PRINCIPAL (Sidebar + Charts) */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 items-start">
          
          {/* SECTOR IZQUIERDO: Selections & Riesgo */}
          <div className="w-full lg:w-[280px] flex flex-col gap-4 flex-shrink-0">
            
            {/* Panel de Selecciones (Koyfin Style) */}
            <div className="bg-[#151922] border border-[#2a2e39] rounded-xl p-3 shadow-xl">
               <h2 className="text-sm font-bold text-white mb-3">Selections</h2>
               <div className="flex flex-col">
                 <SelectionItem label={`${currentTicker} Historical Chart`} colorClass="border-blue-500" state={showMainChart} setState={setShowMainChart} />
                 <SelectionItem label="SMA (200D)" colorClass="border-[#a855f7]" state={showSMA200} setState={setShowSMA200} />
                 <SelectionItem label="SMA (50D)" colorClass="border-[#eab308]" state={showSMA50} setState={setShowSMA50} />
                 <SelectionItem label="EMA (10D)" colorClass="border-[#22c55e]" state={showEMA10} setState={setShowEMA10} />
                 <SelectionItem label="EMA (21D)" colorClass="border-[#f97316]" state={showEMA21} setState={setShowEMA21} />
                 <SelectionItem label="MACD (12, 26, 9)" colorClass="border-[#ef4444]" state={showMACD} setState={setShowMACD} />
                 <SelectionItem label="RSI (14D)" colorClass="border-[#3b82f6]" state={showRSI} setState={setShowRSI} />
               </div>
            </div>

            {/* Panel de Herramientas de Dibujo */}
            <div className="bg-[#151922] border border-[#2a2e39] rounded-xl p-3 shadow-xl flex flex-wrap gap-1.5 justify-center">
              <button onClick={() => setActiveTool("pointer")} className={`p-2 rounded-lg transition ${activeTool === 'pointer' ? 'bg-[#2a2e39] text-blue-400' : 'text-slate-400 hover:bg-[#2a2e39] hover:text-white'}`} title="Puntero"><MousePointer2 className="w-4 h-4" /></button>
              <button onClick={() => setActiveTool("arrow")} className={`p-2 rounded-lg transition ${activeTool === 'arrow' ? 'bg-[#2a2e39] text-blue-400' : 'text-slate-400 hover:bg-[#2a2e39] hover:text-white'}`} title="Flecha directiva"><MoveUpRight className="w-4 h-4" /></button>
              <button onClick={() => setActiveTool("text")} className={`p-2 rounded-lg transition ${activeTool === 'text' ? 'bg-[#2a2e39] text-blue-400' : 'text-slate-400 hover:bg-[#2a2e39] hover:text-white'}`} title="Texto"><Type className="w-4 h-4" /></button>
              <div className="w-px h-6 bg-[#2a2e39] mx-1"></div>
              <button onClick={() => setActiveTool("eraser")} className={`p-2 rounded-lg transition ${activeTool === 'eraser' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50' : 'text-slate-400 hover:bg-[#2a2e39] hover:text-white'}`} title="Borrador"><Eraser className="w-4 h-4" /></button>
              <button onClick={() => setDrawings([])} className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition" title="Limpiar Todo"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>

          {/* SECTOR DERECHO: Charts Apilados Profesionales */}
          <div className="flex-1 flex flex-col gap-1.5 relative w-full h-[700px] bg-[#151922] border border-[#2a2e39] rounded-xl overflow-hidden p-1">
             
             {/* Capa de Dibujo Anclada EXCLUSIVAMENTE al Chart Principal */}
             <div 
                className={`absolute top-1 left-1 right-[50px] z-20 ${showMainChart ? (showMACD && showRSI ? 'h-[50%]' : (!showMACD && !showRSI ? 'h-full' : 'h-[75%]')) : 'hidden'} ${activeTool !== 'pointer' ? (activeTool === 'eraser' ? 'cursor-pointer' : 'cursor-crosshair') : 'pointer-events-none'}`} 
                onMouseDown={handleSVGMouseDown} onMouseMove={handleSVGMouseMove} onMouseUp={handleSVGMouseUp}
             >
               <svg className="w-full h-full pointer-events-auto">
                 {drawings.map(d => {
                   const eraseClasses = activeTool === 'eraser' ? 'cursor-pointer hover:stroke-rose-500 hover:fill-rose-500' : '';
                   if (d.type === 'arrow') {
                     return (
                       <g key={d.id} onClick={(e) => handleDeleteDrawing(e, d.id)} className={eraseClasses}>
                         <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="transparent" strokeWidth="15" />
                         <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#38bdf8" strokeWidth="2" />
                         <polygon points={drawArrowHead(d.x1, d.y1, d.x2, d.y2)} fill="#38bdf8" />
                       </g>
                     );
                   }
                   if (d.type === 'text') {
                     return (
                       <text key={d.id} onClick={(e) => handleDeleteDrawing(e, d.id)} x={d.x} y={d.y} fill="#38bdf8" fontSize="14" fontWeight="bold" className={`bg-[#0b0e14] ${eraseClasses}`}>{d.text}</text>
                     );
                   }
                   return null;
                 })}
                 
                 {isDrawing && startPoint && currentPoint && activeTool === 'arrow' && (
                    <g>
                       <line x1={startPoint.x} y1={startPoint.y} x2={currentPoint.x} y2={currentPoint.y} stroke="#38bdf8" strokeWidth="2" opacity="0.6"/>
                       <polygon points={drawArrowHead(startPoint.x, startPoint.y, currentPoint.x, currentPoint.y)} fill="#38bdf8" opacity="0.6"/>
                    </g>
                 )}
               </svg>
             </div>

             {/* 1. Main Chart (Velas + SMA + Volumen) */}
             <div ref={mainChartContainerRef} className={`w-full relative z-10 ${!showMainChart ? 'hidden' : (showMACD && showRSI ? 'h-[50%]' : (!showMACD && !showRSI ? 'h-full' : 'h-[75%]'))}`}></div>
             
             {/* 2. MACD Chart */}
             {showMACD && <div ref={macdChartContainerRef} className={`w-full relative z-10 border-t border-[#2a2e39] ${showMainChart && showRSI ? 'h-[25%]' : (!showMainChart && !showRSI ? 'h-full' : (showMainChart && !showRSI ? 'h-[25%]' : 'h-[50%]'))}`}></div>}
             
             {/* 3. RSI Chart */}
             {showRSI && <div ref={rsiChartContainerRef} className={`w-full relative z-10 border-t border-[#2a2e39] ${showMainChart && showMACD ? 'h-[25%]' : (!showMainChart && !showMACD ? 'h-full' : (showMainChart && !showMACD ? 'h-[25%]' : 'h-[50%]'))}`}></div>}
             
          </div>

        </div>
      </div>
    </div>
  );
}