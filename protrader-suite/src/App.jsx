import React, { useState } from 'react';
import { TrendingUp, BarChart2 } from 'lucide-react';
import { useMarketData } from './hooks/useMarketData';
import Toolbar from './components/Toolbar/Toolbar';
import ChartDashboard from './components/Chart/ChartDashboard';
import RiskCalculator from './components/Risk/RiskCalculator';

export default function App() {
  const [currentTicker, setCurrentTicker] = useState("AAPL");
  const [interval, setInterval] = useState("1d");
  const [activeTool, setActiveTool] = useState("pointer");
  const [trendLineColor, setTrendLineColor] = useState("#38bdf8");
  const [drawings, setDrawings] = useState([]);
  
  // Parámetros de riesgo
  const [capital, setCapital] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("1.5");
  const [entryPrice, setEntryPrice] = useState("150.00");
  const [stopLoss, setStopLoss] = useState("145.00");
  
  const marketData = useMarketData(currentTicker, interval);

  return (
    <div className="min-h-screen bg-[#010102] text-[#d0d6e0] font-sans">
      <header className="border-b border-[rgba(255,255,255,0.05)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-[#5e6ad2]" />
          <h1 className="text-lg font-semibold text-[#f7f8f8]">ProTrader Suite</h1>
        </div>
      </header>

      <main className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-9">
          <Toolbar 
            activeTool={activeTool} 
            setActiveTool={setActiveTool} 
            trendLineColor={trendLineColor} 
            setTrendLineColor={setTrendLineColor} 
            onClearDrawings={() => setDrawings([])}
          />
          <ChartDashboard 
            chartData={marketData.chartData}
            drawings={drawings}
            indicators={[]}
          />
        </div>
        
        <div className="lg:col-span-3 space-y-4">
          <RiskCalculator 
            capital={capital}
            riskPercent={riskPercent}
            entryPrice={entryPrice}
            stopLoss={stopLoss}
          />
        </div>
      </main>
    </div>
  );
}
