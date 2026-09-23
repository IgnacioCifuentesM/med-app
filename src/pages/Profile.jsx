import { useCallback, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { validateProfile } from '../lib/domain';
import { friendlyError } from '../lib/api';
import { Avatar, Badge, Button, ErrorNotice, Field, Icon, Loading, PageHeading, SectionHeading } from '../components/ui';

export default function Profile({ api, profile, onUpdated, notify, onboarding = false }) {
  const doctor = profile.role === 'doctor';
  const loader = useCallback(async () => { if (doctor) return { doctors: [], relationship: null }; const [doctors, relationship] = await Promise.all([api.doctors(), api.relationship(profile.id)]); return { doctors, relationship }; }, [api, doctor, profile.id]);
  const resource = useResource(loader);
  if (resource.loading && !resource.data) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  return <ProfileForm key={`${profile.id}-${resource.data.relationship?.doctor_id || ''}`} {...{ api, profile, notify, onboarding }} onUpdated={updated => { onUpdated(updated); void resource.reload(); }} {...resource.data} />;
}
function ProfileForm({ api, profile, onUpdated, notify, onboarding, doctors, relationship }) {
  const [form, setForm] = useState({ full_name: profile.full_name || '', age: profile.age ?? '', weight: profile.weight ?? '', height: profile.height ?? '', body_fat: profile.body_fat ?? '' });
  const [selectedDoctor, setSelectedDoctor] = useState(relationship?.doctor_id || '');
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [exporting, setExporting] = useState(false); const [error, setError] = useState('');
  const doctor = profile.role === 'doctor'; const changedDoctor = selectedDoctor !== (relationship?.doctor_id || '');
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  async function save(e) {
    e.preventDefault(); if (busy) return; setError(''); const validation = validateProfile(form); if (validation) { setError(validation); return; }
    if (changedDoctor && selectedDoctor && !consent) { setError('Confirma que quieres compartir tus registros con el profesional seleccionado.'); return; }
    setBusy(true);
    try { const updated = await api.saveProfile(profile.id, form, !doctor && changedDoctor ? selectedDoctor : undefined); onUpdated(updated); notify('Tu perfil quedó actualizado.'); }
    catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }
  async function exportData() {
    if (exporting) return; setExporting(true); setError('');
    try { const data = await api.exportPatient(profile.id); const url = URL.createObjectURL(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'mis-datos-vitalia.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Se descargó una copia de tus datos.'); } catch (err) { setError(friendlyError(err)); } finally { setExporting(false); }
  }
  return <div className="page-enter"><PageHeading eyebrow={onboarding ? 'HAGAMOS ESTE ESPACIO TUYO' : 'TU INFORMACIÓN'} title={onboarding ? `Bienvenido${doctor ? ', profesional' : ''} a Vitalia.` : 'Mi perfil.'}>{onboarding ? doctor ? 'Confirma tu nombre para entrar a tu espacio profesional.' : 'Completa lo que quieras compartir. Puedes vincular a tu médico ahora o más adelante.' : 'Mantén tus datos al día y elige quién te acompaña.'}</PageHeading><div className="profile-layout"><aside className="panel profile-card"><Avatar name={profile.full_name} large /><h2>{profile.full_name}</h2><p>{profile.email}</p><Badge>{doctor ? 'Profesional de salud' : 'Cuenta personal'}</Badge><div className="profile-detail"><Icon name="clock" /><span>Zona horaria<strong>{profile.timezone || 'America/Santiago'}</strong></span></div>{api.demo && <p className="microcopy">Esta cuenta y sus datos son ficticios.</p>}</aside><section className="panel"><SectionHeading title={doctor ? 'Información profesional' : 'Información personal'}>Los campos corporales son opcionales.</SectionHeading><ErrorNotice message={error} /><form onSubmit={save}><fieldset disabled={busy}><Field label="Nombre completo" autoComplete="name" maxLength={120} value={form.full_name} required onChange={e => set('full_name', e.target.value)} />{!doctor && <><div className="form-grid">{[['age', 'Edad', 'años', 1, 120, 1], ['weight', 'Peso', 'kg', 1, 500, 0.1], ['height', 'Estatura', 'cm', 30, 260, 0.1], ['body_fat', 'Grasa corporal', '%', 1, 80, 0.1]].map(([key, label, unit, min, max, step]) => <Field key={key} label={`${label} (${unit})`} type="number" min={min} max={max} step={step} value={form[key]} onChange={e => set(key, e.target.value)} />)}</div><hr /><SectionHeading title="Tu profesional de salud">El profesional vinculado podrá ver tu perfil, registros y plan.</SectionHeading><Field label="Profesional que te acompaña">{id => <select id={id} value={selectedDoctor} onChange={e => { setSelectedDoctor(e.target.value); setConsent(false); }}><option value="">Sin profesional vinculado</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>}</Field>{changedDoctor && <div className="notice"><Icon name="info" /><div>{selectedDoctor ? <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Acepto compartir mis registros y datos de salud con este profesional.</label> : 'Al guardar, el profesional anterior dejará de tener acceso a tus registros. Las tareas previas se pausarán al terminar el día.'}</div></div>}</>}
      <div className="form-actions"><Button type="submit" disabled={busy} icon="check">{busy ? 'Guardando…' : onboarding ? 'Entrar a mi espacio' : 'Guardar cambios'}</Button></div></fieldset></form></section></div>{!doctor && !onboarding && <section className="panel export-panel"><div><h2>Tus datos te pertenecen.</h2><p>Descarga una copia de tu perfil, registros y actividades en formato JSON.</p></div><Button variant="secondary" icon="download" disabled={exporting} onClick={exportData}>{exporting ? 'Preparando…' : 'Exportar mis datos'}</Button></section>}</div>;
}
