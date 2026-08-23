import React from 'react';
import { MousePointer2, Pencil, Type, Ruler, Trash2, Eraser, Square } from 'lucide-react';

const Toolbar = ({ activeTool, setActiveTool, trendLineColor, setTrendLineColor, onClearDrawings }) => {
  const tools = [
    { id: 'pointer', icon: MousePointer2 },
    { id: 'pencil', icon: Pencil },
    { id: 'rectangle', icon: Square },
    { id: 'ruler', icon: Ruler },
    { id: 'text', icon: Type },
    { id: 'eraser', icon: Eraser },
  ];

  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 bg-[#0f1011] border border-[rgba(255,255,255,0.08)] rounded-xl p-2 shadow-2xl">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          className={`p-2 rounded-lg transition-colors ${
            activeTool === tool.id 
              ? 'bg-[#5e6ad2] text-white' 
              : 'text-[#8a8f98] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#f7f8f8]'
          }`}
          title={tool.id}
        >
          <tool.icon className="w-4 h-4" />
        </button>
      ))}
      <div className="w-full h-px bg-[rgba(255,255,255,0.08)] my-1" />
      <input 
        type="color" 
        value={trendLineColor} 
        onChange={(e) => setTrendLineColor(e.target.value)} 
        className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer p-0"
      />
      <button 
        onClick={onClearDrawings} 
        className="p-2 text-[#62666d] hover:text-[#FF6966] transition-colors"
        title="Limpiar dibujos"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Toolbar;
