import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  PILLARS,
  recordValues,
  normalizedScore,
  TASK_TYPES,
  FREQUENCIES,
  WEEKDAYS,
  TIME_ZONE,
  dateKey,
} from './domain.js';

const GREEN = [40, 124, 89];
const INK = [35, 61, 50];
const MUTED = [93, 110, 102];
const text = (value) =>
  value === null || value === undefined || value === ''
    ? 'Sin dato'
    : String(value).normalize('NFC');
const valueWithUnit = (value, unit) =>
  value === null || value === undefined || value === '' ? 'Sin dato' : `${value} ${unit}`;
const day = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : text(value);
const timestamp = (value, timeZone) => {
  if (!value || Number.isNaN(Date.parse(value))) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
};
const newest = (rows, key) =>
  [...rows].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')));
const yesNo = (value) => (value == null ? 'Sin dato' : value ? 'Sí' : 'No');

/** Builds the whole report locally. fontBase64 is an embedded, licensed Unicode font. */
export function createPatientPdf(data, { fontBase64, generatedAt = new Date() } = {}) {
  if (!fontBase64) throw new Error('No se pudo cargar la tipografía del PDF.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  doc.addFileToVFS('DejaVuSans.ttf', fontBase64);
  doc.addFont('DejaVuSans.ttf', 'Vitalia', 'normal');
  doc.setFont('Vitalia', 'normal');
  doc.setProperties({
    title: 'Vitalia - Mis datos personales',
    subject: 'Exportación personal de datos',
    author: 'Vitalia',
    creator: 'Vitalia',
  });
  const profile = data.profile || {};
  const timezone = profile.timezone || TIME_ZONE;
  const doctors = new Map(
    (data.professionals || []).map((person) => [person.id, person.full_name]),
  );
  const tasks = new Map((data.tasks || []).map((task) => [task.id, task]));
  const doctorName = (id) => doctors.get(id) || (id ? `Profesional: ${id}` : 'Sin profesional');
  let y = 37;
  doc.setTextColor(...INK);
  doc.setFontSize(22);
  doc.text('Mi información de salud', 16, y);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Generado el ${timestamp(generatedAt.toISOString(), timezone)} · ${timezone}`, 16, y);
  y += 7;
  const intro = doc.splitTextToSize(
    'Copia de tus datos guardados en Vitalia. Incluye todo el historial disponible al momento de exportar. Los indicadores de hábitos son orientativos, no una evaluación clínica.',
    178,
  );
  doc.text(intro, 16, y);
  y += intro.length * 4.5 + 8;

  function section(title, headers, rows, widths) {
    if (y > 245) {
      doc.addPage();
      y = 34;
    }
    doc.setFont('Vitalia', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...GREEN);
    doc.text(title, 16, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows.length
        ? rows
        : [[{ content: 'Sin registros disponibles.', colSpan: headers.length }]],
      theme: 'striped',
      margin: { top: 33, right: 16, bottom: 20, left: 16 },
      styles: {
        font: 'Vitalia',
        fontStyle: 'normal',
        fontSize: 8,
        cellPadding: 2.8,
        overflow: 'linebreak',
        textColor: INK,
        lineColor: [227, 234, 228],
        lineWidth: 0.1,
      },
      headStyles: {
        fontStyle: 'normal',
        fillColor: GREEN,
        textColor: [255, 255, 255],
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [246, 249, 246] },
      columnStyles: Object.fromEntries(widths.map((width, index) => [index, { cellWidth: width }])),
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  const personal = [
    ['Nombre completo', text(profile.full_name)],
    ['Correo', text(profile.email)],
    ['Edad', valueWithUnit(profile.age, 'años')],
    ['Peso actual declarado', valueWithUnit(profile.weight, 'kg')],
    ['Estatura', valueWithUnit(profile.height, 'cm')],
    ['Grasa corporal', valueWithUnit(profile.body_fat, '%')],
    ['Zona horaria', timezone],
  ];
  if (profile.sex != null) personal.push(['Sexo registrado', text(profile.sex)]);
  for (const [key, label] of [
    ['risk_hta', 'Antecedente registrado: hipertensión'],
    ['risk_dm2', 'Antecedente registrado: diabetes tipo 2'],
    ['risk_dislipidemia', 'Antecedente registrado: dislipidemia'],
  ]) {
    if (profile[key] != null) personal.push([label, yesNo(profile[key])]);
  }
  section('1. Perfil personal', ['Dato', 'Valor guardado'], personal, [68, 110]);
  section(
    '2. Equipo de salud actual',
    ['Profesional', 'Acceso'],
    (data.relationships || []).map((link) => [
      doctorName(link.doctor_id),
      'Vinculado al momento de exportar',
    ]),
    [108, 70],
  );
  section(
    '3. Historial de medidas corporales',
    ['Fecha', 'Peso', 'Estatura', 'Grasa', 'Origen'],
    newest(data.measurements || [], 'recorded_at').map((row) => [
      timestamp(row.recorded_at, timezone),
      valueWithUnit(row.weight, 'kg'),
      valueWithUnit(row.height, 'cm'),
      valueWithUnit(row.body_fat, '%'),
      row.source === 'baseline' ? 'Valor al activar el historial' : 'Actualización del perfil',
    ]),
    [45, 27, 27, 27, 52],
  );
  section(
    '4. Registros de hábitos',
    ['Fecha / pilar', 'Respuestas', 'Nota'],
    newest(data.records || [], 'date').map((record) => {
      const pillar = PILLARS.find((item) => item.key === record.pillar);
      const values = pillar
        ? recordValues(pillar, record.data)
        : record.data?.values || record.data || {};
      const details = pillar
        ? pillar.fields
            .map((field) => `${field.label}: ${valueWithUnit(values[field.key], field.unit || '')}`)
            .join('\n')
        : typeof values === 'object'
          ? Object.entries(values)
              .filter(([key]) => key !== 'note')
              .map(([key, value]) => `${key}: ${text(value)}`)
              .join('\n')
          : text(values);
      const score = normalizedScore(record);
      return [
        `${day(record.date)}\n${pillar?.name || text(record.pillar)}\nIndicador: ${score == null ? 'Sin dato' : `${score}/100`}`,
        details,
        text(values.note),
      ];
    }),
    [37, 88, 53],
  );
  section(
    '5. Plan de actividades e indicaciones',
    ['Actividad / profesional', 'Indicación y horario', 'Vigencia e historial'],
    newest(data.tasks || [], 'start_date').map((task) => {
      const days = (task.days_of_week || [])
        .map((index) => WEEKDAYS[index - 1])
        .filter(Boolean)
        .join(', ');
      const periods = Array.isArray(task.active_periods)
        ? task.active_periods
            .map((period) => `${day(period.from)} - ${period.to ? day(period.to) : 'sin cierre'}`)
            .join('\n')
        : 'Historial anterior no disponible';
      return [
        `${text(task.title)}\n${TASK_TYPES[task.task_type]?.name || text(task.task_type)}\n${doctorName(task.doctor_id)}`,
        [
          `Descripción: ${text(task.description)}`,
          `Instrucciones: ${text(task.instructions)}`,
          `Frecuencia: ${FREQUENCIES[task.frequency] || text(task.frequency)}${days ? ' (' + days + ')' : ''}`,
          `Hora: ${task.task_time?.slice(0, 5) || 'Sin horario fijo'}`,
          ...(task.measurement_unit ? [`Unidad: ${task.measurement_unit}`] : []),
        ].join('\n'),
        [
          `Desde: ${day(task.start_date)}`,
          `Hasta: ${task.end_date ? day(task.end_date) : 'Sin fecha de término'}`,
          `Estado: ${task.archived_at ? 'Archivada' : task.active ? 'Activa' : 'Pausada'}`,
          `Períodos activos:\n${periods}`,
        ].join('\n'),
      ];
    }),
    [54, 68, 56],
  );
  section(
    '6. Cumplimientos y mediciones de actividades',
    ['Fecha / actividad', 'Estado / resultado', 'Nota o motivo'],
    newest(data.completions || [], 'completion_date').map((row) => {
      const task = tasks.get(row.task_id);
      return [
        `${day(row.completion_date)}\n${task?.title || 'Actividad histórica'}`,
        [
          row.completed ? 'Completada' : 'Pendiente',
          ...(row.measurement_value != null
            ? [valueWithUnit(row.measurement_value, task?.measurement_unit || '')]
            : []),
          ...(row.completed_at ? [`Registrada: ${timestamp(row.completed_at, timezone)}`] : []),
        ].join('\n'),
        text(row.note),
      ];
    }),
    [61, 57, 60],
  );
  section(
    '7. Historial de autorizaciones',
    ['Profesional / fechas', 'Aceptación registrada'],
    newest(data.consents || [], 'accepted_at').map((row) => [
      `${doctorName(row.doctor_id)}\nAceptado: ${timestamp(row.accepted_at, timezone)}\n${row.revoked_at ? 'Retirado: ' + timestamp(row.revoked_at, timezone) : 'Acceso vigente'}`,
      `Versión: ${text(row.text_version)}\n${text(row.accepted_text)}`,
    ]),
    [65, 113],
  );

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont('Vitalia', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(...GREEN);
    doc.text('vitalia.', 16, 19);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('EXPORTACIÓN PERSONAL', 194, 18, { align: 'right' });
    doc.setDrawColor(220, 230, 223);
    doc.line(16, 24, 194, 24);
    doc.line(16, 280, 194, 280);
    doc.setFontSize(7);
    doc.text('Datos personales - comparte este archivo solo con quien elijas.', 16, 285);
    doc.text(`${page} / ${total}`, 194, 285, { align: 'right' });
  }
  return doc;
}

export async function downloadPatientPdf(data) {
  const response = await fetch(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url));
  if (!response.ok) throw new Error('No se pudo cargar la tipografía del PDF.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768)
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  const generatedAt = new Date();
  const doc = createPatientPdf(data, { fontBase64: btoa(binary), generatedAt });
  doc.save(`mis-datos-vitalia-${dateKey(generatedAt, data.profile?.timezone || TIME_ZONE)}.pdf`);
}
