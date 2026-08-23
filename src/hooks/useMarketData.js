import { useState, useEffect } from 'react';

export const useMarketData = (currentTicker) => {
  const [chartData, setChartData] = useState([]);
  const [fundamentals, setFundamentals] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [entryPrice, setEntryPrice] = useState("0,00");
  const [stopLoss, setStopLoss] = useState("0,00");
  const [takeProfit, setTakeProfit] = useState("0,00");

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
          setFundamentals(json.fundamentals);
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

  return { chartData, fundamentals, isLoadingData, entryPrice, setEntryPrice, stopLoss, setStopLoss, takeProfit, setTakeProfit };
};
