import React, { useRef, useEffect, forwardRef } from 'react';
import { createChart } from 'lightweight-charts';

const ChartContainer = forwardRef(({ data, children, onMouseDown, onMouseMove, onMouseUp, onClick }, ref) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  // Exponer la referencia al componente padre
  useEffect(() => {
    if (ref) ref.current = chartContainerRef.current;
  }, [ref]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: 'solid', color: '#08090a' }, textColor: '#d0d6e0' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });
    const series = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => chart.remove();
  }, []);

  useEffect(() => {
    if (seriesRef.current && data.length > 0) seriesRef.current.setData(data);
  }, [data]);

  return (
    <div ref={chartContainerRef} className="relative w-full h-[400px] bg-[#08090a]" 
         onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onClick={onClick}>
      {children}
    </div>
  );
});

export default ChartContainer;