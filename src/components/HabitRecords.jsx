import { formatDay, PILLARS, recordValues } from '../lib/domain';
export default function HabitRecords({ records }) {
  return (
    <details className="panel">
      <summary>Registros de hábitos y notas del período</summary>
      {!records.length ? (
        <p className="muted">No hay registros en este período.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Pilar</th>
                <th>Respuestas</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {[...records]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((record) => {
                  const pillar = PILLARS.find((p) => p.key === record.pillar);
                  if (!pillar) return null;
                  const values = recordValues(pillar, record.data);
                  return (
                    <tr key={record.id}>
                      <td>{formatDay(record.date)}</td>
                      <td>{pillar.name}</td>
                      <td>
                        <ul className="record-values">
                          {pillar.fields.map((field) => (
                            <li key={field.key}>
                              <strong>{field.label}:</strong>{' '}
                              {values[field.key] === '' || values[field.key] == null
                                ? 'Sin dato'
                                : `${values[field.key]} ${field.unit || ''}`}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td>{values.note || '—'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
