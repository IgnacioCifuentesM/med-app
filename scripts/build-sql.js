import { readFileSync, writeFileSync } from 'node:fs';
// Keep the original migration immutable. The standalone installer must also support
// a database that already has multiple doctors when it is executed again.
export function installerSql() {
  let base = readFileSync(
    new URL('../supabase/migrations/202609220001_vitalia_v2.sql', import.meta.url),
    'utf8',
  );
  base = base.replace(/\r\n/g, '\n');
  base = base.replace(
    / {2}if exists\(select 1 from public\.doctor_patients group by patient_id having count\(\*\) > 1\) then[\s\S]*? {2}end if;\r?\n/,
    '',
  );
  base = base.replace(/create unique index if not exists vitalia_one_doctor[^\n]+\n/, '');
  const upgrade = readFileSync(
    new URL('../supabase/migrations/202609230001_vitalia_v3.sql', import.meta.url),
    'utf8',
  );
  const body = [base, upgrade.replace(/\r\n/g, '\n')]
    .map((sql) => sql.replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, ''))
    .join('\n');
  return (
    '-- VITALIA 3 · Copiar TODO en Supabase > SQL Editor y ejecutar.\n-- Instalación/actualización atómica. Conserva datos e historial.\n-- No cambia contraseñas ni asigna roles profesionales.\nbegin;\n' +
    body +
    '\ncommit;\n'
  );
}
if (process.argv.includes('--write')) {
  writeFileSync(new URL('../supabase/INSTALAR_VITALIA.sql', import.meta.url), installerSql());
  console.log('Generado supabase/INSTALAR_VITALIA.sql');
}
