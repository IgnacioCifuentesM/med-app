import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/lib/api.js';
import { createDemo } from '../src/lib/demo.js';
import { CONSENT_VERSION } from '../src/lib/consent.js';
import { dateKey, taskDue } from '../src/lib/domain.js';

test('La demo antigua se actualiza sin perder registros y conserva varios médicos', async () => {
  const saved = createDemo();
  saved.version = 2;
  saved.profiles = saved.profiles.filter((p) => p.id !== 'demo-doctor-2');
  saved.doctor_patients = saved.doctor_patients.filter((r) => r.doctor_id !== 'demo-doctor-2');
  const store = new Map([['vitalia-demo-v2', JSON.stringify(saved)]]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
  });
  try {
    const api = createApi(true);
    assert.equal((await api.doctors()).length, 2);
    const profile = await api.profile('demo-patient');
    await assert.rejects(
      api.saveProfile(profile.id, profile, ['demo-doctor', 'demo-doctor-2']),
      /compartir/,
    );
    await api.saveProfile(
      profile.id,
      { ...profile, weight: 66 },
      ['demo-doctor', 'demo-doctor-2'],
      CONSENT_VERSION,
    );
    assert.equal((await api.relationships(profile.id)).length, 2);
    assert.equal((await api.consents(profile.id)).length, 2);
    await api.saveProfile(profile.id, { ...profile, weight: 66 }, ['demo-doctor-2']);
    const data = await api.patientData(profile.id, '1900-01-01', '9999-12-31');
    assert.equal(
      data.records.length,
      saved.pillar_records.filter((r) => r.user_id === profile.id).length,
    );
    assert.ok(data.tasks.every((t) => !t.active && taskDue(t, dateKey())));
    const exported = await api.exportPatient(profile.id);
    assert.equal(exported.relationships.length, 1);
    assert.ok(exported.measurements.some((m) => m.weight === 66));
    assert.ok(exported.consents.some((c) => c.revoked_at));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
