import React, { forwardRef } from 'react';
import ChartContainer from './ChartContainer';
import OscillatorPanel from '../Indicators/OscillatorPanel';

const ChartDashboard = forwardRef(({ 
  chartData, 
  onMouseDown, 
  onMouseMove, 
  onMouseUp, 
  onClick, 
  drawings, 
  currentDrawing, 
  renderDrawing,
  indicators 
}, ref) => {
  return (
    <div className="flex flex-col gap-4">
      <ChartContainer 
        ref={ref}
        data={chartData}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onClick={onClick}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          {drawings.map(renderDrawing)}
          {currentDrawing && renderDrawing({ ...currentDrawing, id: 'current' })}
        </svg>
      </ChartContainer>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {indicators.map((ind, idx) => (
          <OscillatorPanel key={idx} {...ind} />
        ))}
      </div>
    </div>
  );
});

export default ChartDashboard;
