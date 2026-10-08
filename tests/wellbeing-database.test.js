import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { weekStart, validEnergy } from '../src/lib/wellbeing.js';
import { addDays } from '../src/lib/domain.js';
import { weeklySummary } from '../src/lib/weekly.js';

test('Weeks start on Monday, including year boundaries; zero is valid energy', () => {
  assert.equal(weekStart('2026-10-01'), '2026-09-28');
  assert.equal(weekStart('2027-01-03'), '2026-12-28');
  assert.equal(weekStart('2026-09-28'), '2026-09-28');
  assert.equal(validEnergy(0), true);
  assert.equal(validEnergy(10), true);
  for (const value of [-1, 11, 2.5, '', null, NaN]) assert.equal(validEnergy(value), false);
});

test('PDF, energy and education permissions in PostgreSQL', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  await db.exec(readFileSync(new URL('../supabase/INSTALAR_VITALIA.sql', import.meta.url), 'utf8'));
  for (const file of [
    '202610010001_activity_pdfs.sql',
    '202610010002_energy_education.sql',
    '202610010003_weekly_scores.sql',
  ]) {
    const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
  }
  const patient = '10000000-0000-0000-0000-000000000001';
  const other = '10000000-0000-0000-0000-000000000002';
  const doctor = '20000000-0000-0000-0000-000000000001';
  const colleague = '20000000-0000-0000-0000-000000000002';
  const task = '30000000-0000-0000-0000-000000000001';
  for (const id of [patient, other, doctor, colleague])
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${id}@example.test`]);
  await db.query("update public.profiles set role='doctor' where id=any($1::uuid[])", [
    [doctor, colleague],
  ]);
  await db.query('insert into public.doctor_patients(doctor_id,patient_id) values($1,$3),($2,$3)', [
    doctor,
    colleague,
    patient,
  ]);
  const today = (await db.query('select private.today_for($1)::text as date', [patient])).rows[0]
    .date;
  const path = `${doctor}/${patient}/${task}.pdf`;
  async function as(user, sql, args = []) {
    await db.exec('begin; set local role authenticated;');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      const result = await db.query(sql, args);
      await db.exec('commit');
      return result.rows;
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }
  const upload = (who, name) =>
    as(who, "insert into storage.objects(bucket_id,name) values('activity-pdfs',$1)", [name]);
  const list = (who) => as(who, 'select * from storage.objects');
  await t.test('PDF upload, read and cleanup respect patient/team boundaries', async () => {
    await db.exec(
      'create policy legacy_broad_policy on storage.objects for all to authenticated using(true) with check(true);',
    );
    await assert.rejects(upload(patient, path), /row-level security/);
    await assert.rejects(upload(doctor, `${doctor}/${other}/${task}.pdf`), /row-level security/);
    await upload(doctor, path);
    assert.equal((await list(patient)).length, 0);
    assert.equal((await list(doctor)).length, 1);
    await as(
      doctor,
      'insert into public.tasks(id,doctor_id,patient_id,title,start_date,attachment_path,attachment_name,attachment_size) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [task, doctor, patient, 'Guía', today, path, 'guia.pdf', 200],
    );
    assert.equal((await list(patient)).length, 1);
    assert.equal((await list(colleague)).length, 1);
    assert.equal((await list(other)).length, 0);
    assert.equal(
      (await as(doctor, "update storage.objects set name='overwrite.pdf' returning *")).length,
      0,
    );
    assert.equal((await as(doctor, 'delete from storage.objects returning *')).length, 0);
    await db.query('delete from public.doctor_patients where doctor_id=$1', [doctor]);
    assert.equal((await list(doctor)).length, 0);
    assert.equal((await list(patient)).length, 1);
    await db.query('insert into public.doctor_patients(doctor_id,patient_id) values($1,$2)', [
      doctor,
      patient,
    ]);
    const orphan = `${doctor}/${patient}/30000000-0000-0000-0000-000000000002.pdf`;
    await upload(doctor, orphan);
    assert.equal(
      (await as(doctor, 'delete from storage.objects where name=$1 returning *', [orphan])).length,
      1,
    );
  });
  await t.test(
    'Energy accepts 0, upserts one value per day, and rejects unauthorized/out-of-range writes',
    async () => {
      await as(patient, 'insert into public.daily_energy values($1,$2,0)', [patient, today]);
      await as(
        patient,
        'insert into public.daily_energy values($1,$2,10) on conflict(patient_id,date) do update set value=excluded.value',
        [patient, today],
      );
      assert.equal((await as(doctor, 'select * from public.daily_energy'))[0].value, 10);
      assert.equal((await as(other, 'select * from public.daily_energy')).length, 0);
      await assert.rejects(
        as(other, 'insert into public.daily_energy values($1,$2,4)', [patient, today]),
        /row-level security/,
      );
      assert.equal(
        (await as(doctor, 'update public.daily_energy set value=5 returning *')).length,
        0,
      );
      await assert.rejects(
        as(patient, 'update public.daily_energy set value=11'),
        /check constraint/,
      );
      await assert.rejects(
        as(patient, 'insert into public.daily_energy values($1,($2::date-30),4)', [patient, today]),
        /last 30 days/,
      );
      await assert.rejects(
        as(patient, 'insert into public.daily_energy values($1,($2::date+1),4)', [patient, today]),
        /last 30 days/,
      );
    },
  );
  await t.test(
    'Weekly movement agrees in JS and SQL; server validates strength and author',
    async () => {
      const start = addDays(weekStart(today), -7);
      const records = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(start, i);
        const data = {
          version: 3,
          values: { steps: 7500, cardio_minutes: i < 3 ? 50 : 0, strength: i < 3, intensity: 5 },
        };
        records.push({ date, pillar: 'actividad', data });
        const row = await as(
          patient,
          "insert into public.pillar_records(user_id,date,pillar,data,score) values($1,$2,'actividad',$3,999) returning score",
          [patient, date, data],
        );
        assert.equal(row[0].score, null);
      }
      const end = addDays(start, 6);
      const sql = (
        await db.query('select private.weekly_summary($1,$2) as summary', [patient, end])
      ).rows[0].summary;
      const js = weeklySummary(records, end, today);
      assert.equal(sql.score, js.score);
      assert.equal(sql.score, 100);
      assert.equal(sql.activity.score, js.activity.score);
      const current = {
        version: 3,
        values: { steps: 7500, cardio_minutes: 150, strength: true, intensity: 5 },
      };
      await as(
        patient,
        "insert into public.pillar_records(user_id,date,pillar,data) values($1,$2,'actividad',$3)",
        [patient, today, current],
      );
      const roster = (await as(doctor, 'select public.vitalia_patient_page_weekly() as page'))[0]
        .page;
      assert.equal(
        roster.items[0].summary.score,
        weeklySummary([{ date: today, pillar: 'actividad', data: current }], today).score,
      );
      assert.equal(
        (await as(other, 'select public.vitalia_patient_page_weekly() as page'))[0].page.items
          .length,
        0,
      );
      await assert.rejects(
        as(patient, 'update public.pillar_records set data=$1 where date=$2', [
          { version: 3, values: { ...current.values, strength: 'true' } },
          today,
        ]),
        /Invalid pillar/,
      );
      await assert.rejects(
        as(
          other,
          "insert into public.pillar_records(user_id,date,pillar,data) values($1,$2,'actividad',$3)",
          [patient, today, current],
        ),
        /Not authorized|row-level security/,
      );
    },
  );
  await t.test(
    'Education: drafts/future posts are private; patients see only their team',
    async () => {
      const monday = weekStart(today);
      const args = [doctor, monday, 'nutricion', 'Recetas', 'Contenido del equipo'];
      await as(
        doctor,
        'insert into public.education_posts(doctor_id,week_start,pillar,title,content) values($1,$2,$3,$4,$5)',
        args,
      );
      assert.equal((await as(patient, 'select * from public.education_posts')).length, 0);
      await as(doctor, 'update public.education_posts set published=true');
      assert.equal((await as(patient, 'select * from public.education_posts')).length, 1);
      assert.equal((await as(other, 'select * from public.education_posts')).length, 0);
      assert.equal(
        (await as(colleague, 'update public.education_posts set title=$1 returning *', ['Editado']))
          .length,
        0,
      );
      await as(
        doctor,
        'insert into public.education_posts(doctor_id,week_start,pillar,title,content,published) values($1,$2::date+7,$3,$4,$5,true)',
        args,
      );
      assert.equal((await as(patient, 'select * from public.education_posts')).length, 1);
      await db.query('delete from public.doctor_patients where doctor_id=$1', [doctor]);
      assert.equal((await as(patient, 'select * from public.education_posts')).length, 0);
    },
  );
});
