import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';
import { createApi } from '../src/lib/api.js';

test('El perfil pagina todos sus médicos en una tabla heredada sin id', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table doctor_patients (
      patient_id text not null, doctor_id text not null,
      primary key(patient_id,doctor_id)
    );
    insert into doctor_patients
      select 'patient-a','doctor-' || lpad(n::text,4,'0') from generate_series(1,501) n;
    insert into doctor_patients values('patient-b','doctor-other');
    create table sharing_consents(id text primary key,patient_id text);
    insert into sharing_consents values('consent-1','patient-a');
  `);
  const requests = [];
  const client = createClient('https://test.supabase.co', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(input);
        const table = url.pathname.split('/').at(-1);
        const order = url.searchParams.get('order').split('.')[0];
        assert.ok(['doctor_patients', 'sharing_consents'].includes(table));
        assert.ok(['id', 'doctor_id'].includes(order));
        const patient = url.searchParams.get('patient_id').slice(3);
        const offset = Number(url.searchParams.get('offset') || 0);
        const limit = Number(url.searchParams.get('limit'));
        requests.push({ table, order, offset });
        try {
          const result = await db.query(
            `select * from ${table} where patient_id=$1 order by ${order} limit $2 offset $3`,
            [patient, limit, offset],
          );
          return new Response(JSON.stringify(result.rows), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          return new Response(JSON.stringify({ code: error.code, message: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  });
  const api = createApi(false, client);
  const links = await api.relationships('patient-a');
  assert.equal(links.length, 501);
  assert.equal(new Set(links.map((link) => link.doctor_id)).size, 501);
  assert.ok(links.every((link) => link.patient_id === 'patient-a'));
  assert.equal(links[0].doctor_id, 'doctor-0001');
  assert.equal(links.at(-1).doctor_id, 'doctor-0501');
  assert.deepEqual(
    requests.map((request) => request.offset),
    [0, 500],
  );
  assert.deepEqual(await api.relationships('unknown-patient'), []);
  assert.equal((await api.consents('patient-a'))[0].id, 'consent-1');
  assert.equal(requests.at(-1).order, 'id', 'Las otras tablas conservan su orden por id');
});
