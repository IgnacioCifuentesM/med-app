import { useCallback, useEffect, useState } from 'react';
import { useResource } from '../hooks/useResource';
import {
  adherence,
  addDays,
  dateRange,
  formatDay,
  FREQUENCIES,
  habitSummary,
  TASK_TYPES,
} from '../lib/domain';
import { friendlyError } from '../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Icon,
  Loading,
  Meter,
  Modal,
  PageHeading,
  SectionHeading,
  Stat,
} from '../components/ui';
import TrendChart from '../components/TrendChart';
import TaskEditor from '../components/TaskEditor';
import HabitRecords from '../components/HabitRecords';
import MeasurementHistory from '../components/MeasurementHistory';
import { useToday } from '../hooks/useToday';

export default function Doctor({ api, profile, page, navigate, notify }) {
  const selectedId = page.startsWith('patients/') ? decodeURIComponent(page.slice(9)) : null;
  return selectedId ? (
    <PatientRoute key={selectedId} {...{ api, profile, selectedId, navigate, notify }} />
  ) : (
    <DoctorOverview {...{ api, profile, page, navigate }} />
  );
}
function PatientRoute({ api, profile, selectedId, navigate, notify }) {
  const loader = useCallback(() => api.profile(selectedId), [api, selectedId]);
  const resource = useResource(loader);
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} retry={resource.reload} />;
  if (!resource.data || resource.data.role !== 'patient')
    return <Empty title="Paciente no disponible" />;
  return <PatientDetail {...{ api, profile, navigate, notify }} patient={resource.data} />;
}
function DoctorOverview({ api, profile, page, navigate }) {
  const [query, setQuery] = useState({ search: '', filter: 'all', offset: 0 });
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((q) => (q.search === searchInput ? q : { ...q, search: searchInput, offset: 0 })),
      300,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);
  const loader = useCallback(
    () => api.doctorOverview(profile.id, query.search, query.filter, query.offset),
    [api, profile.id, query],
  );
  const resource = useResource(loader);
  if (resource.loading && !resource.data)
    return <Loading label="Cargando tu espacio profesional…" />;
  if (!resource.data && resource.error)
    return <ErrorNotice message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const { items: patients, total, total_patients, followup_count } = resource.data;
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="ESPACIO PROFESIONAL"
        title={
          page === 'overview'
            ? `Buen día, ${profile.full_name.split(' ')[0]}.`
            : 'Cada paciente, su proceso.'
        }
      >
        Acompaña a tus pacientes junto a su equipo de salud.
      </PageHeading>
      <div className="stats-grid">
        <Stat
          label="Pacientes vinculados"
          value={total_patients}
          caption="personas que acompañas"
          icon="users"
        />
        <Stat
          label="Actividad por revisar"
          value={followup_count}
          caption="sin registros recientes; no indica riesgo clínico"
          icon="clock"
          tone="orange"
        />
        <Stat
          label="Con registros recientes"
          value={total_patients - followup_count}
          caption="al menos un registro en los últimos 3 días"
          icon="activity"
          tone="blue"
        />
      </div>
      <section className="panel">
        <SectionHeading title="Tus pacientes">
          Indicador descriptivo de siete días; cada paciente se evalúa en su zona horaria.
        </SectionHeading>
        <div className="table-toolbar">
          <div className="search-field">
            <Icon name="search" />
            <input
              aria-label="Buscar pacientes por nombre o correo"
              placeholder="Buscar por nombre o correo…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar por seguimiento"
            value={query.filter}
            onChange={(e) => setQuery((q) => ({ ...q, filter: e.target.value, offset: 0 }))}
          >
            <option value="all">Todos los pacientes</option>
            <option value="followup">Actividad por revisar</option>
            <option value="active">Con registros recientes</option>
          </select>
        </div>
        <ErrorNotice message={resource.error} retry={resource.reload} />
        {resource.loading ? (
          <Loading label="Actualizando pacientes…" />
        ) : !patients.length ? (
          <Empty
            title={
              total_patients
                ? 'Sin resultados para este filtro'
                : 'Todavía no tienes pacientes vinculados'
            }
          >
            Los pacientes pueden agregarte a su equipo desde su perfil.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="patient-table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Último registro</th>
                  <th>Hábitos · 7 días</th>
                  <th>Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.profile.id}>
                    <td>
                      <button
                        className="patient-name"
                        onClick={() => navigate(`patients/${p.profile.id}`)}
                      >
                        <Avatar name={p.profile.full_name} />
                        <span>
                          <strong>{p.profile.full_name}</strong>
                          <small>{p.profile.email}</small>
                        </span>
                      </button>
                    </td>
                    <td>{p.last ? formatDay(p.last) : 'Sin registros en 30 días'}</td>
                    <td>
                      <strong>{p.summary.score ?? '—'}</strong>
                      <Meter value={p.summary.score} label={`Hábitos de ${p.profile.full_name}`} />
                      <small>{p.summary.days}/7 días con datos</small>
                    </td>
                    <td>
                      <Badge tone={p.inactive ? 'orange' : 'green'}>
                        {p.inactive ? 'Revisar actividad' : 'Con registros recientes'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            {total
              ? `${Math.min(query.offset + 1, total)}–${Math.min(query.offset + 10, total)} de ${total}`
              : '0 pacientes'}
          </span>
          <div className="pagination-actions">
            <Button
              variant="secondary"
              disabled={resource.loading || query.offset === 0}
              onClick={() => setQuery((q) => ({ ...q, offset: Math.max(0, q.offset - 10) }))}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={resource.loading || query.offset + 10 >= total}
              onClick={() => setQuery((q) => ({ ...q, offset: q.offset + 10 }))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
function PatientDetail({ api, profile, patient, notify, navigate }) {
  const today = useToday(patient.timezone);
  const [period, setPeriod] = useState(14);
  const [editor, setEditor] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loader = useCallback(
    () => api.patientData(patient.id, addDays(today, -(period - 1)), today),
    [api, patient.id, today, period],
  );
  const resource = useResource(loader);
  const doctorsLoader = useCallback(() => api.doctors(), [api]);
  const team = useResource(doctorsLoader);
  async function updateStatus() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.taskStatus(confirm.task, confirm.action, today, profile.id);
      setConfirm(null);
      notify('El plan quedó actualizado.');
      await resource.reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading && !resource.data) return <Loading />;
  if (resource.error) return <ErrorNotice message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const { records, tasks, completions } = resource.data;
  const summary = habitSummary(records);
  const dates = dateRange(today, period);
  const plan = adherence(tasks, completions, dates);
  return (
    <div className="page-enter">
      <button className="back-link" onClick={() => navigate('patients')}>
        <Icon name="back" size={18} />
        Volver a pacientes
      </button>
      <PageHeading
        eyebrow="FICHA DE SEGUIMIENTO"
        title={patient.full_name}
        action={
          <Button icon="plus" onClick={() => setEditor(true)}>
            Agregar actividad
          </Button>
        }
      >
        {patient.age ? `${patient.age} años · ` : ''}
        {patient.email} · {patient.timezone || 'America/Santiago'}
      </PageHeading>
      <div className="period-line">
        <span>Período de seguimiento</span>
        <div className="segmented">
          {[7, 14, 30, 90].map((n) => (
            <button
              key={n}
              aria-pressed={period === n}
              className={period === n ? 'selected' : ''}
              onClick={() => setPeriod(n)}
            >
              {n} días
            </button>
          ))}
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="Indicador de hábitos"
          value={summary.score}
          caption={`${summary.days}/${period} días registrados`}
          icon="leaf"
        />
        <Stat
          label="Cumplimiento del plan"
          value={plan.score == null ? '—' : `${plan.score}%`}
          caption={`${plan.completed} de ${plan.total} actividades programadas`}
          icon="check"
          tone="blue"
        />
        <Stat
          label="Cambio en el período"
          value={summary.trend == null ? '—' : `${summary.trend > 0 ? '+' : ''}${summary.trend}`}
          caption="puntos entre pilares comunes del primer y último día"
          icon="chart"
          tone="purple"
        />
      </div>
      {tasks.some((t) => !Array.isArray(t.active_periods)) && (
        <div className="notice">
          <Icon name="info" />
          Hay actividades antiguas sin historial de pausas. El cumplimiento histórico puede estar
          incompleto.
        </div>
      )}
      <section className="panel">
        <SectionHeading title="Evolución de hábitos" />
        <TrendChart
          days={dates.map(
            (date) =>
              summary.daily.find((d) => d.date === date) || { date, score: null, coverage: 0 },
          )}
        />
      </section>
      <section className="panel">
        <SectionHeading
          title="Plan de acompañamiento"
          action={
            <Badge tone="neutral">
              {tasks.filter((t) => t.active && !t.archived_at).length} activas
            </Badge>
          }
        >
          Cada profesional gestiona sus propias indicaciones. Las pausas conservan el historial y se
          hacen efectivas al terminar el día del paciente.
        </SectionHeading>
        <ErrorNotice message={error} />
        {!tasks.length ? (
          <Empty
            title="Todavía no hay actividades"
            action={
              <Button icon="plus" onClick={() => setEditor(true)}>
                Crear primera actividad
              </Button>
            }
          >
            Diseña un plan claro y alcanzable junto al paciente.
          </Empty>
        ) : (
          <div className="doctor-task-list">
            {tasks.map((task) => {
              const type = TASK_TYPES[task.task_type] || TASK_TYPES.general;
              return (
                <article className="doctor-task" key={task.id}>
                  <span className={`icon-tile tone-${type.color}`}>
                    <Icon name={type.icon} />
                  </span>
                  <div className="doctor-task-info">
                    <strong>{task.title}</strong>
                    <small>
                      Indicado por{' '}
                      {team.data?.find((d) => d.id === task.doctor_id)?.full_name ||
                        'profesional del equipo'}
                    </small>
                    <p>{task.description || task.instructions}</p>
                    <small>
                      {FREQUENCIES[task.frequency]}
                      {task.task_time ? ` · ${task.task_time.slice(0, 5)}` : ''} · desde{' '}
                      {formatDay(task.start_date)}
                      {task.end_date ? ` hasta ${formatDay(task.end_date)}` : ''}
                    </small>
                  </div>
                  <Badge tone={task.archived_at ? 'neutral' : task.active ? 'green' : 'orange'}>
                    {task.archived_at ? 'Archivada' : task.active ? 'Activa' : 'Pausada'}
                  </Badge>
                  {!task.archived_at && task.doctor_id === profile.id && (
                    <div className="task-actions">
                      <Button
                        variant="ghost"
                        icon={task.active ? 'pause' : 'play'}
                        onClick={() =>
                          setConfirm({ task, action: task.active ? 'pause' : 'resume' })
                        }
                      >
                        {task.active ? 'Pausar' : 'Reactivar'}
                      </Button>
                      <button
                        className="icon-button"
                        aria-label={`Archivar ${task.title}`}
                        onClick={() => setConfirm({ task, action: 'archive' })}
                      >
                        <Icon name="archive" size={18} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="panel">
        <SectionHeading title="Actividad reportada por el paciente">
          Cumplimientos, mediciones y motivos del período.
        </SectionHeading>
        {!completions.length ? (
          <p className="muted">Aún no hay reportes para estas fechas.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Actividad</th>
                  <th>Estado / valor</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {[...completions]
                  .sort((a, b) => b.completion_date.localeCompare(a.completion_date))
                  .map((c) => {
                    const task = tasks.find((t) => t.id === c.task_id);
                    return (
                      <tr key={c.id}>
                        <td>{formatDay(c.completion_date)}</td>
                        <td>{task?.title || 'Actividad histórica'}</td>
                        <td>
                          {c.completed
                            ? c.measurement_value != null
                              ? `${c.measurement_value} ${task?.measurement_unit || ''}`
                              : 'Completada'
                            : 'Pendiente'}
                        </td>
                        <td>{c.note || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <HabitRecords records={records} />
      <MeasurementHistory api={api} patientId={patient.id} timezone={patient.timezone} />
      {editor && (
        <TaskEditor
          {...{ api, today }}
          doctorId={profile.id}
          patientId={patient.id}
          onClose={() => setEditor(false)}
          onSaved={() => {
            setEditor(false);
            notify('Actividad agregada al plan.');
            void resource.reload();
          }}
        />
      )}
      {confirm && (
        <Modal
          title={
            confirm.action === 'archive'
              ? 'Archivar actividad'
              : confirm.action === 'pause'
                ? 'Pausar actividad'
                : 'Reactivar actividad'
          }
          onClose={() => setConfirm(null)}
          busy={busy}
        >
          <p>
            <strong>{confirm.task.title}</strong>
          </p>
          <p>
            {confirm.action === 'resume'
              ? 'La actividad volverá a programarse desde hoy según su frecuencia y fechas de vigencia.'
              : 'La actividad dejará de programarse a partir de mañana. Se conservarán los registros anteriores y los de hoy.'}
          </p>
          <ErrorNotice message={error} />
          <div className="modal-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={updateStatus}>
              {busy ? 'Guardando…' : 'Confirmar'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
