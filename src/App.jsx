import React, { useState, useEffect, useRef } from 'react';
import { createChart, LineStyle } from 'lightweight-charts';
import { 
  TrendingUp, Calculator, BarChart2, Search, Loader2, 
  MousePointer2, Pencil, Type, Ruler, Trash2, Eraser 
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
  
  // Dibujos e interacción
  const [drawings, setDrawings] = useState([]);
  const [currentDrawing, setCurrentDrawing] = useState(null);
  const [trendLineColor, setTrendLineColor] = useState("#38bdf8"); 
  const [draggingTextId, setDraggingTextId] = useState(null); 
  const [chartSync, setChartSync] = useState(0); 

  // Estados de Indicadores
  const [showSMA200, setShowSMA200] = useState(false);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showEMA21, setShowEMA21] = useState(false);
  const [showEMA10, setShowEMA10] = useState(false);

  // Tooltip flotante
  const [tooltipData, setTooltipData] = useState(null);

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

  const handleSearchTicker = (e) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;
    setCurrentTicker(tickerInput.toUpperCase().trim());
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
          setChartData(formattedData);
          const lastClose = formattedData[formattedData.length - 1].close;
          setEntryPrice(lastClose.toFixed(2).replace('.', ','));
          setStopLoss((lastClose * 0.97).toFixed(2).replace('.', ','));
          setTakeProfit((lastClose * 1.06).toFixed(2).replace('.', ','));
        }
      } catch (error) {
        console.error("Error API:", error);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchRealMarketData();
  }, [currentTicker]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: 'solid', color: '#090d16' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#111827' }, horzLines: { color: '#111827' } },
      crosshair: { 
        mode: 0, 
        vertLine: { color: '#38bdf8', width: 1, style: LineStyle.Dasched, labelBackgroundColor: '#0284c7' },
        horzLine: { color: '#38bdf8', width: 1, style: LineStyle.Dasched, labelBackgroundColor: '#0284c7' }
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

      // SOLUCIÓN 3: Recuperamos los cálculos de las Medias Móviles para el Tooltip
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
        ma: calcValues // Se inyectan en el estado del Tooltip
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
          try { chart.removeSeries(indicatorsRef.current[key]); } catch (e) {}
          delete indicatorsRef.current[key];
        }
      }
    };
    syncSeries('sma200', showSMA200, calculateSMA(chartData, 200), '#f59e0b');
    syncSeries('sma50', showSMA50, calculateSMA(chartData, 50), '#3b82f6');
    syncSeries('ema21', showEMA21, calculateEMA(chartData, 21), '#ec4899');
    syncSeries('ema10', showEMA10, calculateEMA(chartData, 10), '#06b6d4');
  }, [chartData, showSMA200, showSMA50, showEMA21, showEMA10]);

  const handleMouseDown = (e) => {
    if (activeTool === 'pointer' || activeTool === 'eraser' || activeTool === 'text') return;
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
    
    const logical = chartRef.current.timeScale().coordinateToLogical(x);
    const price = seriesRef.current.coordinateToPrice(y);

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
          <circle cx={x1} cy={y1} r="3" fill={d.color || '#38bdf8'} />
          <circle cx={x2} cy={y2} r="3" fill={d.color || '#38bdf8'} />
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
          <circle cx={x1} cy={y1} r="3" fill={rColor} />
          <circle cx={x2} cy={y2} r="3" fill={rColor} />
          <rect x={midX - 30} y={midY - 12} width="60" height="20" rx="4" fill="#0f172a" stroke={rColor} strokeWidth="1" />
          <text x={midX} y={midY + 2} fill={rColor} fontSize="10" fontWeight="bold" textAnchor="middle">
            {pctDiff >= 0 ? '+' : ''}{pctDiff.toFixed(2)}%
          </text>
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
          // SOLUCIÓN 1: Evento de Doble Clic para editar
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

        {/* DISTRIBUCIÓN PRINCIPAL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* SECTOR IZQUIERDO */}
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
                  {activeMenu === 1 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-emerald-400 mb-1">Take Profit</label>
                        <input type="text" inputMode="decimal" value={formatInputDisplay(takeProfit)} onChange={handleNumberChange(setTakeProfit)} className="w-full px-2 py-1.5 bg-slate-900 border border-emerald-900/50 rounded-xl text-emerald-100 text-sm focus:ring-2 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1">Acciones</label>
                        <input type="text" inputMode="numeric" value={formatInputDisplay(shares)} onChange={handleNumberChange(setShares)} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-emerald-500" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!isInvalidLong && activeMenu === 1 && (
              <div className="space-y-3">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 border-l-4 border-l-rose-500 shadow-lg">
                  <p className="text-slate-400 text-xs mb-1">Pérdida Máxima</p>
                  <h4 className="text-2xl font-bold text-rose-100">${formatCurrency(m1_totalRisk)}</h4>
                  <p className="text-[10px] text-rose-400/80 mt-1">{formatCurrency(m1_actualRiskPercent)}% del capital</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 border-l-4 border-l-emerald-500 shadow-lg">
                  <p className="text-slate-400 text-xs mb-1">Ganancia Proyectada</p>
                  <h4 className="text-2xl font-bold text-emerald-100">${formatCurrency(m1_projectedProfit)}</h4>
                </div>
              </div>
            )}
          </div>

          {/* SECTOR DERECHO */}
          <div className="lg:col-span-9 bg-slate-950 border border-slate-800/80 rounded-3xl p-3 shadow-2xl relative flex flex-col">
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2.5 mb-2 bg-slate-900/40 border border-slate-800/60 rounded-2xl z-20">
              <form onSubmit={handleSearchTicker} className="flex items-center gap-2">
                <div className="relative">
                  <input 
                     type="text" value={tickerInput} onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                     className="bg-slate-950 border border-slate-700 text-white font-bold text-xs px-2.5 py-1.5 pl-7 rounded-xl w-24 focus:ring-2 focus:ring-emerald-500 uppercase tracking-wider" placeholder="AAPL"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
                </div>
                <button type="submit" disabled={isLoadingData} className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1">
                  {isLoadingData && <Loader2 className="w-3 h-3 animate-spin" />} Cargar
                </button>
              </form>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => setShowSMA200(!showSMA200)} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${showSMA200 ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>SMA 200</button>
                <button onClick={() => setShowSMA50(!showSMA50)} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${showSMA50 ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>SMA 50</button>
                {/* SOLUCIÓN 2: Regresan los botones de las Medias Exponenciales (EMA) */}
                <button onClick={() => setShowEMA21(!showEMA21)} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${showEMA21 ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>EMA 21</button>
                <button onClick={() => setShowEMA10(!showEMA10)} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${showEMA10 ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>EMA 10</button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row relative">
              <div className="flex md:flex-col gap-1.5 p-2 border-b md:border-b-0 md:border-r border-slate-800/60 bg-slate-900/30 items-center justify-start z-20 overflow-x-auto">
                <button onClick={() => setActiveTool("pointer")} className={`p-2 rounded-lg transition ${activeTool === 'pointer' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Puntero"><MousePointer2 className="w-4 h-4" /></button>
                
                <div className={`flex items-center gap-1 p-1 rounded-lg transition ${activeTool === 'pencil' ? 'bg-slate-800' : 'hover:bg-slate-700'}`}>
                  <button onClick={() => setActiveTool("pencil")} className={`p-1 transition ${activeTool === 'pencil' ? 'text-emerald-400' : 'text-slate-400 hover:text-white'}`} title="Línea de Tendencia"><Pencil className="w-4 h-4" /></button>
                  {activeTool === 'pencil' && (
                    <input type="color" value={trendLineColor} onChange={(e) => setTrendLineColor(e.target.value)} className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0" title="Color de la línea" />
                  )}
                </div>
                
                <button onClick={() => setActiveTool("text")} className={`p-2 rounded-lg transition ${activeTool === 'text' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Texto"><Type className="w-4 h-4" /></button>
                <button onClick={() => setActiveTool("ruler")} className={`p-2 rounded-lg transition ${activeTool === 'ruler' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Medir Rango"><Ruler className="w-4 h-4" /></button>
                <div className="w-px h-5 md:w-5 md:h-px bg-slate-800 my-1 shrink-0"></div>
                <button onClick={() => setActiveTool("eraser")} className={`p-2 rounded-lg transition ${activeTool === 'eraser' ? 'bg-rose-500/20 text-rose-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title="Borrar Selección"><Eraser className="w-4 h-4" /></button>
                <button onClick={() => { setDrawings([]); setCurrentDrawing(null); }} className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition md:mt-auto" title="Limpiar todo"><Trash2 className="w-4 h-4" /></button>
              </div>

              <div className="flex-1 p-1 relative flex gap-3">
                <div className="flex-1 relative">
                  <div 
                    ref={chartContainerRef} 
                    onClick={handleChartClick}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    className={`w-full h-full min-h-[500px] relative ${activeTool === 'pointer' ? 'cursor-default' : 'cursor-crosshair'}`}
                  >
                    {tooltipData && (
                      <div style={{ left: `${Math.min(Math.max(10, tooltipData.x + 15), 450)}px`, top: `${Math.max(10, tooltipData.y - 60)}px` }}
                        className="absolute z-30 pointer-events-none bg-slate-900/95 border border-slate-700/80 rounded-xl p-2.5 shadow-2xl backdrop-blur-md text-[11px] font-mono min-w-[150px]"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5 font-sans font-bold text-white">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>{tooltipData.ticker}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          <div className="text-slate-400">Close</div><div className="text-right text-white font-semibold">{tooltipData.close}</div>
                          <div className="text-slate-400">Open</div><div className="text-right text-white">{tooltipData.open}</div>
                          <div className="text-slate-400">Low</div><div className="text-right text-rose-400">{tooltipData.low}</div>
                          <div className="text-slate-400">High</div><div className="text-right text-emerald-400">{tooltipData.high}</div>
                        </div>
                        <div className={`mt-1.5 pt-1 border-t border-slate-800 text-right font-bold ${tooltipData.isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {tooltipData.change}
                        </div>
                        
                        {/* SOLUCIÓN 3: Bloque visual que muestra las Medias en el Tooltip si están activadas */}
                        {(showSMA200 || showSMA50 || showEMA21 || showEMA10) && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-800 space-y-0.5">
                            {showSMA200 && <div className="flex justify-between text-amber-300"><span>SMA 200:</span> <span>{tooltipData.ma.sma200}</span></div>}
                            {showSMA50 && <div className="flex justify-between text-blue-300"><span>SMA 50:</span> <span>{tooltipData.ma.sma50}</span></div>}
                            {showEMA21 && <div className="flex justify-between text-pink-300"><span>EMA 21:</span> <span>{tooltipData.ma.ema21}</span></div>}
                            {showEMA10 && <div className="flex justify-between text-cyan-300"><span>EMA 10:</span> <span>{tooltipData.ma.ema10}</span></div>}
                          </div>
                        )}

                      </div>
                    )}
                  </div>

                  <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden" onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
                    <svg className="w-full h-full">
                      <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill={trendLineColor} />
                        </marker>
                        <marker id="arrow-up" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#38761D" />
                        </marker>
                        <marker id="arrow-down" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#FF6966" />
                        </marker>
                      </defs>
                      
                      {drawings.map(renderDrawing)}
                      {currentDrawing && renderDrawing(currentDrawing)}
                    </svg>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}