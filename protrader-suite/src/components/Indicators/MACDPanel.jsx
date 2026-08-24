import React from 'react';

const MACDPanel = ({ data }) => {
  if (!data || !data.macdLine || data.macdLine.length === 0) return null;
  const last = data.macdLine[data.macdLine.length - 1].value;
  const hist = data.histogram[data.histogram.length - 1]?.value || 0;
  const isPos = last >= 0;
  
  return (
    <div className="bg-[#0f1011] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] font-bold text-[#f7f8f8] tracking-wider uppercase">MACD (12, 26, 9)</h3>
        <div className="flex gap-2 text-[10px] font-mono">
          <span className={isPos ? 'text-[#10b981]' : 'text-[#ef4444]'}>MACD: {last.toFixed(2)}</span>
          <span className={hist >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}>HIST: {hist.toFixed(2)}</span>
        </div>
      </div>
      <div className="h-1 bg-[rgba(255,255,255,0.05)] rounded-full relative overflow-hidden">
        <div className={`absolute top-0 bottom-0 w-px bg-[#8a8f98] left-1/2`}></div>
        <div className={`absolute inset-y-0 ${isPos ? 'left-1/2' : 'right-1/2'} ${isPos ? 'bg-[#10b981]/50' : 'bg-[#ef4444]/50'}`} style={{ width: `${Math.min(Math.abs(last) * 5, 50)}%` }}></div>
      </div>
    </div>
  );
};

export default MACDPanel;
