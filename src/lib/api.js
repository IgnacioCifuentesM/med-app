import { supabase } from '../supabase.js';
import { createDemo } from './demo.js';
import { addDays, dateKey, scorePillar, validateTask, validateProfile, PILLARS, validatePillar } from './domain.js';
const DEMO_KEY = 'vitalia-demo-v2';
export function friendlyError(error) {
  const text = error?.message || '';
  if (/Invalid login credentials/i.test(text)) return 'El correo o la contraseña no son correctos.';
  if (/Email not confirmed/i.test(text)) return 'Confirma tu correo antes de entrar.';
  if (/rate limit|too many/i.test(text)) return 'Hay demasiados intentos. Espera unos minutos y vuelve a intentar.';
  if (/fetch|network|timeout|abort/i.test(text)) return 'No pudimos conectar. Revisa tu conexión y vuelve a intentar.';
  if (error?.code === '23505') return 'Ese registro ya existe. Actualiza la página e inténtalo nuevamente.';
  if (error?.code === '42501') return 'Tu cuenta no tiene permiso para realizar esta acción.';
  if (/PGRST202|PGRST204|42P01|42703/.test(error?.code || '')) return 'La base de datos necesita la migración de Vitalia 2. Consulta la guía de instalación.';
  if (error?.safe) return text;
  return 'No se pudo completar la operación. Tus cambios no se han confirmado. Inténtalo nuevamente.';
}
export function fail(message) { const error = new Error(message); error.safe = true; throw error; }
export async function checked(query) { const { data, error } = await query; if (error) throw error; return data; }
export function createApi(demo = false) {
  function read() {
    try { const data = JSON.parse(localStorage.getItem(DEMO_KEY)); if (data?.version === 2) return data; } catch { /* Recreate a corrupt demo only. */ }
    const data = createDemo(); localStorage.setItem(DEMO_KEY, JSON.stringify(data)); return data;
  }
  async function mutate(fn) { const data = read(); const result = fn(data); localStorage.setItem(DEMO_KEY, JSON.stringify(data)); return structuredClone(result ?? null); }
  async function paged(table, configure) {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      const rows = await checked(configure(supabase.from(table).select('*')).order('id').range(offset, offset + 499));
      all.push(...rows); if (rows.length < 500) return all;
    }
  }
  return {
    demo,
    async ready() { return demo ? true : checked(supabase.rpc('vitalia_status')); },
    async profile(id) {
      const p = demo ? read().profiles.find(p => p.id === id) : await checked(supabase.from('profiles').select('*').eq('id', id).maybeSingle());
      if (!p) fail('No se encontró tu perfil. Pide al administrador que revise el alta de tu cuenta.');
      if (!['patient', 'doctor'].includes(p.role)) fail('Tu cuenta todavía no tiene un rol autorizado.'); return p;
    },
    async doctors() { return demo ? read().profiles.filter(p => p.role === 'doctor').map(({ id, full_name }) => ({ id, full_name })) : checked(supabase.rpc('vitalia_doctors')); },
    async relationship(id) {
      if (demo) return read().doctor_patients.find(r => r.patient_id === id) || null;
      const rows = await checked(supabase.from('doctor_patients').select('doctor_id,patient_id').eq('patient_id', id).limit(2));
      if (rows.length > 1) fail('Tu cuenta tiene más de un médico asociado. Pide al administrador que revise la vinculación antes de cambiarla.'); return rows[0] || null;
    },
    async patientData(id, from, to) {
      if (demo) { const d = read(); return { records: d.pillar_records.filter(r => r.user_id === id && r.date >= from && r.date <= to), tasks: d.tasks.filter(t => t.patient_id === id), completions: d.task_completions.filter(c => c.patient_id === id && c.completion_date >= from && c.completion_date <= to) }; }
      const [records, tasks, completions] = await Promise.all([
        paged('pillar_records', q => q.eq('user_id', id).gte('date', from).lte('date', to)),
        paged('tasks', q => q.eq('patient_id', id)),
        paged('task_completions', q => q.eq('patient_id', id).gte('completion_date', from).lte('completion_date', to)),
      ]); return { records, tasks, completions };
    },
    async patients(doctorId) {
      if (demo) { const d = read(); const ids = d.doctor_patients.filter(r => r.doctor_id === doctorId).map(r => r.patient_id); return d.profiles.filter(p => ids.includes(p.id)); }
      return checked(supabase.rpc('vitalia_patients'));
    },
    async doctorOverview(doctorId, from, to) {
      const patients = await this.patients(doctorId); if (!patients.length) return [];
      if (demo) { const d = read(); return patients.map(profile => ({ profile, records: d.pillar_records.filter(r => r.user_id === profile.id && r.date >= from && r.date <= to) })); }
      const records = await paged('pillar_records', q => q.in('user_id', patients.map(p => p.id)).gte('date', from).lte('date', to));
      return patients.map(profile => ({ profile, records: records.filter(r => r.user_id === profile.id) }));
    },
    async saveProfile(id, form, doctorId) {
      const error = validateProfile(form); if (error) fail(error);
      const patch = { full_name: form.full_name.trim(), onboarding_done: true };
      for (const key of ['age', 'weight', 'height', 'body_fat']) patch[key] = form[key] === '' || form[key] == null ? null : Number(form[key]);
      if (demo) return mutate(d => {
        const index = d.profiles.findIndex(p => p.id === id); d.profiles[index] = { ...d.profiles[index], ...patch };
        if (doctorId !== undefined) { d.doctor_patients = d.doctor_patients.filter(r => r.patient_id !== id); if (doctorId) d.doctor_patients.push({ patient_id: id, doctor_id: doctorId }); }
        return d.profiles[index];
      });
      return checked(supabase.rpc('vitalia_save_profile', { payload: patch, selected_doctor: doctorId || null, change_doctor: doctorId !== undefined }));
    },
    async savePillar(id, date, key, values) {
      const p = PILLARS.find(p => p.key === key); if (!p) fail('Pilar desconocido.');
      const error = validatePillar(p, values); if (error) fail(error);
      const row = { user_id: id, date, pillar: key, data: { version: 2, values }, score: scorePillar(key, values) };
      if (demo) return mutate(d => { const existing = d.pillar_records.find(r => r.user_id === id && r.date === date && r.pillar === key); if (existing) Object.assign(existing, row); else d.pillar_records.push({ id: crypto.randomUUID(), ...row }); return row; });
      return checked(supabase.from('pillar_records').upsert(row, { onConflict: 'user_id,date,pillar' }).select().single());
    },
    async completeTask(task, day, completed, details = {}) {
      const row = { task_id: task.id, patient_id: task.patient_id, completion_date: day, completed, completed_at: completed ? new Date().toISOString() : null, ...details };
      if (demo) return mutate(d => { const existing = d.task_completions.find(c => c.task_id === task.id && c.completion_date === day); if (existing) Object.assign(existing, row); else d.task_completions.push({ id: crypto.randomUUID(), ...row }); return row; });
      return checked(supabase.from('task_completions').upsert(row, { onConflict: 'task_id,completion_date' }).select().single());
    },
    async addTask(doctorId, patientId, task) {
      const error = validateTask(task); if (error) fail(error);
      const row = { ...task, title: task.title.trim(), patient_id: patientId, doctor_id: doctorId, end_date: task.end_date || null, task_time: task.task_time || null, days_of_week: task.frequency === 'weekly' ? task.days_of_week : [], active: true, active_periods: [{ from: task.start_date, to: null }] };
      if (demo) return mutate(d => { const saved = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }; d.tasks.push(saved); return saved; });
      return checked(supabase.from('tasks').insert(row).select().single());
    },
    // Pausa/archivo al finalizar hoy: conserva la obligación y el cumplimiento del día.
    async taskStatus(task, action, today) {
      if (!['pause', 'resume', 'archive'].includes(action)) fail('Acción desconocida.');
      if (demo) return mutate(d => {
        const target = d.tasks.find(t => t.id === task.id); const periods = structuredClone(target.active_periods || []);
        if (action === 'resume') {
          if (target.archived_at) fail('Una actividad archivada no puede reactivarse.');
          if (!periods.some(p => !p.to)) periods.push({ from: today < target.start_date ? target.start_date : today, to: null });
        } else periods.forEach(p => { if (!p.to) p.to = today; });
        Object.assign(target, { active: action === 'resume', active_periods: periods, archived_at: action === 'archive' ? new Date().toISOString() : null }); return target;
      });
      return checked(supabase.rpc('vitalia_task_status', { target_task: task.id, action }));
    },
    async resetDemo() { if (demo) localStorage.removeItem(DEMO_KEY); },
    async exportPatient(id) { return { profile: await this.profile(id), ...await this.patientData(id, '1900-01-01', addDays(dateKey(), 1)) }; },
  };
}
