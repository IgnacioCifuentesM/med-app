import { useCallback } from 'react';
import { useResource } from '../hooks/useResource';
import { formatDay } from '../lib/domain';
import { ErrorNotice, Icon, Loading } from './ui';

export default function WeeklyRank({ api, profile, today }) {
  const loader = useCallback(() => api.weeklyRank(profile), [api, profile]);
  const rank = useResource(loader);
  return (
    <section className="panel weekly-rank" aria-label="Mi ranking semanal" key={today}>
      <span className="icon-tile tone-green">
        <Icon name="award" size={26} />
      </span>
      <div>
        <h2>Mi ranking semanal</h2>
        {rank.loading && !rank.data && <Loading label="Calculando tu posición…" />}
        <ErrorNotice message={rank.error} retry={rank.reload} />
        {rank.data && (
          <>
            <p className="rank-position">
              {rank.data.position == null
                ? 'Tu primera posición está por llegar'
                : rank.data.position <= 3
                  ? `Estás en el top ${rank.data.position}`
                  : `Estás en el puesto ${rank.data.position}`}
            </p>
            <p>
              {rank.data.position == null
                ? 'Registra tus pilares esta semana para conocer tu posición.'
                : `Tu puntaje semanal: ${rank.data.score}/100.${rank.data.tied ? ' Compartes esta posición por empate.' : ''}`}
            </p>
            <p className="microcopy">
              {formatDay(rank.data.start)} al {formatDay(rank.data.end)} · Semana en curso. Se
              consideran pacientes con registros; los pilares sin datos se excluyen del promedio. Tu
              posición es privada.
            </p>
          </>
        )}
        <button className="text-link" disabled={rank.loading} onClick={rank.reload}>
          Actualizar mi posición
        </button>
      </div>
    </section>
  );
}
