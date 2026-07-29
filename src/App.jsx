import React, { useState, useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import { 
  TrendingUp, Calculator, BarChart2, AlertCircle, 
  MousePointer2, Pencil, Type, Ruler, Trash2, Eye, EyeOff, Search, Loader2 
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

export default function App() {
  const [activeMenu, setActiveMenu] = useState(1);
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [currentTicker, setCurrentTicker] = useState("AAPL");
  const [activeTool, setActiveTool] = useState("pointer");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [drawings, setDrawings] = useState([]);

  // Estados de Indicadores
  const [showSMA200, setShowSMA200] = useState(false);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showEMA21, setShowEMA21] = useState(false);
  const [showEMA10, setShowEMA10] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showStochastic, setShowStochastic] = useState(false);

  // OHLC Legend State
  const [ohlcData, setOhlcData] = useState({ o: '-', h: '-', l: '-', c: '-', change: '-' });

  // Inputs de Riesgo
  const [capital, setCapital] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("1,5");
  const [entryPrice, setEntryPrice] = useState("150,00");
  const [stopLoss, setStopLoss] = useState("145,00");
  const [takeProfit, setTakeProfit] = useState("165,00");
  const [shares, setShares] = useState("100");

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  
  const indicatorsRef = useRef({});
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

  // === CONSUMO DE DATOS REALES DESDE LA API SERVERLESS DE VERCEL ===
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
          setChartData(formattedData);
          const lastClose = formattedData[formattedData.length - 1].close;
          setEntryPrice(lastClose.toFixed(2).replace('.', ','));
          setStopLoss((lastClose * 0.97).toFixed(2).replace('.', ','));
          setTakeProfit((lastClose * 1.06).toFixed(2).replace('.', ','));
        }
      } catch (error) {
        console.error("Error al obtener datos reales de la API:", error);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchRealMarketData();
  }, [currentTicker]);

  const handleSearchTicker = (e) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;
    setCurrentTicker(tickerInput.toUpperCase().trim());
  };

  // Inicializar Gráfico con escala de fechas visible abajo
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: 'solid', color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { 
        borderColor: '#1e293b', 
        timeVisible: true,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 480,
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#f43f5e', 
      borderVisible: false, 
      wickUpColor: '#10b981', wickDownColor: '#f43f5e'
    });

    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData.get(series)) {
        const data = param.seriesData.get(series);
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

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || chartData.length === 0) return;
    seriesRef.current.setData(chartData);

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
      if (indicatorsRef.current[key]) {
        chartRef.current.removeSeries(indicatorsRef.current[key]);
      }
    });
    indicatorsRef.current = {};

    const chart = chartRef.current;
    if (showSMA200) {
      const sma200Line = chart.addLineSeries({ color: '#f59e0b', lineWidth: 2, title: 'SMA 200' });
      sma200Line.setData(calculateSMA(chartData, 200));
      indicatorsRef.current.sma200 = sma200Line;
    }
    if (showSMA50) {
      const sma50Line = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'SMA 50' });
      sma50Line.setData(calculateSMA(chartData, 50));
      indicatorsRef.current.sma50 = sma50Line;
    }
    if (showEMA21) {
      const ema21Line = chart.addLineSeries({ color: '#ec4899', lineWidth: 2, title: 'EMA 21' });
      ema21Line.setData(calculateEMA(chartData, 21));
      indicatorsRef.current.ema21 = ema21Line;
    }
    if (showEMA10) {
      const ema10Line = chart.addLineSeries({ color: '#06b6d4', lineWidth: 2, title: 'EMA 10' });
      ema10Line.setData(calculateEMA(chartData, 10));
      indicatorsRef.current.ema10 = ema10Line;
    }
  }, [chartData, showSMA200, showSMA50, showEMA21, showEMA10]);

  useEffect(() => {
    if (!seriesRef.current) return;
    const series = seriesRef.current;

    if (linesRef.current.entry) series.removePriceLine(linesRef.current.entry);
    if (linesRef.current.sl) series.removePriceLine(linesRef.current.sl);
    if (linesRef.current.tp) series.removePriceLine(linesRef.current.tp);

    if (numEntryPrice > 0) {
      linesRef.current.entry = series.createPriceLine({
        price: numEntryPrice, color: '#38bdf8', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'ENTRADA',
      });
    }
    if (numStopLoss > 0) {
      linesRef.current.sl = series.createPriceLine({
        price: numStopLoss, color: '#f43f5e', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'STOP LOSS',
      });
    }
    if (numTakeProfit > 0) {
      linesRef.current.tp = series.createPriceLine({
        price: numTakeProfit, color: '#10b981', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'TAKE PROFIT',
      });
    }
  }, [numEntryPrice, numStopLoss, numTakeProfit]);

  const handleChartClick = (e) => {
    if (activeTool === 'pointer') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'pencil') {
      setDrawings(prev => [...prev, { id: Date.now(), type: 'line', x1: x - 20, y1: y, x2: x + 40, y2: y - 20 }]);
    } else if (activeTool === 'text') {
      const textVal = prompt("Ingrese el texto:", "Zona de interés");
      if (textVal) setDrawings(prev => [...prev, { id: Date.now(), type: 'text', x, y, text: textVal }]);
    } else if (activeTool === 'ruler') {
      setDrawings(prev => [...prev, { id: Date.now(), type: 'ruler', x1: x, y1: y, x2: x + 60, y2: y - 60 }]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* ENCABEZADO */}
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

        {/* PANEL DE INDICADORES TÉCNICOS */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-medium text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Indicadores:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setShowSMA200(!showSMA200)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${showSMA200 ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showSMA200 ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>} SMA 200
            </button>
            <button onClick={() => setShowSMA50(!showSMA50)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${showSMA50 ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showSMA50 ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>} SMA 50
            </button>
            <button onClick={() => setShowEMA21(!showEMA21)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${showEMA21 ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showEMA21 ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>} EMA 21
            </button>
            <button onClick={() => setShowEMA10(!showEMA10)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${showEMA10 ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showEMA10 ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>} EMA 10
            </button>
            <div className="w-px h-4 bg-slate-800 mx-1"></div>
            <button onClick={() => setShowRSI(!showRSI)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${showRSI ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showRSI ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>} RSI
            </button>
            <button onClick={() => setShowMACD(!showMACD)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${showMACD ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showMACD ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>} MACD
            </button>
            <button onClick={() => setShowStochastic(!showStochastic)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${showStochastic ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showStochastic ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>} Stochastic
            </button>
          </div>
        </div>

        {/* DISTRIBUCIÓN PRINCIPAL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* SECTOR IZQUIERDO */}
          <div className="lg:col-span-4 space-y-4">
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
                      <label className="block text-xs font-medium text-blue-400 mb-1">Precio Entrada</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(entryPrice)} onChange={handleNumberChange(setEntryPrice)} className="w-full px-2.5 py-1.5 bg-slate-900 border border-blue-900/50 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-rose-400 mb-1">Stop Loss</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(stopLoss)} onChange={handleNumberChange(setStopLoss)} className="w-full px-2.5 py-1.5 bg-slate-900 border border-rose-900/50 rounded-xl text-rose-100 text-sm focus:ring-2 focus:ring-rose-500" />
                    </div>
                  </div>

                  {activeMenu === 1 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-emerald-400 mb-1">Take Profit</label>
                        <input type="text" inputMode="decimal" value={formatInputDisplay(takeProfit)} onChange={handleNumberChange(setTakeProfit)} className="w-full px-2.5 py-1.5 bg-slate-900 border border-emerald-900/50 rounded-xl text-emerald-100 text-sm focus:ring-2 focus:ring-emerald-500" />
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

            {!isInvalidLong && activeMenu === 2 && (
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-900 border border-emerald-800 rounded-2xl p-5 shadow-xl">
                <p className="text-emerald-100 text-xs font-medium mb-1">Acciones a Comprar</p>
                <h3 className="text-4xl font-bold text-white">{formatInputDisplay(Math.floor(numCapital * (numRiskPercent/100) / (numEntryPrice - numStopLoss)))}</h3>
                <p className="text-emerald-100/70 text-xs mt-2">Arriesgando exactamente ${formatCurrency(numCapital * (numRiskPercent/100))} USD.</p>
              </div>
            )}

            {isInvalidLong && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="text-rose-400 flex-shrink-0 mt-0.5 w-4 h-4" />
                <div><h3 className="text-rose-400 font-semibold text-xs">Error</h3><p className="text-xs text-rose-300/80">Entrada debe ser mayor a Stop Loss.</p></div>
              </div>
            )}
          </div>

          {/* SECTOR DERECHO: Gráfico con fechas visibles abajo */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-2 flex flex-col md:flex-row shadow-2xl relative overflow-hidden">
            <div className="flex md:flex-col gap-1.5 p-2 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/50 items-center justify-start z-20">
              <button onClick={() => setActiveTool("pointer")} className={`p-2 rounded-lg transition ${activeTool === 'pointer' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Puntero"><MousePointer2 className="w-4 h-4" /></button>
              <button onClick={() => setActiveTool("pencil")} className={`p-2 rounded-lg transition ${activeTool === 'pencil' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Línea de Tendencia"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => setActiveTool("text")} className={`p-2 rounded-lg transition ${activeTool === 'text' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Texto"><Type className="w-4 h-4" /></button>
              <button onClick={() => setActiveTool("ruler")} className={`p-2 rounded-lg transition ${activeTool === 'ruler' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Medir Rango"><Ruler className="w-4 h-4" /></button>
              <div className="w-px h-5 md:w-5 md:h-px bg-slate-700 my-1"></div>
              <button onClick={() => setDrawings([])} className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition" title="Limpiar dibujos"><Trash2 className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 p-2 md:p-3 min-h-[500px] relative flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 z-20 relative">
                <form onSubmit={handleSearchTicker} className="flex items-center gap-1.5">
                  <div className="relative">
                    <input 
                       type="text" 
                       value={tickerInput}
                       onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                       className="bg-slate-950 border border-slate-700 text-white font-bold text-xs px-2.5 py-1.5 pl-7 rounded-xl w-28 focus:ring-2 focus:ring-emerald-500 uppercase tracking-wider"
                       placeholder="AAPL"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
                  </div>
                  <button type="submit" disabled={isLoadingData} className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1">
                    {isLoadingData && <Loader2 className="w-3 h-3 animate-spin" />} Cargar
                  </button>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                    {currentTicker}
                  </span>
                </form>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                  <div><span className="text-slate-500">O:</span> <span className="text-white">{ohlcData.o}</span></div>
                  <div><span className="text-slate-500">H:</span> <span className="text-emerald-400">{ohlcData.h}</span></div>
                  <div><span className="text-slate-500">L:</span> <span className="text-rose-400">{ohlcData.l}</span></div>
                  <div><span className="text-slate-500">C:</span> <span className="text-white">{ohlcData.c}</span></div>
                  <div className="pl-1.5 border-l border-slate-800"><span className={ohlcData.change.startsWith('+') ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{ohlcData.change}</span></div>
                </div>
              </div>

              <div className="absolute inset-0 z-10 pointer-events-none">
                <svg className="w-full h-full">
                  {drawings.map(d => {
                    if (d.type === 'line' || d.type === 'ruler') {
                      return (
                        <g key={d.id}>
                          <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#38bdf8" strokeWidth="2" strokeDasharray="4" />
                          <circle cx={d.x1} cy={d.y1} r="3" fill="#38bdf8" />
                          <circle cx={d.x2} cy={d.y2} r="3" fill="#38bdf8" />
                        </g>
                      );
                    }
                    if (d.type === 'text') {
                      return (
                        <text key={d.id} x={d.x} y={d.y} fill="#38bdf8" fontSize="11" fontWeight="bold">
                          {d.text}
                        </text>
                      );
                    }
                    return null;
                  })}
                </svg>
              </div>

              {/* Contenedor del Gráfico con altura optimizada para mostrar el eje X de fechas */}
              <div ref={chartContainerRef} onClick={handleChartClick} className={`w-full h-[440px] ${activeTool !== 'pointer' ? 'cursor-pointer' : 'cursor-crosshair'}`}></div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}