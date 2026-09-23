import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { installerSql } from '../scripts/build-sql.js';
import { createDemo } from '../src/lib/demo.js';
import { readFileSync } from 'node:fs';
import { CONSENT_VERSION } from '../src/lib/consent.js';

test('Migración, permisos, equipos y registros en PostgreSQL', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
  `);
  const sql = installerSql();
  assert.equal(
    readFileSync(new URL('../supabase/INSTALAR_VITALIA.sql', import.meta.url), 'utf8').replace(
      /\r\n/g,
      '\n',
    ),
    sql,
    'El instalador debe regenerarse si cambia una migración',
  );
  await db.exec(sql);
  const patient = '10000000-0000-0000-0000-000000000001';
  const outsider = '10000000-0000-0000-0000-000000000002';
  const doctorA = '20000000-0000-0000-0000-000000000001';
  const doctorB = '20000000-0000-0000-0000-000000000002';
  for (const [id, name] of [
    [patient, 'Paciente'],
    [outsider, 'Otro paciente'],
    [doctorA, 'Doctor A'],
    [doctorB, 'Doctor B'],
  ]) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
      id,
      id + '@example.test',
      JSON.stringify({ full_name: name, role: 'doctor' }),
    ]);
  }
  await db.query("update public.profiles set role='doctor' where id=any($1::uuid[])", [
    [doctorA, doctorB],
  ]);
  const today = (await db.query('select private.today_for($1) as today', [patient])).rows[0].today;
  async function as(user, query, params = []) {
    await db.exec('begin; set local role authenticated;');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      const result = await db.query(query, params);
      await db.exec('commit');
      return result.rows;
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }
  const payload = { full_name: 'Paciente', age: 32, weight: 64, height: 165, body_fat: null };
  const save = (ids, version = CONSENT_VERSION, form = payload) =>
    as(patient, 'select public.vitalia_save_profile_v3($1,$2,$3)', [
      JSON.stringify(form),
      ids,
      version,
    ]);
  async function task(doctor, title = 'Caminar') {
    return (
      await as(
        doctor,
        "insert into public.tasks(doctor_id,patient_id,title,start_date,frequency) values($1,$2,$3,$4,'daily') returning *",
        [doctor, patient, title, today],
      )
    )[0];
  }
  let taskA, taskB;
  await t.test(
    'El registro ignora roles en metadata y el paciente no puede elevar privilegios',
    async () => {
      assert.equal(
        (await as(patient, 'select role from public.profiles where id=$1', [patient]))[0].role,
        'patient',
      );
      await assert.rejects(
        as(patient, "update public.profiles set role='doctor' where id=$1", [patient]),
        /permission denied/,
      );
      assert.equal(
        (await as(outsider, 'select * from public.profiles where id=$1', [patient])).length,
        0,
      );
    },
  );
  await t.test(
    'Dos médicos requieren consentimiento explícito, sin reemplazar el vínculo anterior',
    async () => {
      await assert.rejects(save([doctorA, doctorB], null), /Consent required/);
      await save([doctorA, doctorB]);
      assert.equal((await as(patient, 'select * from public.doctor_patients')).length, 2);
      assert.equal((await as(patient, 'select * from public.sharing_consents')).length, 2);
      await save([doctorA, doctorB]);
      assert.equal((await as(patient, 'select * from public.sharing_consents')).length, 2);
      assert.equal((await as(outsider, 'select * from public.sharing_consents')).length, 0);
      assert.equal(
        (await as(doctorA, 'select * from public.profiles where id=$1', [patient])).length,
        1,
      );
      assert.equal(
        (await as(doctorB, 'select * from public.profiles where id=$1', [patient])).length,
        1,
      );
      assert.equal(
        (
          await db.query(
            "select to_regprocedure('public.vitalia_save_profile(jsonb,uuid,boolean)') as old",
          )
        ).rows[0].old,
        null,
      );
    },
  );
  await t.test('Cada médico modifica solo sus indicaciones', async () => {
    taskA = await task(doctorA);
    taskB = await task(doctorB, 'Pausa');
    await assert.rejects(
      as(doctorB, "select public.vitalia_task_status($1,'pause')", [taskA.id]),
      /Not authorized/,
    );
    await assert.rejects(
      as(
        outsider,
        "insert into public.tasks(doctor_id,patient_id,title,start_date) values($1,$2,'No autorizado',$3)",
        [outsider, patient, today],
      ),
      /row-level security/,
    );
    assert.equal(
      (await as(doctorA, 'select * from public.tasks where patient_id=$1', [patient])).length,
      2,
    );
  });
  await t.test('Servidor valida hábitos, fechas, identidad y calcula el puntaje', async () => {
    const insert = (who, date, pillar, data, score = 999) =>
      as(
        who,
        'insert into public.pillar_records(user_id,date,pillar,data,score) values($1,$2,$3,$4,$5) returning *',
        [patient, date, pillar, JSON.stringify(data), score],
      );
    const data = { version: 2, values: { hours: 7, quality: 10, bedtime: '23:00' } };
    const row = (await insert(patient, today, 'sueno', data))[0];
    assert.equal(Number(row.score), 100);
    await assert.rejects(
      insert(outsider, today, 'sueno', data),
      /Not authorized|row-level security/,
    );
    await assert.rejects(
      insert(patient, today, 'estres', { version: 2, values: { stress: 100, minutes: 0 } }),
      /Invalid pillar/,
    );
    await assert.rejects(insert(patient, today, 'unknown', data), /Invalid pillar/);
    await assert.rejects(insert(patient, '2000-01-01', 'sueno', data), /last 30 days/);
    await assert.rejects(
      as(patient, "update public.pillar_records set pillar='conexion' where id=$1", [row.id]),
      /Cannot move/,
    );
    await assert.rejects(
      as(patient, 'update public.pillar_records set data=$1 where id=$2', [
        JSON.stringify({ version: 2, values: { hours: 7, quality: 10, bedtime: '25:99' } }),
        row.id,
      ]),
      /Invalid pillar/,
    );
    assert.equal((await as(outsider, 'select * from public.pillar_records')).length, 0);
  });
  await t.test(
    'Las fórmulas SQL y JavaScript coinciden para los seis pilares y datos heredados',
    async () => {
      for (const record of createDemo().pillar_records.slice(0, 90)) {
        const result = await db.query('select private.pillar_score($1,$2) as score', [
          record.pillar,
          JSON.stringify(record.data),
        ]);
        assert.equal(Number(result.rows[0].score), record.score, record.pillar);
      }
      assert.equal(
        Number(
          (
            await db.query('select private.pillar_score($1,$2) as score', [
              'sueno',
              JSON.stringify([7, 10, '23:00']),
            ])
          ).rows[0].score,
        ),
        100,
      );
    },
  );
  await t.test('Mediciones preservan cambios reales y respetan permisos', async () => {
    const before = (await as(patient, 'select * from public.profile_measurements')).length;
    await save([doctorA, doctorB], CONSENT_VERSION, { ...payload, weight: 65 });
    assert.equal(
      (await as(patient, 'select * from public.profile_measurements')).length,
      before + 1,
    );
    await save([doctorA, doctorB], CONSENT_VERSION, {
      ...payload,
      weight: 65,
      full_name: 'Paciente actualizado',
    });
    assert.equal(
      (await as(patient, 'select * from public.profile_measurements')).length,
      before + 1,
    );
    assert.equal((await as(outsider, 'select * from public.profile_measurements')).length, 0);
    assert.ok((await as(doctorB, 'select * from public.profile_measurements')).length > 0);
  });
  await t.test(
    'Retirar un médico revoca acceso y pausa solo sus actividades, conservando hoy',
    async () => {
      await save([doctorB]);
      assert.equal(
        (await as(doctorA, 'select * from public.pillar_records where user_id=$1', [patient]))
          .length,
        0,
      );
      assert.equal(
        (await as(doctorA, 'select * from public.tasks where patient_id=$1', [patient])).length,
        0,
      );
      const tasks = await as(patient, 'select * from public.tasks order by title');
      assert.equal(tasks.find((x) => x.id === taskA.id).active, false);
      assert.equal(tasks.find((x) => x.id === taskB.id).active, true);
      assert.ok(
        (
          await as(patient, 'select * from public.sharing_consents where doctor_id=$1', [doctorA])
        )[0].revoked_at,
      );
      await as(
        patient,
        'insert into public.task_completions(task_id,patient_id,completion_date,completed) values($1,$2,$3,true)',
        [taskA.id, patient, today],
      );
      await assert.rejects(
        as(
          outsider,
          'insert into public.task_completions(task_id,patient_id,completion_date,completed) values($1,$2,$3,true)',
          [taskB.id, patient, today],
        ),
        /Not authorized/,
      );
      await assert.rejects(save([doctorA, doctorB], null), /Consent required/);
      await save([doctorA, doctorB]);
      assert.equal(
        (await as(patient, 'select * from public.sharing_consents where doctor_id=$1', [doctorA]))
          .length,
        2,
      );
      assert.equal(
        (await as(patient, 'select active from public.tasks where id=$1', [taskA.id]))[0].active,
        false,
      );
    },
  );
  await t.test(
    'Paginación y búsqueda en servidor respetan el médico y no duplican pacientes',
    async () => {
      for (let i = 10; i < 23; i++) {
        const id = '30000000-0000-0000-0000-' + String(i).padStart(12, '0');
        await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
          id,
          id + '@example.test',
          JSON.stringify({ full_name: 'Persona ' + i }),
        ]);
        await db.query('insert into public.doctor_patients(doctor_id,patient_id) values($1,$2)', [
          doctorA,
          id,
        ]);
      }
      const page = async (user, offset = 0, search = '') =>
        (
          await as(user, 'select public.vitalia_patient_page($1,$2,$3,$4) as data', [
            search,
            'all',
            offset,
            10,
          ])
        )[0].data;
      const first = await page(doctorA),
        second = await page(doctorA, 10);
      assert.equal(first.total, 14);
      assert.equal(first.items.length, 10);
      assert.equal(second.items.length, 4);
      assert.equal(new Set([...first.items, ...second.items].map((x) => x.profile.id)).size, 14);
      assert.equal((await page(doctorB)).total, 1);
      assert.equal((await page(outsider)).total, 0);
      assert.equal((await page(doctorA, 0, 'Persona 10')).total, 1);
    },
  );
  await t.test(
    'El instalador puede repetirse con equipos existentes sin borrar vínculos ni historia',
    async () => {
      const before = (await db.query('select count(*)::integer as n from public.doctor_patients'))
        .rows[0].n;
      await db.exec(sql);
      assert.equal(
        (await db.query('select count(*)::integer as n from public.doctor_patients')).rows[0].n,
        before,
      );
      assert.equal((await as(patient, 'select public.vitalia_status() as version'))[0].version, 3);
      assert.ok((await as(patient, 'select * from public.sharing_consents')).length >= 3);
    },
  );
});
