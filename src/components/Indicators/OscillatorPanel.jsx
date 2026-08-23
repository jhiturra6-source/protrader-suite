import React from 'react';

const OscillatorPanel = ({ title, data, color, min, max, overbought, oversold }) => {
  if (!data || data.length === 0) return null;

  const width = 600; // Ancho virtual para el SVG
  const height = 60; // Altura para el panel
  
  // Función para normalizar valores al espacio SVG
  const getX = (index) => (index / (data.length - 1)) * width;
  const getY = (value) => height - ((value - min) / (max - min)) * height;

  const points = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');

  const overboughtY = getY(overbought);
  const oversoldY = getY(oversold);

  return (
    <div className="bg-[#0f1011] border border-[rgba(255,255,255,0.05)] rounded-xl p-3 flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-bold text-[#f7f8f8] tracking-wider uppercase">{title}</h3>
        <span className="text-[10px] font-mono" style={{ color }}>{data[data.length - 1].value.toFixed(2)}</span>
      </div>
      
      <div className="relative h-[60px] w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          {/* Líneas de referencia */}
          <line x1="0" y1={overboughtY} x2={width} y2={overboughtY} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="4" opacity="0.5" />
          <line x1="0" y1={oversoldY} x2={width} y2={oversoldY} stroke="#10b981" strokeWidth="0.5" strokeDasharray="4" opacity="0.5" />
          
          {/* Línea del indicador */}
          <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
};

export default OscillatorPanel;
