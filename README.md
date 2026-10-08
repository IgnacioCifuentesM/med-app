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

Con la migración `202610070002_final_adjustments.sql`, el registro permite elegir Paciente o Doctor. El alta profesional exige el código configurado, validado en un trigger de Supabase; la metadata por sí sola no asigna el rol. Las cuentas existentes conservan su rol. Para habilitar una cuenta profesional ya registrada, un administrador puede ejecutar en SQL Editor:

```sql
update public.profiles
set role = 'doctor'
where id = 'UUID-DE-LA-CUENTA-AUTORIZADA';
```

El código de alta se conserva como hash en una tabla privada y se elimina de la metadata antes de guardar el usuario. No se incluye en el frontend. Sin esta última migración, el instalador base solo crea pacientes.

## Actualización del 1 de octubre: PDF, energía y Educación

Sobre una instalación Vitalia 3, ejecutar en este orden en Supabase SQL Editor:

1. `supabase/migrations/202610010001_activity_pdfs.sql`.
2. `supabase/migrations/202610010002_energy_education.sql`.
3. `supabase/migrations/202610010003_weekly_scores.sql`.

En instalaciones nuevas ejecutar primero `supabase/INSTALAR_VITALIA.sql` y después las tres migraciones anteriores. El instalador base conserva su versión 3; estas migraciones complementarias son repetibles. Desplegar el frontend después de aplicarlas. No requieren una clave privada en el navegador. Si PDF y Educación ya están activos, solo falta la tercera migración para guardar cardio/fuerza y actualizar el resumen profesional.

- **Agregar actividad:** un PDF opcional de hasta 10 MB. El archivo se sube antes de guardar la actividad. Si falla el guardado, se intenta limpiar el archivo huérfano; un archivo ya asociado nunca se elimina con esa limpieza.
- **Paciente:** sección Mis guías en el menú y acceso directo en Mi día, incluso en días en que la actividad no esté programada. El visor también ofrece abrir en otra pestaña para navegadores móviles sin visor integrado.
- **Acceso:** bucket privado `activity-pdfs`, paciente y profesionales actualmente vinculados. Los enlaces de lectura duran 5 minutos; un enlace ya emitido puede seguir funcionando durante ese plazo tras retirar acceso. Los PDF de demostración viven en IndexedDB del mismo navegador y no se suben a Supabase. [Referencia de permisos de Storage](https://supabase.com/docs/guides/storage/security/access-control).
- **Energía:** registro independiente 0–10, sin valor guardado por defecto. Historial y promedio excluyen días sin registro; cero es un valor válido. Visible en Mi día, Mi progreso y ficha profesional. No cambia los puntajes de los pilares ni determina eficacia clínica por sí solo.
- **Educación:** seis pestañas, una publicación por profesional/pilar/semana (lunes a domingo). El profesional puede guardar borradores, retirar una publicación o preparar semanas futuras. Cada paciente ve publicaciones de su equipo, a partir de su semana de vigencia. No se incluye contenido clínico inventado: las profesionales escriben y publican sus materiales.
- **Scores semanales:** las seis tarjetas muestran la semana de lunes a domingo. Movimiento promedia tres componentes con igual peso, limitados a 100: promedio del cumplimiento diario de 7.500 pasos (cada día se limita a 100 antes de promediar), minutos de cardio acumulados / 150 y días con fuerza / 3. Los otros cinco pilares promedian sus registros dentro de la semana. Se indica la cobertura; los días sin registros no se imputan como cero. Los minutos históricos de ejercicio no se convierten en cardio ni fuerza. Sin datos de uno de los tres componentes, Movimiento queda sin score hasta registrarlos. El formulario diario de Movimiento incluye cardio y la casilla de entrenamiento de fuerza; no hay un panel deportivo separado.

Verificación focalizada: `node --test tests/attachments.test.js tests/weekly.test.js tests/wellbeing-database.test.js`.

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

## Chat privado y ranking semanal (7 de octubre de 2026)

La pestaña **Chat** está disponible para pacientes y profesionales. Cada conversación pertenece a un paciente y a un médico actualmente vinculado. Otros miembros del equipo no pueden leerla. Retirar el vínculo elimina esa conversación. El médico elige un paciente y responde desde su cuenta; no hay respuestas automáticas ni notificaciones push.

**Retención:** se guardan los mensajes de las últimas 72 horas y, por conversación, siempre los dos más recientes aunque sean más antiguos. La limpieza también se ejecuta al consultar/enviar. Para eliminar mensajes incluso cuando la app está cerrada hay que activar el trabajo horario de Supabase Cron. El borrado automático ocurre en la primera ejecución horaria posterior al vencimiento (hasta aproximadamente una hora después de las 72 horas). No se copian cuerpos de mensajes al registro de auditoría. Esta limpieza se refiere a la base activa; no modifica copias de seguridad externas.

**Uso acotado:** máximo 2.000 caracteres por mensaje, 10 envíos por minuto y 200 por día por usuario. El historial se pagina en bloques de 50 y los contactos en bloques de 30. La conversación abierta y la lista de contactos del médico consultan novedades cada 30 segundos mientras la ventana es visible; el botón Actualizar permite consultar los mensajes antes. Los reintentos de un mensaje usan el mismo identificador para evitar duplicados.

**Ranking:** aparece en Mi día, usa exactamente la fórmula de puntaje semanal existente y devuelve solamente posición, puntaje propio, semana y señal de empate. Se comparan todos los pacientes con score durante las mismas fechas de la semana del solicitante. No se descargan nombres, puntajes ni posiciones individuales ajenas. Los empates comparten posición (por ejemplo: 1, 1, 3). Los pacientes sin registros esa semana quedan sin posición. El ranking es parcial y los pilares sin datos se excluyen del promedio, como en el indicador existente. No es una clasificación clínica.

### Activación en Supabase

En una instalación Vitalia 3 existente, ejecutar después de la migración de puntajes semanales:

1. `supabase/migrations/202610070001_chat_ranking.sql`.
2. `supabase/ACTIVAR_LIMPIEZA_CHAT.sql`. La consulta final debe mostrar `vitalia-chat-retention` con `active = true`. Ejecutarlo como administrador en SQL Editor, sin poner claves privadas en el frontend.

Las funciones se instalaron y comprobaron en PostgreSQL local mediante PGlite. La migración remota y el trabajo Cron requieren ejecutarse en el proyecto Supabase del administrador.

Para actualizar Android desde PowerShell en `C:\dev\med-app`:

```powershell
npm.cmd run build
npx.cmd cap sync android
npx.cmd cap open android
```

Verificación: `npm run check` (49 pruebas, lint y build). Se comprobó el envío y la respuesta entre ambos roles en el navegador usando exclusivamente la demo. La conexión automática de pasos sigue pendiente.

## Ajustes finales: equilibrio, chats pendientes y registro profesional

Aplicar `supabase/migrations/202610070002_final_adjustments.sql` después de la migración de chat. La migración es repetible, conserva cuentas existentes y no cambia sus roles. Después, compilar y sincronizar Android como se indica arriba. No volver a aplicar únicamente el instalador base después de estas migraciones: el conjunto completo debe ejecutarse en orden.

- **Mis pilares:** debajo de las tarjetas de registro aparece un gráfico de radar de seis ejes, calculado con los puntajes de la semana seleccionada. Un pilar sin datos no se dibuja como cero y, si falta algún puntaje, se muestran puntos sin un polígono cerrado. La tabla ofrece los valores también como texto. “Parejos” indica una diferencia máxima de 15 puntos entre el mayor y el menor; no es una conclusión clínica y puede incluir puntajes bajos.
- **Chat profesional:** si el último mensaje es del paciente, su contacto aparece en azul claro y con el texto “Pendiente de respuesta”. Esas conversaciones aparecen primero. Leer no elimina el pendiente; enviar una respuesta sí. Los indicadores son independientes por médico y la retención conserva la última pregunta pendiente.
- **Alta profesional:** elegir Doctor en el registro exige el código del administrador. El servidor valida el código exacto durante la inserción en Auth, elimina el código de la metadata y consume una autorización de uso único para asignar el rol. No hay una comparación con el código dentro del frontend. Un cambio posterior de metadata no convierte a un paciente en médico. Para cambiar el código se actualiza `private.doctor_registration_settings.code_hash` desde una conexión administrativa; no se expone esa tabla por la API.

El alta real mediante Supabase Auth se debe comprobar después de aplicar la migración remota. Las pruebas locales cubren códigos ausentes/incorrectos, creación profesional válida, eliminación del código, protección de roles y pendientes por conversación.
