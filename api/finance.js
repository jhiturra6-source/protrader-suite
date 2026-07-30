// api/finance.js
export default async function handler(req, res) {
  // Permitir peticiones desde cualquier origen (CORS habilitado)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol = 'AAPL' } = req.query;

  try {
    const period1 = 0;// period1 = 0 representa el inicio del tiempo Unix (1 de Enero de 1970).
                      // Esto obliga a Yahoo Finance a traer los datos desde la salida a bolsa (IPO) de la empresa.
    const period1 = 0;
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?period1=${period1}&period2=${period2}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      throw new Error(`Error en Yahoo Finance: ${response.statusText}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}