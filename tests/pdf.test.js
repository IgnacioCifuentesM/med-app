import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPatientPdf } from '../src/lib/patientPdf.js';
import { createDemo } from '../src/lib/demo.js';

const fontBase64 = readFileSync(
  new URL('../src/assets/fonts/DejaVuSans.ttf', import.meta.url),
).toString('base64');
test('Exporta PDF paginado con fuente Unicode y notas extensas sin mutar datos', () => {
  const demo = createDemo();
  const profile = demo.profiles.find((person) => person.id === 'demo-patient');
  const data = {
    profile,
    professionals: demo.profiles.filter((person) => person.role === 'doctor'),
    relationships: demo.doctor_patients.filter((row) => row.patient_id === profile.id),
    records: demo.pillar_records.filter((row) => row.user_id === profile.id),
    tasks: demo.tasks.filter((row) => row.patient_id === profile.id),
    completions: demo.task_completions.filter((row) => row.patient_id === profile.id),
    measurements: demo.profile_measurements.filter((row) => row.patient_id === profile.id),
    consents: [],
  };
  data.records[0].data.values.note = 'Nota de prueba: áéíóú ñ ¿cómo estás? '.repeat(28);
  const snapshot = JSON.stringify(data);
  const doc = createPatientPdf(data, { fontBase64, generatedAt: new Date('2026-09-24T15:00:00Z') });
  const bytes = Buffer.from(doc.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(doc.getNumberOfPages() > 2);
  assert.ok(bytes.includes(Buffer.from('/FontFile2')));
  assert.ok(bytes.includes(Buffer.from('/ToUnicode')));
  assert.equal(JSON.stringify(data), snapshot);
});
test('El PDF admite una cuenta sin historial y exige la tipografía para evitar texto roto', () => {
  const data = { profile: { full_name: 'Ana Muñoz', timezone: 'America/Santiago' } };
  const doc = createPatientPdf(data, { fontBase64 });
  assert.ok(doc.getNumberOfPages() >= 1);
  assert.throws(() => createPatientPdf(data), /tipografía/);
});
