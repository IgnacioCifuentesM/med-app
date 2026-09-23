import { useRef, useState } from 'react';
import { TASK_TYPES } from '../lib/domain';
import { friendlyError } from '../lib/api';
import { Badge, Button, Empty, ErrorNotice, Field, Icon, Modal } from './ui';

export default function TaskList({ tasks, completions, day, api, onChanged }) {
  const [pending, setPending] = useState(new Set()); const inFlight = useRef(new Set());
  const [error, setError] = useState(''); const [editing, setEditing] = useState(null);
  const [value, setValue] = useState(''); const [note, setNote] = useState('');
  const [measurementError, setMeasurementError] = useState('');
  async function toggle(task, done, details = {}) {
    if (inFlight.current.has(task.id)) return false;
    inFlight.current.add(task.id); setPending(new Set(inFlight.current)); setError('');
    try { await api.completeTask(task, day, done, details); await onChanged(); return true; }
    catch (e) { setError(friendlyError(e)); return false; }
    finally { inFlight.current.delete(task.id); setPending(new Set(inFlight.current)); }
  }
  function open(task, skip = false) { setEditing({ task, skip }); setValue(''); setNote(''); setMeasurementError(''); }
  async function saveDetails(e) {
    e.preventDefault(); setMeasurementError('');
    if (!editing.skip && (!value.trim() || !Number.isFinite(Number(value)))) { setMeasurementError('Ingresa una medición numérica válida.'); return; }
    const done = await toggle(editing.task, !editing.skip, { measurement_value: editing.skip ? null : Number(value), note: note.trim() || null });
    if (done) setEditing(null);
  }
  return <><ErrorNotice message={error} />{!tasks.length ? <Empty title="Un día sin actividades programadas" icon="sun">Tu equipo puede agregar actividades a tu plan.</Empty> : <div className="task-list">{[...tasks].sort((a, b) => (a.task_time || '99').localeCompare(b.task_time || '99')).map(task => {
    const completion = completions.find(c => c.task_id === task.id && c.completion_date === day); const done = !!completion?.completed; const type = TASK_TYPES[task.task_type] || TASK_TYPES.general;
    return <article className={`task-card ${done ? 'task-done' : ''}`} key={task.id}><button className="task-check" role="checkbox" aria-checked={done} aria-label={`${done ? 'Desmarcar' : 'Completar'} ${task.title}`} disabled={pending.has(task.id)} onClick={() => task.task_type === 'measurement' && !done ? open(task) : toggle(task, !done)}>{pending.has(task.id) ? <span className="spinner small" /> : done ? <Icon name="check" size={17} /> : null}</button><span className={`icon-tile tone-${type.color}`}><Icon name={type.icon} /></span><div className="task-content"><h3>{task.title}</h3><p>{task.description || task.instructions || type.name}</p>{task.instructions && task.description && <small>{task.instructions}</small>}{completion?.measurement_value != null && done && <Badge>{completion.measurement_value} {task.measurement_unit}</Badge>}{completion?.note && <small className="task-note">{done ? 'Nota' : 'Motivo'}: {completion.note}</small>}<div className="task-meta"><span>{type.name}</span>{!done && <button className="text-link" disabled={pending.has(task.id)} onClick={() => open(task, true)}>No pude realizarla</button>}</div></div><span className="task-time">{done ? <Badge>Completada</Badge> : <><Icon name="clock" size={14} />{task.task_time?.slice(0, 5) || 'Durante el día'}</>}</span></article>;
  })}</div>}{editing && <Modal title={editing.skip ? 'Registrar un motivo' : 'Registrar medición'} onClose={() => setEditing(null)} busy={pending.has(editing.task.id)}><p>{editing.task.title}</p><ErrorNotice message={measurementError || error} /><form onSubmit={saveDetails}><fieldset disabled={pending.has(editing.task.id)}>{!editing.skip && <Field label={`Resultado (${editing.task.measurement_unit || 'unidad'})`} type="number" step="any" required value={value} onChange={e => setValue(e.target.value)} />}<Field label={editing.skip ? '¿Qué pasó? (opcional)' : 'Nota (opcional)'}>{id => <textarea id={id} maxLength={1000} rows={3} value={note} onChange={e => setNote(e.target.value)} />}</Field><p className="microcopy">{editing.skip ? 'La actividad quedará pendiente. Tu equipo podrá ver el motivo.' : 'Registra el valor indicado por tu instrumento. No se interpreta automáticamente.'}</p><Button type="submit" className="full-width">{pending.has(editing.task.id) ? 'Guardando…' : 'Guardar'}</Button></fieldset></form></Modal>}</>;
}
