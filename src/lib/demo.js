import { addDays, dateKey, PILLARS, scorePillar, taskDue } from './domain.js';

export function createDemo() {
  const today = dateKey();
  const profiles = [
    {
      id: 'demo-patient',
      full_name: 'Antonia Martínez',
      email: 'antonia@ejemplo.test',
      role: 'patient',
      age: 32,
      sex: 'F',
      weight: 64,
      height: 165,
      body_fat: null,
      onboarding_done: true,
    },
    {
      id: 'demo-patient-2',
      full_name: 'Javier Fuentes',
      email: 'javier@ejemplo.test',
      role: 'patient',
      age: 45,
      weight: 82,
      height: 178,
      onboarding_done: true,
    },
    {
      id: 'demo-patient-3',
      full_name: 'Camila Rojas',
      email: 'camila@ejemplo.test',
      role: 'patient',
      age: 28,
      weight: 58,
      height: 162,
      onboarding_done: true,
    },
    {
      id: 'demo-patient-4',
      full_name: 'Diego Silva',
      email: 'diego@ejemplo.test',
      role: 'patient',
      age: 51,
      weight: 78,
      height: 173,
      onboarding_done: true,
    },
    {
      id: 'demo-doctor-2',
      full_name: 'Pablo Muñoz',
      email: 'pablo@ejemplo.test',
      role: 'doctor',
      onboarding_done: true,
    },
    {
      id: 'demo-doctor',
      full_name: 'Daniela Herrera',
      email: 'daniela@ejemplo.test',
      role: 'doctor',
      onboarding_done: true,
    },
  ].map((p) => ({ timezone: 'America/Santiago', ...p }));
  const doctor_patients = profiles
    .filter((p) => p.role === 'patient')
    .map((p) => ({ patient_id: p.id, doctor_id: 'demo-doctor' }));
  doctor_patients.push({ patient_id: 'demo-patient', doctor_id: 'demo-doctor-2' });
  const pillar_records = [];
  profiles
    .filter((p) => p.role === 'patient')
    .forEach((person, personIndex) => {
      for (let offset = 27; offset >= 0; offset--) {
        if (personIndex === 3 || (personIndex === 1 && offset < 4)) continue;
        PILLARS.forEach((p, index) => {
          if (offset === 0 && index > 1) return;
          const quality = 5 + ((offset + index + personIndex) % 4);
          const valuesByPillar = {
            nutricion: { portions: 3 + (offset % 3), quality, water: 6 },
            actividad: {
              steps: 4200 + (27 - offset) * 110,
              minutes: 15 + (offset % 4) * 5,
              intensity: 5,
            },
            sueno: { hours: 7.5, quality, bedtime: '23:00' },
            sustancias: { cigarettes: 0, alcohol: offset % 7 === 0 ? 1 : 0 },
            estres: { stress: 10 - quality, minutes: 10 },
            conexion: { connection: quality, minutes: 30 },
          };
          const values = valuesByPillar[p.key];
          pillar_records.push({
            id: `record-${person.id}-${offset}-${index}`,
            user_id: person.id,
            date: addDays(today, -offset),
            pillar: p.key,
            score: scorePillar(p.key, values),
            data: { version: 2, values },
            updated_at: new Date().toISOString(),
          });
        });
      }
    });
  const tasks = profiles
    .filter((p) => p.role === 'patient')
    .flatMap((p) =>
      [
        {
          id: `walk-${p.id}`,
          task_type: 'exercise',
          title: 'Salir a caminar',
          description: 'Un momento al aire libre, a tu ritmo.',
          task_time: '08:30',
          instructions: 'Plan de demostración · 20 minutos',
          frequency: 'daily',
        },
        {
          id: `food-${p.id}`,
          task_type: 'nutrition',
          title: 'Sumar color a tu almuerzo',
          description: 'Registra cómo estuvo tu alimentación.',
          task_time: '13:00',
          frequency: 'daily',
        },
        {
          id: `pause-${p.id}`,
          task_type: 'general',
          title: 'Tu pausa de la tarde',
          description: 'Busca un lugar tranquilo y dedica unos minutos a respirar.',
          task_time: '18:00',
          frequency: 'weekdays',
        },
      ].map((t) => ({
        ...t,
        patient_id: p.id,
        doctor_id: 'demo-doctor',
        start_date: addDays(today, -27),
        end_date: null,
        active: true,
        active_periods: [{ from: addDays(today, -27), to: null }],
        archived_at: null,
        days_of_week: [],
        created_at: new Date().toISOString(),
      })),
    );
  const task_completions = [];
  tasks.forEach((task, index) => {
    for (let offset = 13; offset >= 0; offset--) {
      const day = addDays(today, -offset);
      if (taskDue(task, day) && (offset > 0 ? (offset + index) % 6 !== 0 : index % 3 === 0)) {
        task_completions.push({
          id: `completion-${task.id}-${day}`,
          task_id: task.id,
          patient_id: task.patient_id,
          completion_date: day,
          completed: true,
          completed_at: new Date().toISOString(),
        });
      }
    }
  });
  const profile_measurements = profiles
    .filter((p) => p.role === 'patient')
    .map((p) => ({
      id: crypto.randomUUID(),
      patient_id: p.id,
      weight: p.weight,
      height: p.height,
      body_fat: p.body_fat ?? null,
      recorded_at: new Date().toISOString(),
      source: 'baseline',
    }));
  return {
    profile_measurements,
    sharing_consents: [],
    version: 3,
    generated: today,
    profiles,
    doctor_patients,
    pillar_records,
    tasks,
    task_completions,
  };
}
