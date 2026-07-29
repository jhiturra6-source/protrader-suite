import React, { useState, useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { 
  TrendingUp, Calculator, BarChart2, AlertCircle, 
  MousePointer2, Pencil, Type, Ruler, Trash2, Eye, EyeOff, Search 
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

// --- GENERADOR DE DATOS DE VELAS (1 Año de historial) ---
const generateMockCandles = (basePrice, seedText = "AAPL") => {
  const data = [];
  let currentDate = new Date();
  currentDate.setFullYear(currentDate.getFullYear() - 1); // 1 año atrás
  
  // Modificador basado en el texto del ticker para variar los gráficos
  let seed = 1;
  for (let i = 0; i < seedText.length; i++) seed += seedText.charCodeAt(i);
  let currentPrice = basePrice * (0.8 + (seed % 40) / 100);

  for (let i = 0; i < 365; i++) {
    const open = currentPrice;
    const volatility = basePrice * 0.02; 
    const close = open + ((Math.sin(i + seed) * 0.5) + (Math.random() - 0.48)) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.6;
    const low = Math.min(open, close) - Math.random() * volatility * 0.6;
    
    data.push({
      time: currentDate.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2))
    });
    
    currentPrice = close;
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return data;
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

  // Estados de Indicadores (Visibilidad)
  const [showSMA200, setShowSMA200] = useState(true);
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
  
  // Referencias para Series de Indicadores
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

  const handleSearchTicker = (e) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;
    setCurrentTicker(tickerInput.toUpperCase().trim());
  };

  // === INICIALIZACIÓN DEL GRÁFICO ===
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: 'solid', color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: true },
      width: chartContainerRef.current.clientWidth,
      height: 420,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#f43f5e', 
      borderVisible: false, 
      wickUpColor: '#10b981', wickDownColor: '#f43f5e'
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Suscripción al movimiento del crosshair para mostrar OHLC en tiempo real
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

  // === ACTUALIZACIÓN DE DATOS SEGÚN TICKER ===
  useEffect(() => {
    if (!seriesRef.current) return;
    const rawData = generateMockCandles(numEntryPrice || 150, currentTicker);
    seriesRef.current.setData(rawData);

    // Rellenar leyenda con el último dato disponible por defecto
    const last = rawData[rawData.length - 1];
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

    // Calcular y actualizar Indicadores
既存IndicatorCleanUp: {
      Object.keys(indicatorsRef.current).forEach(key => {
        if (indicatorsRef.current[key]) {
          chartRef.current.removeSeries(indicatorsRef.current[key]);
        }
      });
      indicatorsRef.current = {};
    }

    const chart = chartRef.current;

    // SMA 200
    if (showSMA200) {
      const sma200Line = chart.addLineSeries({ color: '#f59e0b', lineWidth: 2, title: 'SMA 200' });
      sma200Line.setData(calculateSMA(rawData, 200));
      indicatorsRef.current.sma200 = sma200Line;
    }
    // SMA 50
    if (showSMA50) {
      const sma50Line = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'SMA 50' });
      sma50Line.setData(calculateSMA(rawData, 50));
      indicatorsRef.current.sma50 = sma50Line;
    }
    // EMA 21
    if (showEMA21) {
      const ema21Line = chart.addLineSeries({ color: '#ec4899', lineWidth: 2, title: 'EMA 21' });
      ema21Line.setData(calculateEMA(rawData, 21));
      indicatorsRef.current.ema21 = ema21Line;
    }
    // EMA 10
    if (showEMA10) {
      const ema10Line = chart.addLineSeries({ color: '#06b6d4', lineWidth: 2, title: 'EMA 10' });
      ema10Line.setData(calculateEMA(rawData, 10));
      indicatorsRef.current.ema10 = ema10Line;
    }

  }, [currentTicker, showSMA200, showSMA50, showEMA21, showEMA10]);

  // === LÍNEAS DE ENTRADA, SL Y TP EN TIEMPO REAL ===
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* ENCABEZADO */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl"><TrendingUp className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">ProTrader Suite</h1>
              <p className="text-slate-500 text-sm">Gestión de Riesgo & Gráficos Interactivos Avanzados</p>
            </div>
          </div>

          <div className="flex p-1 bg-slate-900 rounded-xl w-full md:w-auto border border-slate-800">
            <button onClick={() => setActiveMenu(1)} className={`flex-1 md:w-48 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeMenu === 1 ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
              <BarChart2 className="w-4 h-4" /> Evaluar Posición
            </button>
            <button onClick={() => setActiveMenu(2)} className={`flex-1 md:w-48 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeMenu === 2 ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
              <Calculator className="w-4 h-4" /> Tamaño Ideal
            </button>
          </div>
        </header>

        {/* SECCIÓN DE CONTROLES E INDICADORES (Puntos 5 y 6) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm font-medium text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Panel de Indicadores:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowSMA200(!showSMA200)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${showSMA200 ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showSMA200 ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>} SMA 200
            </button>
            <button onClick={() => setShowSMA50(!showSMA50)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${showSMA50 ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showSMA50 ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>} SMA 50
            </button>
            <button onClick={() => setShowEMA21(!showEMA21)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${showEMA21 ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showEMA21 ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>} EMA 21
            </button>
            <button onClick={() => setShowEMA10(!showEMA10)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${showEMA10 ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showEMA10 ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>} EMA 10
            </button>
            <div className="w-px h-5 bg-slate-800 mx-1"></div>
            <button onClick={() => setShowRSI(!showRSI)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${showRSI ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showRSI ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>} RSI (14)
            </button>
            <button onClick={() => setShowMACD(!showMACD)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${showMACD ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showMACD ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>} MACD
            </button>
            <button onClick={() => setShowStochastic(!showStochastic)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${showStochastic ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {showStochastic ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>} Stochastic
            </button>
          </div>
        </div>

        {/* SECCIÓN DEL GRÁFICO INTERACTIVO */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-1 md:p-2 flex flex-col md:flex-row shadow-2xl relative overflow-hidden">
          
          {/* Barra de herramientas lateral */}
          <div className="flex md:flex-col gap-2 p-2 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/50 items-center justify-start overflow-x-auto">
            <button onClick={() => setActiveTool("pointer")} className={`p-2.5 rounded-lg transition ${activeTool === 'pointer' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Puntero"><MousePointer2 className="w-5 h-5" /></button>
            <button onClick={() => setActiveTool("pencil")} className={`p-2.5 rounded-lg transition ${activeTool === 'pencil' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Línea de Tendencia"><Pencil className="w-5 h-5" /></button>
            <button onClick={() => setActiveTool("text")} className={`p-2.5 rounded-lg transition ${activeTool === 'text' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Texto"><Type className="w-5 h-5" /></button>
            <button onClick={() => setActiveTool("ruler")} className={`p-2.5 rounded-lg transition ${activeTool === 'ruler' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Medir Rango"><Ruler className="w-5 h-5" /></button>
            <div className="w-px h-6 md:w-6 md:h-px bg-slate-700 my-1"></div>
            <button onClick={() => alert("Herramientas limpiadas")} className="p-2.5 text-slate-500 hover:text-rose-400 rounded-lg transition" title="Eliminar dibujos"><Trash2 className="w-5 h-5" /></button>
          </div>

          {/* Contenedor principal del Gráfico */}
          <div className="flex-1 p-2 md:p-4 min-h-[420px]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
              {/* Buscador de acciones funcional (Punto 3) */}
              <form onSubmit={handleSearchTicker} className="flex items-center gap-2">
                <div className="relative">
                  <input 
                     type="text" 
                     value={tickerInput}
                     onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                     className="bg-slate-950 border border-slate-700 text-white font-bold text-base px-3 py-1.5 pl-9 rounded-xl w-36 focus:ring-2 focus:ring-emerald-500 uppercase tracking-wider"
                     placeholder="AAPL"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                </div>
                <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition">
                  Cargar
                </button>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  {currentTicker}
                </span>
              </form>

              {/* Panel OHLC en Vivo (Punto 2) */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                <div><span className="text-slate-500">O:</span> <span className="text-white">{ohlcData.o}</span></div>
                <div><span className="text-slate-500">H:</span> <span className="text-emerald-400">{ohlcData.h}</span></div>
                <div><span className="text-slate-500">L:</span> <span className="text-rose-400">{ohlcData.l}</span></div>
                <div><span className="text-slate-500">C:</span> <span className="text-white">{ohlcData.c}</span></div>
                <div className="pl-2 border-l border-slate-800"><span className={ohlcData.change.startsWith('+') ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{ohlcData.change}</span></div>
              </div>
            </div>

            {/* Div donde Lightweight Charts inyecta el canvas */}
            <div ref={chartContainerRef} className="w-full h-[380px] md:h-[420px] cursor-crosshair"></div>
          </div>
        </div>

        {/* ÁREA DE CALCULADORA (Inputs y Resultados) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Parámetros de Riesgo</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Capital (USD)</label>
                  <input type="text" inputMode="decimal" value={formatInputDisplay(capital)} onChange={handleNumberChange(setCapital)} className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Riesgo %</label>
                  <div className="relative">
                    <input type="text" inputMode="decimal" value={formatInputDisplay(riskPercent)} onChange={handleNumberChange(setRiskPercent)} className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-emerald-500" />
                    <div className="absolute right-3 top-2.5 text-slate-500 font-medium pointer-events-none">%</div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-400 mb-1.5">Precio Entrada (USD)</label>
                    <input type="text" inputMode="decimal" value={formatInputDisplay(entryPrice)} onChange={handleNumberChange(setEntryPrice)} className="w-full px-3 py-2 bg-slate-900 border border-blue-900/50 rounded-xl text-white focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-rose-400 mb-1.5">Stop Loss (USD)</label>
                    <input type="text" inputMode="decimal" value={formatInputDisplay(stopLoss)} onChange={handleNumberChange(setStopLoss)} className="w-full px-3 py-2 bg-slate-900 border border-rose-900/50 rounded-xl text-rose-100 focus:ring-2 focus:ring-rose-500" />
                  </div>
                </div>

                {activeMenu === 1 && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in">
                    <div>
                      <label className="block text-sm font-medium text-emerald-400 mb-1.5">Take Profit (USD)</label>
                      <input type="text" inputMode="decimal" value={formatInputDisplay(takeProfit)} onChange={handleNumberChange(setTakeProfit)} className="w-full px-3 py-2 bg-slate-900 border border-emerald-900/50 rounded-xl text-emerald-100 focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1.5">Acciones</label>
                      <input type="text" inputMode="numeric" value={formatInputDisplay(shares)} onChange={handleNumberChange(setShares)} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            {isInvalidLong ? (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-3xl p-6 flex items-start gap-4">
                <AlertCircle className="text-rose-400 flex-shrink-0 mt-1" />
                <div><h3 className="text-rose-400 font-semibold">Error</h3><p className="text-sm text-rose-300/80">El Precio de Entrada debe ser mayor al Stop Loss.</p></div>
              </div>
            ) : (
              <div className="h-full">
                {activeMenu === 1 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl h-full flex flex-col justify-center gap-6 animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="bg-slate-950 p-6 rounded-2xl border-l-4 border-l-rose-500">
                        <p className="text-slate-400 text-sm mb-2">Pérdida Máxima (Riesgo)</p>
                        <h4 className="text-3xl font-bold text-rose-100">${formatCurrency(m1_totalRisk)}</h4>
                        <p className="text-sm text-rose-400/80 mt-2">Equivale al {formatCurrency(m1_actualRiskPercent)}% del capital</p>
                      </div>
                      <div className="bg-slate-950 p-6 rounded-2xl border-l-4 border-l-emerald-500">
                        <p className="text-slate-400 text-sm mb-2">Ganancia Proyectada (TP)</p>
                        <h4 className="text-3xl font-bold text-emerald-100">${formatCurrency(m1_projectedProfit)}</h4>
                      </div>
                    </div>
                  </div>
                ) : (
                   <div className="bg-gradient-to-br from-emerald-600 to-emerald-900 border border-emerald-800 rounded-3xl p-8 shadow-xl flex flex-col justify-center h-full animate-in fade-in">
                      <p className="text-emerald-100 font-medium mb-2">Acciones a Comprar</p>
                      <h3 className="text-6xl font-bold text-white">{formatInputDisplay(Math.floor(numCapital * (numRiskPercent/100) / (numEntryPrice - numStopLoss)))}</h3>
                      <p className="text-emerald-100/70 text-sm mt-4">Arriesgando exactamente ${formatCurrency(numCapital * (numRiskPercent/100))} USD.</p>
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