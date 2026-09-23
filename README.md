# Vitalia 3

Aplicación de seguimiento de hábitos y actividades para pacientes y sus equipos de salud. React 18 + Vite + Supabase. Los indicadores son descriptivos y no representan una evaluación clínica.

## Ejecutar localmente

Requiere Node.js 22.12 o posterior.

```sh
npm ci
npm run dev
```

Copia `.env.example` a `.env.local` y configura **una variable por línea**:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU-CLAVE-PUBLICA
```

También se admite `VITE_SUPABASE_PUBLISHABLE_KEY` en lugar de `VITE_SUPABASE_ANON_KEY`. La clave debe ser **publishable** o **anon**, nunca `service_role` ni `sb_secret_`. Obtén la URL y la clave pública en la configuración/API de tu proyecto Supabase.

Después de cambiar variables, detén y reinicia Vite. Verifica sin imprimir credenciales:

```sh
npm run check:config
```

El problema “Configura Supabase para ingresar” ocurre si falta una variable, si ambas están en la misma línea o si el despliegue se compiló sin ellas. `.env.local` es local, está ignorado por Git y no se publica.

## Actualizar Supabase: un archivo para copiar y pegar

1. Abre **supabase/INSTALAR_VITALIA.sql**.
2. Copia todo el archivo en **SQL Editor** del proyecto Supabase correspondiente.
3. Ejecuta el script completo. Instala/actualiza las tablas, funciones y permisos en una sola transacción; conserva los registros existentes.
4. Comprueba con `select public.vitalia_status();`: debe devolver **3**.
5. Abre o recarga la aplicación.

El instalador funciona en una base vacía, en Vitalia 2 y al repetirse sobre Vitalia 3. Si existen registros diarios duplicados o vínculos duplicados del mismo par médico/paciente, la transacción falla en lugar de eliminarlos automáticamente. Revisa esos conflictos antes de repetirla.

El archivo se genera con `npm run sql:build` desde las migraciones versionadas. Si usas migraciones con la CLI de Supabase y ya aplicaste Vitalia 2, aplica solo `202609230001_vitalia_v3.sql`. No vuelvas a ejecutar individualmente la antigua migración de Vitalia 2 sobre una base con equipos de varios médicos.

Las cuentas nuevas son pacientes; la metadata de registro nunca asigna roles profesionales. Para habilitar una cuenta profesional ya registrada, un administrador puede ejecutar en SQL Editor:

```sql
update public.profiles
set role = 'doctor'
where id = 'UUID-DE-LA-CUENTA-AUTORIZADA';
```

Verifica la identidad del profesional antes de asignar el rol. La app no contiene una herramienta de invitación automática.

## Publicar en Vercel

Configura en el proyecto Vercel las mismas variables públicas, para el entorno que uses (Production/Preview), y vuelve a desplegar. Un archivo `.env.local` de tu PC no configura Vercel.

El comando de despliegue es `npm run build:production`: detiene la compilación si faltan variables o si contienen claves privadas. `npm run build` permite compilar sin conexión para pruebas y demostración.

En Supabase Authentication, configura **Site URL** con la URL de la app y las URLs de redirección necesarias para confirmación y recuperación de contraseña, incluyendo `http://localhost:5173/**` para desarrollo y el dominio de producción. Prueba confirmación de correo y recuperación con una cuenta de prueba.

## Equipos de salud y acceso

- Un paciente puede seleccionar varios médicos en **Mi perfil → Tu equipo de salud**.
- Cada médico vinculado ve el seguimiento y las actividades del equipo, pero solo puede pausar, reactivar o archivar sus propias indicaciones.
- Al retirar un médico, pierde acceso a futuras consultas inmediatamente. Solo sus tareas activas se pausan al terminar el día del paciente; el resto del equipo continúa.
- Cada nueva vinculación requiere aceptación explícita. Se guarda fecha, profesional, versión y texto aceptado. Retirar y volver a agregar a un médico genera una nueva aceptación.
- No se inventan consentimientos para relaciones antiguas: se solicita confirmación al guardar el perfil.
- Los datos ya descargados o vistos previamente por un profesional no se pueden retirar de su dispositivo.

## Registros e indicadores

El servidor valida los seis pilares, los rangos y el límite de edición de treinta días, y calcula el puntaje. Las tendencias comparan solo pilares presentes en ambos extremos del período. La interfaz muestra cobertura para interpretar días incompletos.

Los cambios de peso, estatura y grasa corporal generan historial. Al activar esta versión, las medidas ya existentes se registran como un valor inicial con fecha de activación, sin inventar fechas anteriores.

El panel profesional filtra y pagina en PostgreSQL, y abre la ficha directamente sin descargar previamente todos los pacientes. Las fechas de la ficha y las tareas usan la zona horaria del paciente.

El modo demo funciona sin Supabase y conserva sus datos en este navegador. Los datos guardados por demos antiguas se mantienen; una demostración nueva incluye dos médicos.

## Verificación

```sh
npm run check
npm run format:check
npm run build:production
```

- `lint`: ESLint y reglas de hooks.
- `test`: dominio, configuración y PostgreSQL real embebido mediante PGlite. Comprueba permisos por fila, equipos, consentimientos, fechas, autoría de tareas, historial, paginación y migraciones repetibles.
- El comando de tests falla si no encuentra archivos de prueba.
- La integración continua ejecuta estas comprobaciones sin credenciales.
- Las pruebas de base de datos no se conectan al proyecto remoto ni modifican sus datos.

PGlite simula las identidades de Supabase para probar RLS y funciones. El correo de autenticación, la configuración remota y el flujo de login real deben comprobarse en tu proyecto después de ejecutar SQL.

## Estructura

- `src/pages`: acceso, paciente, profesional y perfil.
- `src/components`: formularios, gráficos y vistas reutilizables.
- `src/lib/domain.js`: programación, validación e indicadores.
- `src/lib/api.js`: acceso a Supabase y demo.
- `supabase/migrations`: cambios versionados del esquema.
- `supabase/INSTALAR_VITALIA.sql`: instalador listo para SQL Editor.
- `tests`: regresiones funcionales y de permisos.
