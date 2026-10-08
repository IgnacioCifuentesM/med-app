import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Doctor registration is validated on the server; pending chats clear only on reply', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
  `);
  await db.exec(readFileSync(new URL('../supabase/INSTALAR_VITALIA.sql', import.meta.url), 'utf8'));
  for (const file of [
    '202610010003_weekly_scores.sql',
    '202610070001_chat_ranking.sql',
    '202610070002_final_adjustments.sql',
  ]) {
    const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
  }
  const patient = '10000000-0000-0000-0000-000000000001';
  const doctor = '20000000-0000-0000-0000-000000000001';
  const colleague = '20000000-0000-0000-0000-000000000002';
  const insert = (id, meta) =>
    db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [
      id,
      `${id}@example.test`,
      meta,
    ]);
  const signupDoctor = (id, code) =>
    insert(id, { full_name: 'Profesional', requested_role: 'doctor', doctor_code: code });
  async function as(id, sql, args = []) {
    await db.exec('begin; set local role authenticated;');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
      const result = await db.query(sql, args);
      await db.exec('commit');
      return result.rows;
    } catch (err) {
      await db.exec('rollback');
      throw err;
    }
  }
  await t.test('Code is exact, required, and removed from Auth metadata', async () => {
    for (const code of ['', null, 'santa', 'Santa$maria', 'santa$maria '])
      await assert.rejects(signupDoctor(doctor, code), /Invalid doctor registration code/);
    await signupDoctor(doctor, 'santa$maria');
    const saved = (await db.query('select * from auth.users where id=$1', [doctor])).rows[0];
    assert.equal(saved.raw_user_meta_data.doctor_code, undefined);
    assert.equal(
      (await db.query('select role from public.profiles where id=$1', [doctor])).rows[0].role,
      'doctor',
    );
    await insert(patient, {
      full_name: 'Paciente',
      role: 'doctor',
      requested_role: 'patient',
      doctor_code: 'santa$maria',
    });
    assert.equal(
      (await db.query('select role from public.profiles where id=$1', [patient])).rows[0].role,
      'patient',
    );
    assert.equal((await db.query('select * from private.doctor_signup_approvals')).rows.length, 0);
    await assert.rejects(
      as(patient, 'select * from private.doctor_registration_settings'),
      /permission denied/,
    );
    await assert.rejects(
      as(patient, 'insert into private.doctor_signup_approvals values($1)', [patient]),
      /permission denied/,
    );
    await db.exec(
      "create function public.test_unsafe_promote(person uuid) returns void language sql security definer set search_path='' as $$ update public.profiles set role='doctor' where id=person $$; grant execute on function public.test_unsafe_promote(uuid) to authenticated;",
    );
    await assert.rejects(
      as(patient, 'select public.test_unsafe_promote($1)', [patient]),
      /administrator/,
    );
    // Metadata updates on an existing user do not confer a professional role.
    await db.query(
      'update auth.users set raw_user_meta_data=raw_user_meta_data||$2::jsonb where id=$1',
      [patient, JSON.stringify({ requested_role: 'doctor', doctor_code: 'santa$maria' })],
    );
    assert.equal(
      (await db.query('select role from public.profiles where id=$1', [patient])).rows[0].role,
      'patient',
    );
    // Registration remains valid with an existing JWT context, without allowing later promotion.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [patient]);
    await signupDoctor(colleague, 'santa$maria');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    assert.equal(
      (await db.query('select role from public.profiles where id=$1', [colleague])).rows[0].role,
      'doctor',
    );
  });
  await t.test(
    'Pending flag is private, stays on read and expires on the doctor reply',
    async () => {
      await db.query(
        'insert into public.doctor_patients(patient_id,doctor_id) values($1,$2),($1,$3)',
        [patient, doctor, colleague],
      );
      const contacts = async (id) =>
        (await as(id, 'select public.vitalia_chat_contacts() as result'))[0].result.items;
      const send = (id, targetDoctor, body) =>
        as(id, 'select public.vitalia_send_chat($1,$2,$3,$4)', [
          patient,
          targetDoctor,
          crypto.randomUUID(),
          body,
        ]);
      assert.equal((await contacts(doctor))[0].pending_reply, false);
      await send(patient, doctor, 'Pregunta para mi médico');
      assert.equal((await contacts(doctor))[0].pending_reply, true);
      assert.equal((await contacts(colleague))[0].pending_reply, false);
      assert.ok((await contacts(patient)).every((c) => !c.pending_reply));
      await as(doctor, 'select public.vitalia_chat_messages($1,$2)', [patient, doctor]);
      assert.equal((await contacts(doctor))[0].pending_reply, true);
      await send(doctor, doctor, 'Respuesta');
      assert.equal((await contacts(doctor))[0].pending_reply, false);
      await send(patient, doctor, 'Otra pregunta');
      await db.exec(
        "update private.chat_messages set created_at=now()-interval '4 days'; select private.prune_chat();",
      );
      assert.equal(
        (await contacts(doctor))[0].pending_reply,
        true,
        'Retention preserves the latest unanswered question',
      );
      await db.query('delete from public.doctor_patients where patient_id=$1 and doctor_id=$2', [
        patient,
        doctor,
      ]);
      assert.equal((await contacts(doctor)).length, 0);
    },
  );
});
