import { loadEnv } from 'vite';
import { supabaseConfig } from '../src/lib/config.js';
const config = supabaseConfig({ ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env });
if (config.error) {
  console.error(config.error);
  process.exitCode = 1;
} else console.log('Supabase: URL y clave pública válidas. No se muestran credenciales.');
