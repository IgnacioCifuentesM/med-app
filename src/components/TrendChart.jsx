import { formatDay } from '../lib/domain';

export default function TrendChart({ days, label = 'Indicador de hábitos', compact = false }) {
  const width = 620;
  const height = 160;
  const padding = 12;
  const position = (d, i) =>
    `${padding + (i * (width - padding * 2)) / Math.max(1, days.length - 1)},${height - padding - ((d.score ?? 0) * (height - padding * 2)) / 100}`;
  const segments = [];
  let current = [];
  days.forEach((d, i) => {
    if (d.score == null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(position(d, i));
  });
  if (current.length) segments.push(current);
  return (
    <div className={`trend-chart ${compact ? 'compact' : ''}`}>
      <div className="chart-axis">
        <span>100</span>
        <span>50</span>
        <span>0</span>
      </div>
      <div className="chart-drawing">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${label}. Los días sin datos se muestran como interrupciones. Los valores están disponibles en la tabla.`}
          preserveAspectRatio="none"
        >
          {[0, 50, 100].map((n) => (
            <line
              key={n}
              x1={0}
              x2={width}
              y1={height - padding - (n * (height - padding * 2)) / 100}
              y2={height - padding - (n * (height - padding * 2)) / 100}
              stroke="#e7ece8"
              strokeDasharray="4 5"
            />
          ))}
          {segments.map((points, i) => (
            <polyline
              key={i}
              points={points.join(' ')}
              fill="none"
              stroke="#287c59"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          ))}
          {days.map(
            (d, i) =>
              d.score != null && (
                <circle
                  key={d.date}
                  cx={position(d, i).split(',')[0]}
                  cy={position(d, i).split(',')[1]}
                  r={days.length > 15 ? 2 : 4}
                  fill="#287c59"
                >
                  <title>
                    {formatDay(d.date)}: {d.score} puntos
                  </title>
                </circle>
              ),
          )}
        </svg>
        <div className="chart-labels">
          <span>{days[0] && formatDay(days[0].date)}</span>
          <span>{days.at(-1) && formatDay(days.at(-1).date)}</span>
        </div>
      </div>
      {!compact && (
        <details className="chart-data">
          <summary>Ver datos del gráfico</summary>
          <div className="table-scroll">
            <table>
              <caption>{label}</caption>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Puntos</th>
                  <th>Pilares registrados</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDay(d.date)}</td>
                    <td>{d.score ?? 'Sin datos'}</td>
                    <td>{d.coverage ?? 0}/6</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
