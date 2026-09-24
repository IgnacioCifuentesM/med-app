import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';
import { createApi } from '../src/lib/api.js';

test('El buscador pagina más de mil médicos, filtra nombres y trata comodines como texto', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table doctors(id text primary key, full_name text);
    insert into doctors select 'doctor-'||lpad(n::text,4,'0'), 'Profesional '||lpad(n::text,4,'0') from generate_series(1,1005) n;
    insert into doctors values('percent','Doctora 100%'),('other','Doctora 100X');
  `);
  let calls = 0;
  const client = createClient('https://test.supabase.co', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        calls++;
        const url = new URL(input);
        assert.ok(url.pathname.endsWith('/rpc/vitalia_doctors'));
        const pattern = url.searchParams.get('full_name')?.slice('ilike.'.length) || '%';
        const ids = url.searchParams.get('id');
        const result = ids
          ? await db.query('select * from doctors where id=any($1::text[])', [
              ids
                .slice(4, -1)
                .split(',')
                .map((id) => id.replaceAll('"', '')),
            ])
          : await db.query(
              'select * from doctors where full_name ilike $1 order by full_name,id limit $2 offset $3',
              [
                pattern,
                Number(url.searchParams.get('limit')),
                Number(url.searchParams.get('offset') || 0),
              ],
            );
        return new Response(JSON.stringify(result.rows), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  const api = createApi(false, client);
  const first = await api.searchDoctors('Profesional');
  const second = await api.searchDoctors('Profesional', 30);
  assert.equal(first.items.length, 30);
  assert.equal(first.hasMore, true);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 60);
  const end = await api.searchDoctors('Profesional', 990);
  assert.equal(end.items.length, 15);
  assert.equal(end.hasMore, false);
  assert.equal((await api.searchDoctors('100%')).items.length, 1);
  assert.deepEqual(await api.searchDoctors('no-existe'), { items: [], hasMore: false });
  const before = calls;
  assert.deepEqual(await api.doctorNames([]), []);
  assert.equal(calls, before);
  const names = await api.doctorNames(['doctor-1005', 'doctor-1005', 'doctor-0001']);
  assert.equal(names.length, 2);
});
