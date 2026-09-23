import { useCallback, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { validateProfile } from '../lib/domain';
import { CONSENT_TEXT, CONSENT_VERSION } from '../lib/consent';
import { friendlyError } from '../lib/api';
import MeasurementHistory from '../components/MeasurementHistory';
import {
  Avatar,
  Badge,
  Button,
  ErrorNotice,
  Field,
  Icon,
  Loading,
  PageHeading,
  SectionHeading,
} from '../components/ui';

export default function Profile({ api, profile, onUpdated, notify, onboarding = false }) {
  const doctor = profile.role === 'doctor';
  const loader = useCallback(async () => {
    if (doctor) return { doctors: [], relationships: [], consents: [] };
    const [doctors, relationships, consents] = await Promise.all([
      api.doctors(),
      api.relationships(profile.id),
      api.consents(profile.id),
    ]);
    return { doctors, relationships, consents };
  }, [api, doctor, profile.id]);
  const resource = useResource(loader);
  if (resource.loading && !resource.data) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  return (
    <ProfileForm
      key={`${profile.id}-${resource.data.relationships
        .map((r) => r.doctor_id)
        .sort()
        .join('-')}-${resource.data.consents.length}`}
      {...{ api, profile, notify, onboarding }}
      onUpdated={(updated) => {
        onUpdated(updated);
        void resource.reload();
      }}
      {...resource.data}
    />
  );
}
function ProfileForm({
  api,
  profile,
  onUpdated,
  notify,
  onboarding,
  doctors,
  relationships,
  consents,
}) {
  const [form, setForm] = useState({
    full_name: profile.full_name || '',
    age: profile.age ?? '',
    weight: profile.weight ?? '',
    height: profile.height ?? '',
    body_fat: profile.body_fat ?? '',
  });
  const [selectedDoctors, setSelectedDoctors] = useState(relationships.map((r) => r.doctor_id));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const doctor = profile.role === 'doctor';
  const removed = relationships.filter((r) => !selectedDoctors.includes(r.doctor_id));
  const needsConsent = selectedDoctors.some(
    (id) => !consents.some((c) => c.doctor_id === id && !c.revoked_at),
  );
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    const validation = validateProfile(form);
    if (validation) {
      setError(validation);
      return;
    }
    if (needsConsent && !consent) {
      setError('Confirma que aceptas compartir tus datos con los profesionales seleccionados.');
      return;
    }
    setBusy(true);
    try {
      const updated = await api.saveProfile(
        profile.id,
        form,
        doctor ? undefined : selectedDoctors,
        consent ? CONSENT_VERSION : undefined,
      );
      onUpdated(updated);
      notify('Tu perfil y equipo de salud quedaron actualizados.');
      setConsent(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setError('');
    try {
      const data = await api.exportPatient(profile.id);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], {
          type: 'application/json',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mis-datos-vitalia.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Se descargó una copia de tus datos.');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow={onboarding ? 'HAGAMOS ESTE ESPACIO TUYO' : 'TU INFORMACIÓN'}
        title={onboarding ? 'Bienvenido a Vitalia.' : 'Mi perfil.'}
      >
        Actualiza tus datos y elige a los profesionales que te acompañan.
      </PageHeading>
      <div className="profile-layout">
        <aside className="panel profile-card">
          <Avatar name={profile.full_name} large />
          <h2>{profile.full_name}</h2>
          <p>{profile.email}</p>
          <Badge>{doctor ? 'Profesional de salud' : 'Cuenta personal'}</Badge>
          <div className="profile-detail">
            <Icon name="clock" />
            <span>
              Zona horaria<strong>{profile.timezone || 'America/Santiago'}</strong>
            </span>
          </div>
          {api.demo && <p className="microcopy">Esta cuenta y sus datos son ficticios.</p>}
        </aside>
        <section className="panel">
          <SectionHeading title={doctor ? 'Información profesional' : 'Información personal'}>
            Los campos corporales son opcionales.
          </SectionHeading>
          <ErrorNotice message={error} />
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <Field
                label="Nombre completo"
                autoComplete="name"
                maxLength={120}
                value={form.full_name}
                required
                onChange={(e) => set('full_name', e.target.value)}
              />
              {!doctor && (
                <>
                  <div className="form-grid">
                    {[
                      ['age', 'Edad', 'años', 1, 120, 1],
                      ['weight', 'Peso', 'kg', 1, 500, 0.1],
                      ['height', 'Estatura', 'cm', 30, 260, 0.1],
                      ['body_fat', 'Grasa corporal', '%', 1, 80, 0.1],
                    ].map(([key, label, unit, min, max, step]) => (
                      <Field
                        key={key}
                        label={`${label} (${unit})`}
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={form[key]}
                        onChange={(e) => set(key, e.target.value)}
                      />
                    ))}
                  </div>
                  <hr />
                  <SectionHeading title="Tu equipo de salud">
                    Puedes tener varios médicos. Cada uno podrá ver tus registros y gestionar las
                    actividades que te indique.
                  </SectionHeading>
                  <fieldset className="doctor-selection">
                    <legend>Profesionales con acceso a tus datos</legend>
                    {!doctors.length && (
                      <p className="muted">
                        Todavía no hay profesionales disponibles. Puedes continuar sin vincular a
                        uno.
                      </p>
                    )}
                    {doctors.map((d) => (
                      <label className="checkbox-label" key={d.id}>
                        <input
                          type="checkbox"
                          checked={selectedDoctors.includes(d.id)}
                          onChange={(e) => {
                            setSelectedDoctors((ids) =>
                              e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id),
                            );
                            setConsent(false);
                          }}
                        />
                        <span>{d.full_name}</span>
                      </label>
                    ))}
                  </fieldset>
                  {!!removed.length && (
                    <div className="notice">
                      <Icon name="info" />
                      <p>
                        Al guardar, los profesionales desmarcados perderán acceso. Solo sus
                        actividades se pausarán al terminar el día; conservarás todo el historial.
                      </p>
                    </div>
                  )}
                  {needsConsent && (
                    <div className="notice">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                        />
                        <span>{CONSENT_TEXT}</span>
                      </label>
                    </div>
                  )}
                </>
              )}
              <div className="form-actions">
                <Button type="submit" disabled={busy} icon="check">
                  {busy ? 'Guardando…' : onboarding ? 'Entrar a mi espacio' : 'Guardar cambios'}
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
      </div>
      {!doctor && !onboarding && (
        <>
          <MeasurementHistory
            api={api}
            patientId={profile.id}
            timezone={profile.timezone}
            refreshKey={JSON.stringify([profile.weight, profile.height, profile.body_fat])}
          />
          <details className="panel">
            <summary>Historial de autorizaciones</summary>
            {!consents.length ? (
              <p className="muted">
                No hay aceptaciones registradas. Las vinculaciones anteriores requieren confirmación
                al guardar.
              </p>
            ) : (
              <ul>
                {[...consents]
                  .sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))
                  .map((c) => (
                    <li key={c.id}>
                      <strong>
                        {doctors.find((d) => d.id === c.doctor_id)?.full_name || 'Profesional'}
                      </strong>
                      : aceptado el{' '}
                      {new Date(c.accepted_at).toLocaleDateString('es-CL', {
                        timeZone: profile.timezone,
                      })}
                      {c.revoked_at
                        ? ` · acceso retirado el ${new Date(c.revoked_at).toLocaleDateString('es-CL', { timeZone: profile.timezone })}`
                        : ' · vigente'}
                      <p className="microcopy">{c.accepted_text}</p>
                    </li>
                  ))}
              </ul>
            )}
          </details>
          <section className="panel export-panel">
            <div>
              <h2>Tus datos te pertenecen.</h2>
              <p>
                Descarga tu perfil, hábitos, actividades, medidas y autorizaciones en formato JSON.
              </p>
            </div>
            <Button variant="secondary" icon="download" disabled={exporting} onClick={exportData}>
              {exporting ? 'Preparando…' : 'Exportar mis datos'}
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
