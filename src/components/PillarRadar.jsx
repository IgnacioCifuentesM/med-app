import { useId } from 'react';
import { formatDay } from '../lib/domain';
import { SectionHeading } from './ui';

const CENTER = 180;
const RADIUS = 110;
function point(index, score, radius = RADIUS) {
  const angle = (index * Math.PI) / 3 - Math.PI / 2;
  return [
    CENTER + (Math.cos(angle) * radius * score) / 100,
    CENTER + (Math.sin(angle) * radius * score) / 100,
  ];
}
function polygon(values) {
  return values.map((score, index) => point(index, score).join(',')).join(' ');
}

export default function PillarRadar({ summary }) {
  const titleId = useId();
  const descriptionId = useId();
  const scores = summary.pillars.map((p) => p.score);
  const complete = scores.every((score) => score != null);
  const available = scores.filter((score) => score != null);
  const spread = available.length ? Math.max(...available) - Math.min(...available) : null;
  const status = !complete
    ? 'Faltan pilares para ver el equilibrio'
    : spread <= 15
      ? 'Tus pilares están parejos'
      : 'Tus pilares tienen diferencias';
  return (
    <section className="panel pillar-radar">
      <SectionHeading title="Mi equilibrio de pilares">
        Semana del {formatDay(summary.start)} al {formatDay(summary.end)}.
      </SectionHeading>
      <div className="pillar-radar-layout">
        <svg
          className="pillar-radar-chart"
          viewBox="0 0 360 360"
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <title id={titleId}>Hexágono de tus seis pilares</title>
          <desc id={descriptionId}>
            {summary.pillars
              .map((p) => `${p.name}: ${p.score == null ? 'sin datos' : `${p.score} de 100`}`)
              .join('. ')}
            .{' '}
            {complete
              ? 'La figura conecta los puntajes semanales.'
              : 'Los puntos muestran solo los pilares con datos; no se dibuja una figura completa.'}
          </desc>
          {[25, 50, 75, 100].map((level) => (
            <polygon
              key={level}
              points={polygon(scores.map(() => level))}
              fill="none"
              stroke="#dce7e1"
            />
          ))}
          {summary.pillars.map((p, index) => {
            const edge = point(index, 100);
            const label = point(index, 100, 145);
            return (
              <g key={p.key}>
                <line x1={CENTER} y1={CENTER} x2={edge[0]} y2={edge[1]} stroke="#dce7e1" />
                <text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="middle">
                  {p.name}
                </text>
              </g>
            );
          })}
          {[25, 50, 75, 100].map((level) => (
            <text
              className="radar-scale"
              x={CENTER + 5}
              y={CENTER - (RADIUS * level) / 100 + 12}
              key={level}
            >
              {level}
            </text>
          ))}
          {complete && (
            <polygon
              points={polygon(scores)}
              fill="#287c59"
              fillOpacity="0.18"
              stroke="#287c59"
              strokeWidth="2.5"
            />
          )}
          {summary.pillars.map((p, index) =>
            p.score == null ? null : (
              <circle
                key={p.key}
                cx={point(index, p.score)[0]}
                cy={point(index, p.score)[1]}
                r="4"
                fill="#287c59"
              />
            ),
          )}
        </svg>
        <div className="radar-summary">
          <h3>{status}</h3>
          <p>
            {complete
              ? 'Una figura regular indica puntajes similares. Cuanto más se acerca al borde, más alto es el puntaje de ese pilar.'
              : `${available.length} de 6 pilares con puntaje. Registra los que faltan para completar la figura.`}
          </p>
          {complete && (
            <p>
              Diferencia entre el mayor y el menor: <strong>{spread} puntos</strong>.
            </p>
          )}
          <dl className="radar-values">
            {summary.pillars.map((p) => (
              <div key={p.key}>
                <dt>{p.name}</dt>
                <dd>{p.score == null ? 'Sin datos' : `${p.score}/100`}</dd>
              </div>
            ))}
          </dl>
          <p className="microcopy">
            “Parejos” significa una diferencia de hasta 15 puntos. Es una comparación de tus
            registros, no una evaluación médica; puntajes similares también pueden ser bajos.
          </p>
        </div>
      </div>
    </section>
  );
}
