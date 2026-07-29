// --- IMPORTANTE: Sustituye el bloque del gráfico en tu App.jsx por este ---

<div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl p-2 shadow-2xl relative overflow-hidden flex flex-col">
  
  {/* Panel de control superior minimalista */}
  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50">
    <div className="flex items-center gap-4">
      <span className="text-lg font-bold text-white tracking-tight">{currentTicker}</span>
      <div className="flex gap-2">
         {/* Botones de indicadores con diseño compacto */}
         {[ {key:'sma50', label:'SMA 50', color:'text-blue-400'}, {key:'ema21', label:'EMA 21', color:'text-pink-400'} ].map(ind => (
            <button key={ind.key} onClick={() => setShowSMA50(!showSMA50)} className="text-[10px] uppercase font-bold text-slate-500 hover:text-white transition">
              {ind.label}
            </button>
         ))}
      </div>
    </div>
    
    {/* Tooltip de precio flotante (se actualiza dinámicamente) */}
    <div className="flex gap-4 text-xs font-mono text-slate-400">
      <div className="flex gap-1"><span>O:</span><span className="text-white">{ohlcData.o}</span></div>
      <div className="flex gap-1"><span>C:</span><span className={ohlcData.change.includes('+') ? 'text-emerald-400' : 'text-rose-400'}>{ohlcData.c}</span></div>
    </div>
  </div>

  {/* Gráfico principal optimizado */}
  <div className="flex-1 min-h-[500px] relative">
    <div ref={chartContainerRef} className="w-full h-full"></div>
  </div>
</div>