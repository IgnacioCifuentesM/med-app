import { useCallback } from 'react';
import { useResource } from '../hooks/useResource';
import { ErrorNotice, Loading, SectionHeading } from './ui';

export default function MeasurementHistory({
  api,
  patientId,
  timezone = 'America/Santiago',
  refreshKey = '',
}) {
  const loader = useCallback(() => {
    void refreshKey;
    return api.measurements(patientId);
  }, [api, patientId, refreshKey]);
  const resource = useResource(loader);
  if (resource.loading && !resource.data) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} retry={resource.reload} />;
  const rows = [...(resource.data || [])].sort((a, b) =>
    b.recorded_at.localeCompare(a.recorded_at),
  );
  return (
    <section className="panel">
      <SectionHeading title="Historial de medidas corporales">
        Cada cambio de peso, estatura o grasa corporal conserva un registro con fecha.
      </SectionHeading>
      {!rows.length ? (
        <p className="muted">Aún no hay medidas registradas.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Peso</th>
                <th>Estatura</th>
                <th>Grasa corporal</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {new Intl.DateTimeFormat('es-CL', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: timezone,
                    }).format(new Date(row.recorded_at))}
                  </td>
                  <td>{row.weight == null ? '—' : `${row.weight} kg`}</td>
                  <td>{row.height == null ? '—' : `${row.height} cm`}</td>
                  <td>{row.body_fat == null ? '—' : `${row.body_fat} %`}</td>
                  <td>
                    {row.source === 'baseline'
                      ? 'Valor al activar el historial'
                      : 'Actualización de perfil'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
