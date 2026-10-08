import { useCallback, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { addDays, dateRange, formatDay } from '../lib/domain';
import { friendlyError } from '../lib/api';
import { Button, ErrorNotice, Loading, SectionHeading } from './ui';
import TrendChart from './TrendChart';

export default function Energy({ api, patientId, today, period = 14, editable = false }) {
  const loader = useCallback(
    () => api.energyRecords(patientId, addDays(today, -(period - 1)), today),
    [api, patientId, today, period],
  );
  const resource = useResource(loader);
  return (
    <section className="energy-section">
      <SectionHeading title={editable ? 'Mi energía de hoy' : 'Energía diaria'} />
      <ErrorNotice message={resource.error} retry={resource.reload} />
      {resource.loading && !resource.data && <Loading />}
      {resource.data && (
        <>
          {editable && (
            <EnergyForm
              key={`${patientId}-${today}-${resource.data.find((r) => r.date === today)?.value ?? 'new'}`}
              api={api}
              patientId={patientId}
              today={today}
              saved={resource.data.find((r) => r.date === today)}
              onSaved={resource.reload}
            />
          )}
          <EnergyHistory records={resource.data} today={today} period={period} />
        </>
      )}
    </section>
  );
}

function EnergyForm({ api, patientId, today, saved, onSaved }) {
  const [value, setValue] = useState(saved?.value ?? 5);
  const [selected, setSelected] = useState(Boolean(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (busy || !selected) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.saveEnergy(patientId, today, value);
      setMessage('Energía guardada.');
      await onSaved();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="energy-form" onSubmit={submit}>
      <label htmlFor="daily-energy">
        ¿Cuánta energía sientes hoy? <strong>{selected ? `${value} / 10` : 'Sin registrar'}</strong>
      </label>
      <input
        id="daily-energy"
        type="range"
        min="0"
        max="10"
        step="1"
        value={value}
        disabled={busy}
        onChange={(e) => {
          setValue(Number(e.target.value));
          setSelected(true);
        }}
        onPointerDown={() => setSelected(true)}
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key))
            setSelected(true);
        }}
      />
      <div className="energy-scale">
        <span>0 · Sin energía</span>
        <span>10 · Máxima energía</span>
      </div>
      <ErrorNotice message={error} />
      <Button type="submit" disabled={busy || !selected}>
        {busy ? 'Guardando…' : saved ? 'Actualizar energía' : 'Guardar energía'}
      </Button>
      <span role="status">{message || (saved ? 'Registro de hoy guardado.' : '')}</span>
    </form>
  );
}

function EnergyHistory({ records, today, period }) {
  const days = dateRange(today, period).map((date) => ({
    date,
    score: records.find((r) => r.date === date)?.value ?? null,
  }));
  const average = records.length
    ? (records.reduce((sum, r) => sum + r.value, 0) / records.length).toFixed(1)
    : null;
  return (
    <div className="energy-history">
      <p>
        {average === null
          ? 'Aún no hay registros de energía.'
          : `Promedio: ${average} / 10 · ${records.length} de ${period} días registrados`}
      </p>
      <TrendChart days={days} label="Energía diaria" max={10} compact />
      <details>
        <summary>Ver registros de energía</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Energía / 10</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((day) => (
                <tr key={day.date}>
                  <td>{formatDay(day.date)}</td>
                  <td>{day.score ?? 'Sin registrar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
