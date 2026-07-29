import React, { useState, useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import { 
  TrendingUp, Calculator, BarChart2, AlertCircle, 
  MousePointer2, Type, Trash2, Eye, EyeOff, Search, Loader2, Eraser, MoveUpRight
} from 'lucide-react';

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

// --- ALGORITMOS DE AGRUPACIÓN DE TIEMPO (Timeframes) ---
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
      current = { time: key, open: d.open, high: d.high, low: d.low, close: d.close };
    } else {
      current.high = Math.max(current.high, d.high);
      current.low = Math.min(current.low, d.low);
      current.close = d.close;
    }
  });
  if (current) aggregated.push(current);
  return aggregated;
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
  
  // Dibujo interactivo
  const [activeTool, setActiveTool] = useState("pointer");
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoint, setCurrentPoint] = useState(null);
  const [drawings, setDrawings] = useState([]);
  
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [rawChartData, setRawChartData] = useState([]); 
  const [chartData, setChartData] = useState([]); 

  // Indicadores
  const [showSMA200, setShowSMA200] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showEMA10, setShowEMA10] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const hasOscillators = showRSI || showMACD;

  const [ohlcData, setOhlcData] = useState({ o: '-', h: '-', l: '-', c: '-', change: '-' });

  const [capital, setCapital] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("1,5");
  const [entryPrice, setEntryPrice] = useState("150,00");
  const [stopLoss, setStopLoss] = useState("145,00");
  const [takeProfit, setTakeProfit] = useState("165,00");
  const [shares, setShares] = useState("100");

  const mainChartContainerRef = useRef(null);
  const oscChartContainerRef = useRef(null);
  const mainChartRef = useRef(null);
  const oscChartRef = useRef(null);
  const mainSeriesRef = useRef(null);
  
  const indicatorsRef = useRef({});
  const oscSeriesRef = useRef({});
  const linesRef = useRef({});

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

        const formattedData = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (quotes.open[i] !== null && quotes.high[i] !== null && quotes.low[i] !== null && quotes.close[i] !== null) {
            const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
            formattedData.push({
              time: dateStr,
              open: parseFloat(quotes.open[i].toFixed(2)),
              high: parseFloat(quotes.high[i].toFixed(2)),
              low: parseFloat(quotes.low[i].toFixed(2)),
              close: parseFloat(quotes.close[i].toFixed(2))
            });
          }
        }

        if (formattedData.length > 0) {
          setRawChartData(formattedData);
          const lastClose = formattedData[formattedData.length - 1].close;
          setEntryPrice(lastClose.toFixed(2).replace('.', ','));
          setStopLoss((lastClose * 0.97).toFixed(2).replace('.', ','));
          setTakeProfit((lastClose * 1.06).toFixed(2).replace('.', ','));
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
    if (!mainChartRef.current || chartData.length === 0) return;
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
    
    mainChartRef.current.timeScale().setVisibleRange({
      from: startDate.toISOString().split('T')[0],
      to: lastDate.toISOString().split('T')[0]
    });
  };

  useEffect(() => {
    if (!mainChartContainerRef.current) return;

    const chartOptions = {
      layout: { background: { type: 'solid', color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { 
        borderColor: '#1e293b', 
        timeVisible: true,
        rightOffset: 12, 
      },
    };

    const mainChart = createChart(mainChartContainerRef.current, chartOptions);
    const mainSeries = mainChart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#f43f5e', 
      borderVisible: false, 
      wickUpColor: '#10b981', wickDownColor: '#f43f5e',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
    });

    mainChartRef.current = mainChart;
    mainSeriesRef.current = mainSeries;

    mainChart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData.get(mainSeries)) {
        const data = param.seriesData.get(mainSeries);
        const diff = data.close - data.open;
        const pct = (diff / data.open) * 100;
        setOhlcData({
          o: formatCurrency(data.open),
          h: formatCurrency(data.high),
          l: formatCurrency(data.low),
          c: formatCurrency(data.close),
          change: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct.toFixed(2)}%)`
        });
      }
    });

    mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range && range.from && range.to) {
        const start = new Date(range.from * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const end = new Date(range.to * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        setVisibleDates(`${start} - ${end}`);
        
        // Evita el crash "Value is null" asegurando que range sea válido antes de setearlo
        if (oscChartRef.current) oscChartRef.current.timeScale().setVisibleRange(range);
      }
    });

    let oscChart = null;
    if (oscChartContainerRef.current) {
      oscChart = createChart(oscChartContainerRef.current, {
        ...chartOptions,
        crosshair: { mode: 0 },
      });
      oscChartRef.current = oscChart;

      oscChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if(range && mainChartRef.current) mainChartRef.current.timeScale().setVisibleRange(range);
      });
    }

    const handleResize = () => {
      if (mainChartContainerRef.current) mainChart.applyOptions({ width: mainChartContainerRef.current.clientWidth });
      if (oscChartContainerRef.current && oscChart) oscChart.applyOptions({ width: oscChartContainerRef.current.clientWidth });
    };
    
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 50);

    return () => {
      window.removeEventListener('resize', handleResize);
      mainChart.remove();
      if(oscChart) oscChart.remove();
    };
  }, [hasOscillators]); 

  useEffect(() => {
    if (!mainSeriesRef.current || chartData.length === 0) return;
    
    mainSeriesRef.current.setData(chartData);
    mainSeriesRef.current.applyOptions({
        title: currentTicker,
        priceLineVisible: false
    });

    const last = chartData[chartData.length - 1];
    if (last) {
      const diff = last.close - last.open;
      const pct = (diff / last.open) * 100;
      setOhlcData({
        o: formatCurrency(last.open),
        h: formatCurrency(last.high),
        l: formatCurrency(last.low),
        c: formatCurrency(last.close),
        change: `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct.toFixed(2)}%)`
      });
    }

    Object.keys(indicatorsRef.current).forEach(key => {
      if (indicatorsRef.current[key] && mainChartRef.current) {
        mainChartRef.current.removeSeries(indicatorsRef.current[key]);
      }
    });
    indicatorsRef.current = {};

    Object.keys(oscSeriesRef.current).forEach(key => {
      if (oscSeriesRef.current[key] && oscChartRef.current) {
        oscChartRef.current.removeSeries(oscSeriesRef.current[key]);
      }
    });
    oscSeriesRef.current = {};

    // Estilos requeridos (Colores sólidos y etiquetas vistosas a la derecha)
    if (showSMA200) {
      const line = mainChartRef.current.addLineSeries({ color: '#a855f7', lineWidth: 2, lineStyle: 0, title: 'SMA (200D)' });
      line.setData(calculateSMA(chartData, 200));
      indicatorsRef.current.sma200 = line;
    }
    if (showSMA50) {
      const line = mainChartRef.current.addLineSeries({ color: '#eab308', lineWidth: 2, lineStyle: 0, title: 'SMA (50D)' });
      line.setData(calculateSMA(chartData, 50));
      indicatorsRef.current.sma50 = line;
    }
    if (showEMA21) {
      const line = mainChartRef.current.addLineSeries({ color: '#f97316', lineWidth: 2, lineStyle: 0, title: 'EMA (21D)' });
      line.setData(calculateEMA(chartData, 21));
      indicatorsRef.current.ema21 = line;
    }
    if (showEMA10) {
      const line = mainChartRef.current.addLineSeries({ color: '#22c55e', lineWidth: 2, lineStyle: 0, title: 'EMA (10D)' });
      line.setData(calculateEMA(chartData, 10));
      indicatorsRef.current.ema10 = line;
    }

    if (oscChartRef.current) {
      if (showRSI) {
        const line = oscChartRef.current.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'RSI (14D)' });
        line.setData(calculateRSI(chartData, 14));
        oscSeriesRef.current.rsi = line;
      }
      if (showMACD) {
        const line = oscChartRef.current.addLineSeries({ color: '#ef4444', lineWidth: 2, title: 'MACD' });
        line.setData(calculateMACD(chartData));
        oscSeriesRef.current.macd = line;
      }
    }
  }, [chartData, showSMA200, showSMA50, showEMA21, showEMA10, showRSI, showMACD, hasOscillators, currentTicker]);

  useEffect(() => {
    if (!mainSeriesRef.current) return;
    const series = mainSeriesRef.current;

    if (linesRef.current.entry) series.removePriceLine(linesRef.current.entry);
    if (linesRef.current.sl) series.removePriceLine(linesRef.current.sl);
    if (linesRef.current.tp) series.removePriceLine(linesRef.current.tp);

    // Diseño Koyfin de etiquetas a la derecha, sin texto intrusivo en el gráfico
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

  // --- LÓGICA DE HERRAMIENTAS DE DIBUJO ---
  const handleSVGMouseDown = (e) => {
    if (activeTool === 'pointer' || activeTool === 'eraser') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setStartPoint({ x, y });
    setCurrentPoint({ x, y });
  };

  const handleSVGMouseMove = (e) => {
    if (!isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCurrentPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleSVGMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (activeTool === 'arrow') {
      if(startPoint && currentPoint) {
        setDrawings(prev => [...prev, { id: Date.now(), type: 'arrow', x1: startPoint.x, y1: startPoint.y, x2: currentPoint.x, y2: currentPoint.y }]);
      }
    } else if (activeTool === 'text' && currentPoint) {
      const textVal = prompt("Ingrese el texto:", "Texto");
      if (textVal) {
        setDrawings(prev => [...prev, { id: Date.now(), type: 'text', x: currentPoint.x, y: currentPoint.y, text: textVal }]);
      }
    }
    setStartPoint(null);
    setCurrentPoint(null);
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
    const px1 = x2 - headlen * Math.cos(angle - Math.PI / 6);
    const py1 = y2 - headlen * Math.sin(angle - Math.PI / 6);
    const px2 = x2 - headlen * Math.cos(angle + Math.PI / 6);
    const py2 = y2 - headlen * Math.sin(angle + Math.PI / 6);
    return `${x2},${y2} ${px1},${py1} ${px2},${py2}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6 font-sans selection:bg-emerald-500/30">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
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

        {/* DISTRIBUCIÓN PRINCIPAL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* SECTOR IZQUIERDO */}
          <div className="lg:col-span-3 space-y-4">
            
            {/* PANEL DE INDICADORES TÉCNICOS (Compacto a la izquierda) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
               <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Indicadores</h2>
               <div className="grid grid-cols-2 gap-2">
                 <button onClick={() => setShowSMA200(!showSMA200)} className={`px-2 py-1.5 rounded-lg text-xs font-bold transition ${showSMA200 ? 'bg-[#a855f7]/20 border border-[#a855f7]/50 text-[#a855f7]' : 'bg-slate-950 border border-slate-800 text-slate-500'}`}>SMA 200</button>
                 <button onClick={() => setShowSMA50(!showSMA50)} className={`px-2 py-1.5 rounded-lg text-xs font-bold transition ${showSMA50 ? 'bg-[#eab308]/20 border border-[#eab308]/50 text-[#eab308]' : 'bg-slate-950 border border-slate-800 text-slate-500'}`}>SMA 50</button>
                 <button onClick={() => setShowEMA21(!showEMA21)} className={`px-2 py-1.5 rounded-lg text-xs font-bold transition ${showEMA21 ? 'bg-[#f97316]/20 border border-[#f97316]/50 text-[#f97316]' : 'bg-slate-950 border border-slate-800 text-slate-500'}`}>EMA 21</button>
                 <button onClick={() => setShowEMA10(!showEMA10)} className={`px-2 py-1.5 rounded-lg text-xs font-bold transition ${showEMA10 ? 'bg-[#22c55e]/20 border border-[#22c55e]/50 text-[#22c55e]' : 'bg-slate-950 border border-slate-800 text-slate-500'}`}>EMA 10</button>
                 <button onClick={() => setShowRSI(!showRSI)} className={`px-2 py-1.5 rounded-lg text-xs font-bold transition ${showRSI ? 'bg-[#3b82f6]/20 border border-[#3b82f6]/50 text-[#3b82f6]' : 'bg-slate-950 border border-slate-800 text-slate-500'}`}>RSI</button>
                 <button onClick={() => setShowMACD(!showMACD)} className={`px-2 py-1.5 rounded-lg text-xs font-bold transition ${showMACD ? 'bg-[#ef4444]/20 border border-[#ef4444]/50 text-[#ef4444]' : 'bg-slate-950 border border-slate-800 text-slate-500'}`}>MACD</button>
               </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Parámetros de Riesgo</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Capital (USD)</label>
                    <input type="text" inputMode="decimal" value={formatInputDisplay(capital)} onChange={handleNumberChange(setCapital)} className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Riesgo %</label>
                    <div className="relative">
                      <input type="text" inputMode="decimal" value={formatInputDisplay(riskPercent)} onChange={handleNumberChange(setRiskPercent)} className="w-full pl-3 pr-6 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-emerald-500" />
                      <div className="absolute right-2.5 top-2 text-slate-500 text-xs pointer-events-none">%</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#3b82f6] mb-1">Precio Entrada</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(entryPrice)} onChange={handleNumberChange(setEntryPrice)} className="w-full px-2.5 py-1.5 bg-slate-900 border border-blue-900/50 rounded-xl text-white text-sm focus:ring-2 focus:ring-[#3b82f6]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#ef4444] mb-1">Stop Loss</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(stopLoss)} onChange={handleNumberChange(setStopLoss)} className="w-full px-2.5 py-1.5 bg-slate-900 border border-rose-900/50 rounded-xl text-rose-100 text-sm focus:ring-2 focus:ring-[#ef4444]" />
                    </div>
                  </div>

                  {activeMenu === 1 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#10b981] mb-1">Take Profit</label>
                        <input type="text" inputMode="decimal" value={formatInputDisplay(takeProfit)} onChange={handleNumberChange(setTakeProfit)} className="w-full px-2.5 py-1.5 bg-slate-900 border border-emerald-900/50 rounded-xl text-emerald-100 text-sm focus:ring-2 focus:ring-[#10b981]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Acciones</label>
                        <input type="text" inputMode="numeric" value={formatInputDisplay(shares)} onChange={handleNumberChange(setShares)} className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-emerald-500" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!isInvalidLong && activeMenu === 1 && (
              <div className="space-y-3">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 border-l-4 border-l-rose-500 shadow-lg">
                  <p className="text-slate-400 text-xs mb-1">Pérdida Máxima (Riesgo)</p>
                  <h4 className="text-2xl font-bold text-rose-100">${formatCurrency(m1_totalRisk)}</h4>
                  <p className="text-xs text-rose-400/80 mt-1">Equivale al {formatCurrency(m1_actualRiskPercent)}% del capital</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 border-l-4 border-l-emerald-500 shadow-lg">
                  <p className="text-slate-400 text-xs mb-1">Ganancia Proyectada (TP)</p>
                  <h4 className="text-2xl font-bold text-emerald-100">${formatCurrency(m1_projectedProfit)}</h4>
                </div>
              </div>
            )}
          </div>

          {/* SECTOR DERECHO: Chart Profesional Unificado */}
          <div className="lg:col-span-9 flex flex-col gap-2">
            
            {/* Cabecera Superior: Koyfin Style Date Selector & Leyenda OHLC */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-2.5 rounded-2xl">
               
               <div className="flex items-center gap-3 overflow-x-auto pb-1 xl:pb-0 hide-scrollbar">
                  {/* Buscador Integrado */}
                  <form onSubmit={handleSearchTicker} className="flex items-center">
                    <div className="relative">
                      <input type="text" value={tickerInput} onChange={(e) => setTickerInput(e.target.value.toUpperCase())} className="bg-slate-950 border border-slate-700 text-white font-bold text-sm px-3 py-1.5 pl-8 rounded-lg w-28 focus:ring-1 focus:ring-blue-500 uppercase tracking-wider" placeholder="AAPL" />
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                    </div>
                  </form>

                  {/* Koyfin Date Filter */}
                  <div className="px-3 py-1.5 bg-slate-950 border border-slate-700 text-blue-500 font-semibold text-sm rounded-lg whitespace-nowrap min-w-[170px] text-center">
                     {visibleDates}
                  </div>
                  <div className="flex items-center gap-1 text-slate-300 text-xs font-bold">
                     {['1M', '3M', '6M', 'YTD', '1Y', 'ALL'].map(range => (
                        <button key={range} onClick={() => applyZoomFilter(range)} className="px-2 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition">{range}</button>
                     ))}
                  </div>
                  <div className="ml-1 border-l border-slate-700 pl-2">
                     <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="bg-slate-950 text-blue-500 border border-slate-700 font-bold text-sm rounded-lg px-2 py-1.5 focus:ring-0 cursor-pointer">
                        <option value="1D">Daily</option>
                        <option value="1W">Weekly</option>
                        <option value="1M">Monthly</option>
                     </select>
                  </div>
               </div>

               {/* Leyenda OHLC Arriba */}
               <div className="flex items-center gap-4 text-sm font-mono font-bold bg-slate-950 px-4 py-1.5 rounded-xl border border-slate-800 whitespace-nowrap">
                  <div><span className="text-slate-500">O:</span> <span className="text-white">{ohlcData.o}</span></div>
                  <div><span className="text-slate-500">H:</span> <span className="text-emerald-400">{ohlcData.h}</span></div>
                  <div><span className="text-slate-500">L:</span> <span className="text-rose-400">{ohlcData.l}</span></div>
                  <div><span className="text-slate-500">C:</span> <span className="text-white">{ohlcData.c}</span></div>
                  <div className="pl-2 border-l border-slate-700"><span className={ohlcData.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}>{ohlcData.change}</span></div>
               </div>
            </div>

            {/* Contenedor del Gráfico y Herramientas */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-2 flex shadow-2xl relative overflow-hidden">
               {/* Barra de herramientas */}
               <div className="flex flex-col gap-1.5 p-2 border-r border-slate-800 bg-slate-900/50 items-center justify-start z-30">
                 <button onClick={() => setActiveTool("pointer")} className={`p-2 rounded-lg transition ${activeTool === 'pointer' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Puntero"><MousePointer2 className="w-4 h-4" /></button>
                 <button onClick={() => setActiveTool("arrow")} className={`p-2 rounded-lg transition ${activeTool === 'arrow' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Flecha directiva"><MoveUpRight className="w-4 h-4" /></button>
                 <button onClick={() => setActiveTool("text")} className={`p-2 rounded-lg transition ${activeTool === 'text' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Texto"><Type className="w-4 h-4" /></button>
                 <div className="w-5 h-px bg-slate-700 my-1"></div>
                 <button onClick={() => setActiveTool("eraser")} className={`p-2 rounded-lg transition ${activeTool === 'eraser' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Borrar uno por uno"><Eraser className="w-4 h-4" /></button>
                 <button onClick={() => setDrawings([])} className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition" title="Limpiar Todo"><Trash2 className="w-4 h-4" /></button>
               </div>

               <div className="flex-1 flex flex-col relative bg-slate-950 rounded-2xl ml-2 overflow-hidden border border-slate-800">
                 
                 {/* Capa SVG para Dibujos */}
                 <div 
                    className={`absolute inset-0 z-20 ${activeTool !== 'pointer' ? (activeTool === 'eraser' ? 'cursor-pointer' : 'cursor-crosshair') : 'pointer-events-none'}`} 
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
                           <text key={d.id} onClick={(e) => handleDeleteDrawing(e, d.id)} x={d.x} y={d.y} fill="#38bdf8" fontSize="14" fontWeight="bold" className={`bg-slate-900 ${eraseClasses}`}>
                             {d.text}
                           </text>
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

                 {/* Contenedores de Gráficos */}
                 <div className="flex flex-col h-[550px] w-full relative z-10 pointer-events-auto">
                   <div ref={mainChartContainerRef} className={`w-full ${hasOscillators ? 'h-[70%] border-b border-slate-800' : 'h-full'}`}></div>
                   {hasOscillators && (
                      <div ref={oscChartContainerRef} className="w-full h-[30%]"></div>
                   )}
                 </div>

               </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}