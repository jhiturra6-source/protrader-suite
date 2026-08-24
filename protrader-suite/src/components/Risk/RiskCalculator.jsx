import React, { useState } from 'react';

const RiskCalculator = ({ capital, riskPercent, entryPrice, stopLoss }) => {
  const parseToFloat = (val) => parseFloat(val.toString().replace(/\./g, '').replace(/,/g, '.'));
  
  const numCapital = parseToFloat(capital);
  const numRiskPercent = parseToFloat(riskPercent) / 100;
  const numEntry = parseToFloat(entryPrice);
  const numStop = parseToFloat(stopLoss);
  
  const dollarsAtRisk = numCapital * numRiskPercent;
  const riskPerShare = numEntry - numStop;
  const idealShares = riskPerShare > 0 ? Math.floor(dollarsAtRisk / riskPerShare) : 0;

  return (
    <div className="bg-[#0f1011] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 space-y-4">
      <h3 className="text-xs font-bold text-[#f7f8f8] uppercase tracking-wider">Calculadora de Posición</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center p-2 bg-[rgba(255,255,255,0.02)] rounded-lg">
          <div className="text-[10px] text-[#8a8f98]">Capital Arriesgado</div>
          <div className="text-sm font-bold text-[#f7f8f8]">${dollarsAtRisk.toFixed(2)}</div>
        </div>
        <div className="text-center p-2 bg-[rgba(255,255,255,0.02)] rounded-lg">
          <div className="text-[10px] text-[#8a8f98]">Pérdida por Acción</div>
          <div className="text-sm font-bold text-[#ef4444]">${riskPerShare.toFixed(2)}</div>
        </div>
      </div>
      <div className="pt-2 border-t border-[rgba(255,255,255,0.05)] flex justify-between items-center">
        <span className="text-xs text-[#d0d6e0]">Acciones Ideales</span>
        <span className="text-lg font-bold text-[#10b981]">{idealShares}</span>
      </div>
    </div>
  );
};

export default RiskCalculator;
