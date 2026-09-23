import { supabase } from '../supabase.js';
import { createDemo } from './demo.js';
import {
  addDays,
  dateKey,
  scorePillar,
  validateTask,
  validateProfile,
  PILLARS,
  validatePillar,
  habitSummary,
  daysBetween,
} from './domain.js';
import { CONSENT_VERSION, CONSENT_TEXT } from './consent.js';
const DEMO_KEY = 'vitalia-demo-v2';
export function friendlyError(error) {
  const text = error?.message || '';
  if (/Invalid login credentials/i.test(text)) return 'El correo o la contraseña no son correctos.';
  if (/Email not confirmed/i.test(text)) return 'Confirma tu correo antes de entrar.';
  if (/rate limit|too many/i.test(text))
    return 'Hay demasiados intentos. Espera unos minutos y vuelve a intentar.';
  if (/fetch|network|timeout|abort/i.test(text))
    return 'No pudimos conectar. Revisa tu conexión y vuelve a intentar.';
  if (error?.code === '23505')
    return 'Ese registro ya existe. Actualiza la página e inténtalo nuevamente.';
  if (error?.code === '42501') return 'Tu cuenta no tiene permiso para realizar esta acción.';
  if (/Consent required/.test(text))
    return 'Confirma que aceptas compartir tus datos con los profesionales seleccionados.';
  if (/Only the last 30 days/.test(text))
    return 'Solo puedes editar registros de los últimos 30 días.';
  if (/Task has ended|Task already archived/.test(text))
    return 'Esta actividad ya terminó o fue archivada. Crea una nueva indicación.';
  if (/Invalid pillar|Invalid profile|Invalid task|Invalid weekdays/.test(text))
    return 'Revisa los valores y las fechas del formulario.';
  if (/PGRST202|PGRST204|42P01|42703/.test(error?.code || ''))
    return 'Es necesario actualizar la base de datos. Contacta al administrador para completar la actualización de Vitalia.';
  if (error?.safe) return text;
  return 'No se pudo completar la operación. Tus cambios no se han confirmado. Inténtalo nuevamente.';
}
export function fail(message) {
  const error = new Error(message);
  error.safe = true;
  throw error;
}
export async function checked(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export function createApi(demo = false) {
  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(DEMO_KEY));
      if (data?.version === 2) {
        const secondDoctor = createDemo().profiles.find((p) => p.id === 'demo-doctor-2');
        if (!data.profiles.some((p) => p.id === secondDoctor.id)) data.profiles.push(secondDoctor);
        data.sharing_consents ||= [];
        data.profile_measurements ||= [];
        data.version = 3;
        localStorage.setItem(DEMO_KEY, JSON.stringify(data));
      }
      if (data?.version === 3) return data;
    } catch {
      /* Recreate a corrupt demo only. */
    }
    const data = createDemo();
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    return data;
  }
  async function mutate(fn) {
    const data = read();
    const result = fn(data);
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    return structuredClone(result ?? null);
  }
  async function paged(table, configure) {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      const rows = await checked(
        configure(supabase.from(table).select('*'))
          .order('id')
          .range(offset, offset + 499),
      );
      all.push(...rows);
      if (rows.length < 500) return all;
    }
  }
  return {
    demo,
    async ready() {
      if (demo) return true;
      const version = await checked(supabase.rpc('vitalia_status'));
      if (version < 3)
        fail('Es necesario actualizar la base de datos a Vitalia 3. Contacta al administrador.');
      return true;
    },
    async profile(id) {
      const p = demo
        ? read().profiles.find((p) => p.id === id)
        : await checked(supabase.from('profiles').select('*').eq('id', id).maybeSingle());
      if (!p)
        fail('No se encontró tu perfil. Pide al administrador que revise el alta de tu cuenta.');
      if (!['patient', 'doctor'].includes(p.role))
        fail('Tu cuenta todavía no tiene un rol autorizado.');
      return p;
    },
    async doctors() {
      return demo
        ? read()
            .profiles.filter((p) => p.role === 'doctor')
            .map(({ id, full_name }) => ({ id, full_name }))
        : checked(supabase.rpc('vitalia_doctors'));
    },
    async relationships(id) {
      if (demo) return read().doctor_patients.filter((r) => r.patient_id === id);
      return paged('doctor_patients', (q) => q.eq('patient_id', id));
    },
    async consents(id) {
      if (demo) return (read().sharing_consents || []).filter((c) => c.patient_id === id);
      return paged('sharing_consents', (q) => q.eq('patient_id', id));
    },
    async measurements(id) {
      if (demo) return (read().profile_measurements || []).filter((m) => m.patient_id === id);
      return paged('profile_measurements', (q) => q.eq('patient_id', id));
    },
    async patientData(id, from, to) {
      if (demo) {
        const d = read();
        return {
          records: d.pillar_records.filter(
            (r) => r.user_id === id && r.date >= from && r.date <= to,
          ),
          tasks: d.tasks.filter((t) => t.patient_id === id),
          completions: d.task_completions.filter(
            (c) => c.patient_id === id && c.completion_date >= from && c.completion_date <= to,
          ),
        };
      }
      const [records, tasks, completions] = await Promise.all([
        paged('pillar_records', (q) => q.eq('user_id', id).gte('date', from).lte('date', to)),
        paged('tasks', (q) => q.eq('patient_id', id)),
        paged('task_completions', (q) =>
          q.eq('patient_id', id).gte('completion_date', from).lte('completion_date', to),
        ),
      ]);
      return { records, tasks, completions };
    },
    async patients(doctorId) {
      if (demo) {
        const d = read();
        const ids = d.doctor_patients
          .filter((r) => r.doctor_id === doctorId)
          .map((r) => r.patient_id);
        return d.profiles.filter((p) => ids.includes(p.id));
      }
      return checked(supabase.rpc('vitalia_patients'));
    },
    async doctorOverview(doctorId, search = '', filter = 'all', offset = 0, size = 10) {
      if (!demo)
        return checked(
          supabase.rpc('vitalia_patient_page', {
            search_text: search,
            activity_filter: filter,
            page_offset: offset,
            page_size: size,
          }),
        );
      const d = read();
      const patients = await this.patients(doctorId);
      const all = patients.map((profile) => {
        const today = dateKey(new Date(), profile.timezone);
        const records = d.pillar_records.filter(
          (r) => r.user_id === profile.id && r.date >= addDays(today, -29) && r.date <= today,
        );
        const last =
          records
            .map((r) => r.date)
            .sort()
            .at(-1) || null;
        return {
          profile,
          last,
          inactive: !last || daysBetween(last, today) >= 3,
          summary: habitSummary(records.filter((r) => r.date >= addDays(today, -6))),
        };
      });
      const normalize = (s) =>
        s
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
      const filtered = all
        .filter(
          (p) =>
            normalize(p.profile.full_name + ' ' + (p.profile.email || '')).includes(
              normalize(search),
            ) &&
            (filter === 'all' || (filter === 'followup' ? p.inactive : !p.inactive)),
        )
        .sort(
          (a, b) =>
            Number(b.inactive) - Number(a.inactive) ||
            a.profile.full_name.localeCompare(b.profile.full_name) ||
            a.profile.id.localeCompare(b.profile.id),
        );
      return {
        items: filtered.slice(offset, offset + size),
        total: filtered.length,
        total_patients: all.length,
        followup_count: all.filter((p) => p.inactive).length,
      };
    },
    async saveProfile(id, form, doctorIds, consentVersion) {
      const error = validateProfile(form);
      if (error) fail(error);
      const patch = { full_name: form.full_name.trim(), onboarding_done: true };
      for (const key of ['age', 'weight', 'height', 'body_fat'])
        patch[key] = form[key] === '' || form[key] == null ? null : Number(form[key]);
      if (demo)
        return mutate((d) => {
          const index = d.profiles.findIndex((p) => p.id === id);
          const previous = d.profiles[index];
          const now = new Date().toISOString();
          d.sharing_consents ||= [];
          d.profile_measurements ||= [];
          if (doctorIds !== undefined) {
            if (
              previous.role !== 'patient' ||
              doctorIds.some(
                (doctorId) => !d.profiles.some((p) => p.id === doctorId && p.role === 'doctor'),
              )
            )
              fail('Profesional no disponible.');
            if (
              doctorIds.some(
                (doctorId) =>
                  !d.sharing_consents.some(
                    (c) => c.patient_id === id && c.doctor_id === doctorId && !c.revoked_at,
                  ),
              ) &&
              consentVersion !== CONSENT_VERSION
            )
              fail('Confirma que aceptas compartir tus datos.');
            const removed = d.doctor_patients
              .filter((r) => r.patient_id === id && !doctorIds.includes(r.doctor_id))
              .map((r) => r.doctor_id);
            const today = dateKey(new Date(), previous.timezone);
            d.tasks
              .filter((t) => t.patient_id === id && removed.includes(t.doctor_id) && t.active)
              .forEach((t) => {
                t.active = false;
                t.active_periods = (t.active_periods || [{ from: t.start_date, to: null }]).map(
                  (p) => ({ ...p, to: p.to || today }),
                );
              });
            d.sharing_consents
              .filter((c) => c.patient_id === id && removed.includes(c.doctor_id) && !c.revoked_at)
              .forEach((c) => {
                c.revoked_at = now;
              });
            d.doctor_patients = d.doctor_patients.filter((r) => r.patient_id !== id);
            [...new Set(doctorIds)].forEach((doctorId) => {
              d.doctor_patients.push({ patient_id: id, doctor_id: doctorId });
              if (
                !d.sharing_consents.some(
                  (c) => c.patient_id === id && c.doctor_id === doctorId && !c.revoked_at,
                )
              )
                d.sharing_consents.push({
                  id: crypto.randomUUID(),
                  patient_id: id,
                  doctor_id: doctorId,
                  text_version: CONSENT_VERSION,
                  accepted_text: CONSENT_TEXT,
                  accepted_at: now,
                  revoked_at: null,
                });
            });
          }
          if (
            previous.role === 'patient' &&
            ['weight', 'height', 'body_fat'].some((k) => (previous[k] ?? null) !== patch[k])
          )
            d.profile_measurements.push({
              id: crypto.randomUUID(),
              patient_id: id,
              recorded_at: now,
              weight: patch.weight,
              height: patch.height,
              body_fat: patch.body_fat,
              source: 'profile',
            });
          d.profiles[index] = { ...previous, ...patch };
          return d.profiles[index];
        });
      return checked(
        supabase.rpc('vitalia_save_profile_v3', {
          payload: patch,
          selected_doctors: doctorIds ?? null,
          consent_version: consentVersion || null,
        }),
      );
    },
    async savePillar(id, date, key, values) {
      const p = PILLARS.find((p) => p.key === key);
      if (!p) fail('Pilar desconocido.');
      const error = validatePillar(p, values);
      if (error) fail(error);
      const person = await this.profile(id);
      const today = dateKey(new Date(), person.timezone);
      if (date < addDays(today, -29) || date > today)
        fail('Solo puedes editar registros de los últimos 30 días.');
      values = {
        ...values,
        ...Object.fromEntries(
          p.fields.filter((f) => f.type === 'number').map((f) => [f.key, Number(values[f.key])]),
        ),
      };
      const row = {
        user_id: id,
        date,
        pillar: key,
        data: { version: 2, values },
        score: scorePillar(key, values),
      };
      if (demo)
        return mutate((d) => {
          const existing = d.pillar_records.find(
            (r) => r.user_id === id && r.date === date && r.pillar === key,
          );
          if (existing) Object.assign(existing, row);
          else d.pillar_records.push({ id: crypto.randomUUID(), ...row });
          return row;
        });
      return checked(
        supabase
          .from('pillar_records')
          .upsert(row, { onConflict: 'user_id,date,pillar' })
          .select()
          .single(),
      );
    },
    async completeTask(task, day, completed, details = {}) {
      const row = {
        task_id: task.id,
        patient_id: task.patient_id,
        completion_date: day,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        note: details.note ?? null,
        measurement_value: details.measurement_value ?? null,
      };
      if (demo)
        return mutate((d) => {
          const existing = d.task_completions.find(
            (c) => c.task_id === task.id && c.completion_date === day,
          );
          if (existing) Object.assign(existing, row);
          else d.task_completions.push({ id: crypto.randomUUID(), ...row });
          return row;
        });
      return checked(
        supabase
          .from('task_completions')
          .upsert(row, { onConflict: 'task_id,completion_date' })
          .select()
          .single(),
      );
    },
    async addTask(doctorId, patientId, task) {
      const error = validateTask(task);
      if (error) fail(error);
      const row = {
        ...task,
        title: task.title.trim(),
        patient_id: patientId,
        doctor_id: doctorId,
        end_date: task.end_date || null,
        task_time: task.task_time || null,
        days_of_week: task.frequency === 'weekly' ? task.days_of_week : [],
        active: true,
        active_periods: [{ from: task.start_date, to: null }],
      };
      if (demo)
        return mutate((d) => {
          const saved = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
          d.tasks.push(saved);
          return saved;
        });
      return checked(supabase.from('tasks').insert(row).select().single());
    },
    // Pausa/archivo al finalizar hoy: conserva la obligación y el cumplimiento del día.
    async taskStatus(task, action, today, doctorId) {
      if (!['pause', 'resume', 'archive'].includes(action)) fail('Acción desconocida.');
      if (doctorId !== task.doctor_id)
        fail('Solo el profesional que creó la actividad puede modificarla.');
      if (demo)
        return mutate((d) => {
          const target = d.tasks.find((t) => t.id === task.id);
          const periods = structuredClone(target.active_periods || []);
          if (target.archived_at) fail('Una actividad archivada no puede modificarse.');
          if (action === 'resume' && target.end_date && target.end_date < today)
            fail('La actividad ya terminó.');
          if (action === 'resume') {
            if (target.archived_at) fail('Una actividad archivada no puede reactivarse.');
            if (!periods.some((p) => !p.to))
              periods.push({
                from: today < target.start_date ? target.start_date : today,
                to: null,
              });
          } else
            periods.forEach((p) => {
              if (!p.to) p.to = today;
            });
          Object.assign(target, {
            active: action === 'resume',
            active_periods: periods,
            archived_at: action === 'archive' ? new Date().toISOString() : null,
          });
          return target;
        });
      return checked(supabase.rpc('vitalia_task_status', { target_task: task.id, action }));
    },
    async resetDemo() {
      if (demo) localStorage.removeItem(DEMO_KEY);
    },
    async exportPatient(id) {
      return {
        profile: await this.profile(id),
        relationships: await this.relationships(id),
        consents: await this.consents(id),
        measurements: await this.measurements(id),
        ...(await this.patientData(id, '1900-01-01', '9999-12-31')),
      };
    },
  };
}
