import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

test('Vitalia 2 se actualiza a 3 conservando el vínculo y las medidas originales', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/202609220001_vitalia_v2.sql', import.meta.url),
      'utf8',
    ),
  );
  const patient = '10000000-0000-0000-0000-000000000001',
    doctor = '20000000-0000-0000-0000-000000000001',
    second = '20000000-0000-0000-0000-000000000002';
  for (const id of [patient, doctor, second])
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, id + '@example.test']);
  await db.query("update public.profiles set role='doctor' where id=any($1::uuid[])", [
    [doctor, second],
  ]);
  await db.query('update public.profiles set weight=70 where id=$1', [patient]);
  await db.query('insert into public.doctor_patients(doctor_id,patient_id) values($1,$2)', [
    doctor,
    patient,
  ]);
  await assert.rejects(
    db.query('insert into public.doctor_patients(doctor_id,patient_id) values($1,$2)', [
      second,
      patient,
    ]),
    /unique/,
  );
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/202609230001_vitalia_v3.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.query('insert into public.doctor_patients(doctor_id,patient_id) values($1,$2)', [
    second,
    patient,
  ]);
  assert.equal((await db.query('select * from public.doctor_patients')).rows.length, 2);
  assert.equal(
    Number((await db.query('select weight from public.profile_measurements')).rows[0].weight),
    70,
  );
  assert.equal(
    (await db.query('select * from public.sharing_consents')).rows.length,
    0,
    'No se inventa consentimiento para datos heredados',
  );
});
