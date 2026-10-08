import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey,
  addDays,
  taskDue,
  adherence,
  habitSummary,
  validateTask,
  validatePillar,
  PILLARS,
  isValidDay,
} from '../src/lib/domain.js';
const record = (date, pillar, values) => ({ date, pillar, data: { version: 2, values } });
test('La tendencia compara pilares comunes, sin inventar una mejora por menor cobertura', () => {
  const summary = habitSummary([
    record('2026-09-20', 'sueno', { hours: 7, quality: 10 }),
    record('2026-09-20', 'estres', { stress: 10, minutes: 0 }),
    record('2026-09-21', 'sueno', { hours: 7, quality: 10 }),
  ]);
  assert.equal(summary.trend, 0);
  assert.equal(summary.trendCoverage, 1);
  assert.equal(summary.coverage, 3);
  assert.equal(
    habitSummary([
      record('2026-09-20', 'sueno', { hours: 7, quality: 10 }),
      record('2026-09-21', 'estres', { stress: 1, minutes: 0 }),
    ]).trend,
    null,
  );
});
test('Las pausas conservan el cumplimiento del día y permiten reanudar sin rellenar días ausentes', () => {
  const task = {
    id: 'task',
    start_date: '2026-09-01',
    frequency: 'daily',
    active: false,
    active_periods: [
      { from: '2026-09-01', to: '2026-09-03' },
      { from: '2026-09-06', to: null },
    ],
  };
  assert.equal(taskDue(task, '2026-09-03'), true);
  assert.equal(taskDue(task, '2026-09-04'), false);
  assert.equal(taskDue(task, '2026-09-06'), true);
  assert.deepEqual(
    adherence(
      [task],
      [{ task_id: 'task', completion_date: '2026-09-03', completed: true }],
      ['2026-09-03', '2026-09-04'],
    ).score,
    100,
  );
});
test('Fechas reales, zonas horarias y programación semanal', () => {
  assert.equal(isValidDay('2026-02-30'), false);
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(dateKey(new Date('2026-01-01T01:00:00Z'), 'America/Santiago'), '2025-12-31');
  assert.equal(
    taskDue(
      { start_date: '2026-09-01', active: true, frequency: 'weekly', days_of_week: [1] },
      '2026-09-21',
    ),
    true,
  );
  assert.ok(
    validateTask({
      title: 'Actividad',
      task_type: 'general',
      frequency: 'weekly',
      days_of_week: [8],
      start_date: '2026-09-21',
    }),
  );
});
test('Los valores vacíos, fuera de rango y las horas inválidas se rechazan', () => {
  const pillar = PILLARS.find((p) => p.key === 'sueno');
  assert.ok(validatePillar(pillar, { hours: '', quality: 8 }));
  assert.ok(validatePillar(pillar, { hours: 25, quality: 8 }));
  assert.ok(validatePillar(pillar, { hours: 8, quality: 8, bedtime: '25:80' }));
  assert.equal(validatePillar(pillar, { hours: 8, quality: 8, bedtime: '23:00' }), '');
});
