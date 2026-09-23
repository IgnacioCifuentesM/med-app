import { useState } from 'react';
import { PILLARS, recordValues, validatePillar } from '../lib/domain';
import { friendlyError } from '../lib/api';
import { Button, ErrorNotice, Field, Icon, Modal } from './ui';

export default function PillarEditor({ pillarKey, record, date, api, userId, onClose, onSaved }) {
  const pillar = PILLARS.find(p => p.key === pillarKey);
  const [values, setValues] = useState(() => recordValues(pillar, record?.data));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault(); if (busy) return;
    const validation = validatePillar(pillar, values); if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try { await api.savePillar(userId, date, pillarKey, values); onSaved(); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  return <Modal title={`${record ? 'Editar' : 'Registrar'} ${pillar.name.toLowerCase()}`} onClose={onClose} busy={busy}><div className="editor-intro"><span className={`icon-tile tone-${pillar.color}`}><Icon name={pillar.icon} size={26} /></span><p>{pillar.description}<small>Registro del {date}. Completa tus propios valores.</small></p></div><ErrorNotice message={error} /><form onSubmit={save}><fieldset disabled={busy}>
    {pillar.fields.map(f => <Field key={f.key} label={f.label} hint={f.unit} type={f.type} min={f.min} max={f.max} step={f.step} value={values[f.key] ?? ''} required={f.type === 'number'} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />)}
    <Field label="Algo que quieras recordar (opcional)">{id => <textarea id={id} rows={3} maxLength={1000} placeholder="Cómo te sentiste, qué te ayudó…" value={values.note || ''} onChange={e => setValues(v => ({ ...v, note: e.target.value }))} />}</Field>
    <p className="microcopy">Este registro describe tus hábitos. El indicador es orientativo y no es una evaluación clínica.</p><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" icon="check">{busy ? 'Guardando…' : 'Guardar registro'}</Button></div>
  </fieldset></form></Modal>;
}
