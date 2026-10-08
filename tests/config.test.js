import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseConfig } from '../src/lib/config.js';
const url = 'https://project.supabase.co';
const anon = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
test('Acepta claves públicas anon y publishable', () => {
  assert.equal(supabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon }).error, '');
  assert.equal(
    supabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })
      .error,
    '',
  );
});
test('Detecta el problema original de variables pegadas en una sola línea', () => {
  assert.ok(supabaseConfig({ VITE_SUPABASE_URL: url + ' VITE_SUPABASE_ANON_KEY=' + anon }).error);
});
test('Rechaza configuraciones ausentes, de ejemplo o claves privadas', () => {
  assert.ok(supabaseConfig().error);
  assert.ok(
    supabaseConfig({
      VITE_SUPABASE_URL: 'https://your-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: anon,
    }).error,
  );
  const privateKey = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  for (const key of ['sb_secret_test', privateKey])
    assert.ok(supabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key }).error);
});
