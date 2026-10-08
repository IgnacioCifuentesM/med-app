import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { ownRank, retainChat } from '../src/lib/chat.js';

test('72-hour rolling window keeps exactly the two newest old messages per conversation', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const messages = [1, 2, 3, 4, 5].map((seq) => ({
    id: `a${seq}`,
    seq,
    patient_id: 'a',
    doctor_id: 'doctor',
    created_at: '2026-10-01T00:00:00Z',
  }));
  messages.push({
    id: 'b',
    seq: 6,
    patient_id: 'b',
    doctor_id: 'doctor',
    created_at: '2026-10-01T00:00:00Z',
  });
  messages.push({
    id: 'new',
    seq: 7,
    patient_id: 'a',
    doctor_id: 'doctor',
    created_at: '2026-10-07T00:00:00Z',
  });
  assert.deepEqual(
    retainChat(messages, now).map((m) => m.id),
    ['a5', 'new', 'b'],
  );
  assert.deepEqual(
    ownRank(
      [
        { id: 'a', score: 80 },
        { id: 'b', score: 80 },
        { id: 'c', score: 60 },
        { id: 'd', score: null },
      ],
      'c',
    ),
    { position: 3, score: 60, tied: false },
  );
  assert.equal(
    ownRank(
      [
        { id: 'a', score: 80 },
        { id: 'b', score: 80 },
      ],
      'a',
    ).tied,
    true,
  );
  assert.equal(ownRank([{ id: 'a', score: null }], 'a').position, null);
});

test('Chat and own-only ranking in PostgreSQL, including retention and permissions', async (t) => {
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
  for (const name of ['202610010003_weekly_scores.sql', '202610070001_chat_ranking.sql']) {
    const sql = readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
  }
  const patient = '10000000-0000-0000-0000-000000000001';
  const other = '10000000-0000-0000-0000-000000000002';
  const empty = '10000000-0000-0000-0000-000000000003';
  const doctor = '20000000-0000-0000-0000-000000000001';
  const colleague = '20000000-0000-0000-0000-000000000002';
  for (const id of [patient, other, empty, doctor, colleague])
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${id}@example.test`]);
  await db.query("update public.profiles set role='doctor' where id=any($1::uuid[])", [
    [doctor, colleague],
  ]);
  await db.query('insert into public.doctor_patients(patient_id,doctor_id) values($1,$2),($1,$3)', [
    patient,
    doctor,
    colleague,
  ]);
  async function as(user, sql, args = []) {
    await db.exec('begin; set local role authenticated;');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      const result = await db.query(sql, args);
      await db.exec('commit');
      return result.rows;
    } catch (err) {
      await db.exec('rollback');
      throw err;
    }
  }
  const send = (user, id, body, targetDoctor = doctor) =>
    as(user, 'select public.vitalia_send_chat($1,$2,$3,$4) as result', [
      patient,
      targetDoctor,
      id,
      body,
    ]);
  const list = (user, targetDoctor = doctor, before = null) =>
    as(user, 'select public.vitalia_chat_messages($1,$2,$3) as result', [
      patient,
      targetDoctor,
      before,
    ]);
  await t.test('Only the patient and the specific linked doctor can read and send', async () => {
    const id = crypto.randomUUID();
    const sent = (await send(patient, id, ' Mi pregunta '))[0].result;
    assert.equal(sent.sender_id, patient);
    assert.equal(sent.body, 'Mi pregunta');
    assert.equal((await send(patient, id, 'Mi pregunta'))[0].result.id, id);
    assert.equal((await list(doctor))[0].result.items.length, 1);
    await assert.rejects(list(other), /not authorized/);
    await assert.rejects(list(colleague), /not authorized/);
    await assert.rejects(send(other, crypto.randomUUID(), 'No autorizado'), /not authorized/);
    await assert.rejects(send(doctor, id, 'Mi pregunta'), /not authorized/);
    await assert.rejects(send(patient, crypto.randomUUID(), ' '.repeat(10)), /Invalid chat/);
    await assert.rejects(send(patient, crypto.randomUUID(), 'a'.repeat(2001)), /Invalid chat/);
    const reply = (await send(doctor, crypto.randomUUID(), 'Respuesta del médico'))[0].result;
    assert.equal(reply.sender_id, doctor);
    assert.equal((await list(patient))[0].result.items.at(-1).id, reply.id);
    await assert.rejects(as(patient, 'select * from private.chat_messages'), /permission denied/);
    await assert.rejects(as(patient, 'select private.prune_chat()'), /permission denied/);
    assert.equal(
      (await as(patient, 'select public.vitalia_chat_contacts() as result'))[0].result.items.length,
      2,
    );
    assert.equal(
      (await as(other, 'select public.vitalia_chat_contacts() as result'))[0].result.items.length,
      0,
    );
    const audit = await db.query("select * from private.audit_events where entity='chat_messages'");
    assert.equal(audit.rows.length, 0);
  });
  await t.test(
    'Bounded pagination, ten sends per minute, and duplicate retry at the limit',
    async () => {
      const ids = [];
      for (let i = 0; i < 9; i++) {
        ids.push(crypto.randomUUID());
        await send(patient, ids.at(-1), `Mensaje ${i}`);
      }
      await assert.rejects(send(patient, crypto.randomUUID(), 'Demasiados'), /rate limit/);
      await send(patient, ids.at(-1), 'Mensaje 8');
      await db.query(
        "insert into private.chat_messages(id,patient_id,doctor_id,sender_id,body,created_at) select gen_random_uuid(),$1,$2,$1,'Historial '||i,now()-interval '2 hours' from generate_series(1,60) i",
        [patient, doctor],
      );
      const newest = (await list(patient))[0].result;
      assert.equal(newest.items.length, 50);
      assert.equal(newest.has_more, true);
      const older = (await list(patient, doctor, newest.items[0].seq))[0].result;
      assert.equal(older.items.length, 21);
      assert.equal(older.has_more, false);
      assert.ok(!newest.items.some((m) => older.items.some((n) => n.id === m.id)));
    },
  );
  await t.test(
    'Cleanup while inactive keeps two old messages per pair, then expires the remainder',
    async () => {
      await db.query("update private.chat_messages set created_at=now()-interval '4 days'");
      await db.query(
        "insert into private.chat_messages(id,patient_id,doctor_id,sender_id,body,created_at) select gen_random_uuid(),$1,$2,$1,'Otro médico '||i,now()-interval '4 days' from generate_series(1,3) i",
        [patient, colleague],
      );
      await db.exec('select private.prune_chat();');
      assert.equal((await list(patient))[0].result.items.length, 2);
      assert.equal((await list(patient, colleague))[0].result.items.length, 2);
      await send(patient, crypto.randomUUID(), 'Nuevo mensaje');
      assert.equal(
        (await list(patient))[0].result.items.length,
        2,
        'Only newest old message remains alongside the new one',
      );
      await db.exec(
        "update private.chat_messages set created_at=now()-interval '4 days'; select private.prune_chat();",
      );
      assert.equal((await list(patient))[0].result.items.length, 2);
    },
  );
  await t.test('Unlink removes access and messages, preserving other conversations', async () => {
    await db.query('delete from public.doctor_patients where patient_id=$1 and doctor_id=$2', [
      patient,
      doctor,
    ]);
    await assert.rejects(list(doctor), /not authorized/);
    await assert.rejects(send(patient, crypto.randomUUID(), 'Ya no vinculado'), /not authorized/);
    assert.equal((await list(patient, colleague))[0].result.items.length, 2);
    assert.equal(
      (await db.query('select * from private.chat_messages where doctor_id=$1', [doctor])).rows
        .length,
      0,
    );
    await db.query('insert into public.doctor_patients(patient_id,doctor_id) values($1,$2)', [
      patient,
      doctor,
    ]);
    assert.equal((await list(patient))[0].result.items.length, 0);
  });
  await t.test(
    'Ranking returns only caller position/score, ties, empty weeks, and excludes doctors',
    async () => {
      const rank = (id) => as(id, 'select public.vitalia_my_weekly_rank() as result');
      assert.equal((await rank(empty))[0].result.position, null);
      const date = (await db.query('select private.today_for($1)::text as day', [patient])).rows[0]
        .day;
      const data = { version: 2, values: { hours: 8, quality: 8, bedtime: '22:00', note: '' } };
      for (const id of [patient, other])
        await as(
          id,
          "insert into public.pillar_records(user_id,date,pillar,data) values($1,$2,'sueno',$3)",
          [id, date, data],
        );
      const mine = (await rank(patient))[0].result;
      assert.equal(mine.position, 1);
      assert.equal(mine.tied, true);
      assert.deepEqual(Object.keys(mine).sort(), ['end', 'position', 'score', 'start', 'tied']);
      await assert.rejects(rank(doctor), /not authorized/);
      await db.exec('begin; set local role anon;');
      await assert.rejects(db.query('select public.vitalia_my_weekly_rank()'), /permission denied/);
      await db.exec('rollback');
    },
  );
});
