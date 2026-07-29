timeScale: {
  rightOffset: 12,
  barSpacing: 10,
  fixLeftEdge: true,
  fixRightEdge: true,
  timeVisible: true,
  secondsVisible: false,
  // Esta función hace la magia del zoom inteligente
  tickMarkFormatter: (time, tickMarkType, locale) => {
    const date = new Date(time.year, time.month - 1, time.day);
    // Si el zoom es lejano, mostrar solo meses o años
    if (tickMarkType === 2) return date.toLocaleDateString(locale, { month: 'short' });
    // Si el zoom es cercano, mostrar día y mes
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  },
},