export function supabaseConfig(env = {}) {
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key)
    return {
      error:
        'Falta la URL o la clave pública de Supabase. Configura ambas variables en líneas separadas y reinicia la app.',
    };
  if (/VITE_|\s/.test(url) || /your-project|your-publishable|example/.test(`${url} ${key}`))
    return {
      error:
        'La configuración de Supabase contiene valores de ejemplo o variables en una misma línea.',
    };
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
  } catch {
    return { error: 'La URL de Supabase no es válida.' };
  }
  if (key.startsWith('sb_secret_'))
    return { error: 'Usa una clave pública de Supabase, nunca una clave secreta.' };
  if (!key.startsWith('sb_publishable_')) {
    try {
      const part = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(part));
      if (claims.role !== 'anon') throw new Error();
    } catch {
      return { error: 'La clave debe ser publishable o anon. No se admiten claves privadas.' };
    }
  }
  return { url, key, error: '' };
}
