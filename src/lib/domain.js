export const TIME_ZONE = 'America/Santiago';
export const SCORE_VERSION = 2;

export function dateKey(date = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(day, amount) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function daysBetween(a, b) { return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000); }
export function dateRange(end, count = 7) { return Array.from({ length: count }, (_, i) => addDays(end, i - count + 1)); }
export function formatDay(day, options = {}) { return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`)); }
export const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export const mean = values => values.length ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length) : null;

const number = (key, label, min, max, unit, step = 1) => ({ key, label, min, max, unit, step, type: 'number' });
export const PILLARS = [
  { key: 'nutricion', name: 'Nutrición', icon: 'leaf', color: 'green', description: 'Pequeñas decisiones que te nutren.', fields: [number('portions', 'Frutas y verduras', 0, 10, 'porciones'), number('quality', 'Calidad de tu alimentación', 1, 10, '/ 10'), number('water', 'Agua', 0, 12, 'vasos')] },
  { key: 'actividad', name: 'Movimiento', icon: 'activity', color: 'blue', description: 'Muévete a tu propio ritmo.', fields: [number('steps', 'Pasos', 0, 100000, 'pasos'), number('minutes', 'Ejercicio', 0, 600, 'minutos'), number('intensity', 'Intensidad percibida', 1, 10, '/ 10')] },
  { key: 'sueno', name: 'Sueño', icon: 'moon', color: 'purple', description: 'Dale espacio a tu descanso.', fields: [number('hours', 'Tiempo de sueño', 0, 24, 'horas', 0.25), number('quality', 'Calidad del descanso', 1, 10, '/ 10'), { key: 'bedtime', label: 'Hora de acostarte (opcional)', type: 'time' }] },
  { key: 'sustancias', name: 'Consumo', icon: 'shield', color: 'orange', description: 'Observa tus hábitos sin juicios.', fields: [number('cigarettes', 'Cigarrillos', 0, 100, 'unidades'), number('alcohol', 'Alcohol', 0, 30, 'unidades', 0.5)] },
  { key: 'estres', name: 'Calma', icon: 'sun', color: 'yellow', description: 'Haz una pausa para escucharte.', fields: [number('stress', 'Estrés percibido', 1, 10, '/ 10'), number('minutes', 'Respiración o meditación', 0, 180, 'minutos')] },
  { key: 'conexion', name: 'Conexión', icon: 'heart', color: 'pink', description: 'Cuida lo que te hace bien.', fields: [number('connection', 'Conexión con otras personas', 1, 10, '/ 10'), number('minutes', 'Actividad con propósito', 0, 600, 'minutos')] },
];

export function recordValues(pillar, data) {
  if (!data) return {};
  if (!Array.isArray(data)) return data.values || data;
  const values = Object.fromEntries(pillar.fields.map((f, i) => [f.key, data[i] ?? '']));
  if (data.length > pillar.fields.length) values.note = data[pillar.fields.length];
  return values;
}
export function validatePillar(pillar, values) {
  for (const f of pillar.fields.filter(f => f.type === 'number')) {
    const n = Number(values[f.key]);
    if (values[f.key] === '' || values[f.key] == null || !Number.isFinite(n) || n < f.min || n > f.max) return `${f.label}: ingresa un valor entre ${f.min} y ${f.max}.`;
  }
  if ((values.note || '').length > 1000) return 'La nota admite hasta 1.000 caracteres.';
  return '';
}
// Indicadores de hábito orientativos. No son una escala clínica ni una prescripción.
// Intensidad, agua y horario se conservan como contexto, no como objetivos universales.
export function scorePillar(key, values) {
  const pillar = PILLARS.find(p => p.key === key);
  if (!pillar || validatePillar(pillar, values)) return null;
  const v = Object.fromEntries(Object.entries(values).map(([k, n]) => [k, Number(n)]));
  const scale = n => clamp((n - 1) / 9 * 100);
  const target = (n, t) => clamp(n / t * 100);
  const scores = {
    nutricion: () => mean([target(v.portions, 5), scale(v.quality)]),
    actividad: () => mean([target(v.steps, 8000), target(v.minutes, 30)]),
    sueno: () => scale(v.quality),
    sustancias: () => mean([clamp(100 - v.cigarettes / 20 * 100), clamp(100 - v.alcohol / 10 * 100)]),
    estres: () => 100 - scale(v.stress),
    conexion: () => scale(v.connection),
  };
  return Math.round(clamp(scores[key]()));
}
export function normalizedScore(record) {
  const pillar = PILLARS.find(p => p.key === record.pillar);
  if (!pillar) return null;
  return scorePillar(record.pillar, recordValues(pillar, record.data));
}
export function habitSummary(records) {
  const byDay = new Map();
  for (const r of records) {
    const score = normalizedScore(r);
    if (score == null) continue;
    if (!byDay.has(r.date)) byDay.set(r.date, new Map());
    byDay.get(r.date).set(r.pillar, score);
  }
  const daily = [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, scores]) => ({ date, score: mean([...scores.values()]), coverage: scores.size }));
  const pillars = PILLARS.map(p => ({ ...p, score: mean([...byDay.values()].filter(day => day.has(p.key)).map(day => day.get(p.key))) }));
  return { score: mean(daily.map(d => d.score)), daily, pillars, days: daily.length, trend: daily.length < 2 ? null : daily.at(-1).score - daily[0].score };
}
export function streak(records, today) {
  const dates = new Set(records.filter(r => PILLARS.some(p => p.key === r.pillar)).map(r => r.date));
  let day = dates.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (dates.has(day)) { count++; day = addDays(day, -1); }
  return count;
}
export const TASK_TYPES = {
  medication: { name: 'Medicamento', icon: 'pill', color: 'purple' },
  exercise: { name: 'Movimiento', icon: 'activity', color: 'blue' },
  measurement: { name: 'Medición', icon: 'pulse', color: 'orange' },
  appointment: { name: 'Control', icon: 'calendar', color: 'yellow' },
  nutrition: { name: 'Alimentación', icon: 'leaf', color: 'green' },
  general: { name: 'Actividad', icon: 'check', color: 'pink' },
};
export const FREQUENCIES = { daily: 'Todos los días', weekdays: 'Lunes a viernes', weekly: 'Días específicos', once: 'Una vez' };
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export function taskDue(task, day) {
  if (day < task.start_date || (task.end_date && day > task.end_date)) return false;
  // Con histórico, la actividad se decide por fecha, no por el estado actual.
  if (Array.isArray(task.active_periods)) {
    if (!task.active_periods.some(p => day >= p.from && (!p.to || day <= p.to))) return false;
  } else if (!task.active || task.archived_at) return false;
  const jsDay = new Date(`${day}T12:00:00Z`).getUTCDay();
  const weekday = jsDay || 7;
  if (task.frequency === 'daily') return true;
  if (task.frequency === 'weekdays') return weekday <= 5;
  if (task.frequency === 'weekly') return (task.days_of_week || []).includes(weekday);
  return task.frequency === 'once' && day === task.start_date;
}
export function adherence(tasks, completions, dates) {
  const days = dates.map(date => {
    const scheduled = tasks.filter(t => taskDue(t, date));
    const completed = scheduled.filter(t => completions.some(c => c.task_id === t.id && c.completion_date === date && c.completed)).length;
    return { date, scheduled: scheduled.length, completed, score: scheduled.length ? Math.round(completed / scheduled.length * 100) : null };
  });
  const total = days.reduce((n, d) => n + d.scheduled, 0);
  const completed = days.reduce((n, d) => n + d.completed, 0);
  return { days, total, completed, score: total ? Math.round(completed / total * 100) : null };
}
export function validateTask(task) {
  if (!task.title?.trim()) return 'Escribe el nombre de la actividad.';
  if (task.title.length > 160) return 'El nombre admite hasta 160 caracteres.';
  if (!TASK_TYPES[task.task_type] || !FREQUENCIES[task.frequency]) return 'Selecciona un tipo y una frecuencia válidos.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.start_date || '')) return 'Selecciona la fecha de inicio.';
  if (task.end_date && task.end_date < task.start_date) return 'El término debe ser igual o posterior al inicio.';
  if (task.frequency === 'weekly' && !task.days_of_week?.length) return 'Selecciona al menos un día.';
  if (task.task_type === 'measurement' && !task.measurement_unit?.trim()) return 'Indica la unidad de la medición.';
  return '';
}
export function validateProfile(form) {
  if (!form.full_name?.trim() || form.full_name.length > 120) return 'Ingresa un nombre de hasta 120 caracteres.';
  for (const [key, name, min, max] of [['age', 'Edad', 1, 120], ['weight', 'Peso', 1, 500], ['height', 'Estatura', 30, 260], ['body_fat', 'Grasa corporal', 1, 80]]) {
    if (form[key] !== '' && form[key] != null && (!Number.isFinite(Number(form[key])) || Number(form[key]) < min || Number(form[key]) > max)) return `${name}: ingresa un valor entre ${min} y ${max}.`;
  }
  return '';
}
