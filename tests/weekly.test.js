import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, PILLARS, recordValues, validatePillar } from '../src/lib/domain.js';
import { weeklySummary, weeklyHistory } from '../src/lib/weekly.js';

const day = (date, steps = 7500, cardio = 0, strength = false) => ({
  date,
  pillar: 'actividad',
  data: { version: 3, values: { steps, cardio_minutes: cardio, strength, intensity: 5 } },
});
test('7500 steps daily, 150 cardio minutes and 3 strength days score 100', () => {
  const records = Array.from({ length: 7 }, (_, i) =>
    day(addDays('2026-09-28', i), 7500, i < 3 ? 50 : 0, i < 3),
  );
  const week = weeklySummary(records, '2026-10-04');
  assert.equal(week.activity.score, 100);
  assert.equal(week.score, 100);
  assert.equal(week.activity.days, 7);
  assert.equal(week.start, '2026-09-28');
  assert.equal(week.end, '2026-10-04');
});
test('Excess steps on one day do not replace the next day; each KPI is capped', () => {
  const week = weeklySummary(
    [
      day('2026-09-28', 15000, 600, true),
      day('2026-09-29', 0, 0, true),
      day('2026-09-30', 7500, 0, true),
    ],
    '2026-10-01',
  );
  assert.equal(week.activity.stepsScore, 67);
  assert.equal(week.activity.cardioScore, 100);
  assert.equal(week.activity.strengthScore, 100);
  assert.equal(week.activity.score, 89);
});
test('No records differs from zero; future days and previous Sundays are excluded', () => {
  assert.equal(weeklySummary([], '2026-10-01').activity.score, null);
  const week = weeklySummary(
    [
      day('2026-09-27', 7500, 150, true),
      day('2026-09-28', 0, 0, false),
      day('2026-10-02', 7500, 150, true),
    ],
    '2026-10-01',
  );
  assert.equal(week.activity.score, 0);
  assert.equal(week.activity.days, 1);
  assert.equal(week.elapsedDays, 4);
  assert.equal(week.inProgress, true);
});
test('Legacy exercise remains unknown cardio and strength; duplicate days count once', () => {
  const old = { date: '2026-09-28', pillar: 'actividad', data: [7500, 150, 5, 'nota antigua'] };
  const values = recordValues(
    PILLARS.find((p) => p.key === 'actividad'),
    old.data,
  );
  assert.equal(values.minutes, 150);
  assert.equal(values.note, 'nota antigua');
  assert.equal(values.cardio_minutes, undefined);
  const week = weeklySummary([old], '2026-10-01');
  assert.equal(week.activity.stepsScore, 100);
  assert.equal(week.activity.cardioMinutes, null);
  assert.equal(week.activity.score, null);
  const duplicate = day('2026-09-28', 7500, 50, true);
  assert.equal(weeklySummary([duplicate, duplicate], '2026-10-01').activity.strengthDays, 1);
});
test('Weekly history includes missing weeks and compares common pillars', () => {
  const sleep = (date, quality) => ({
    date,
    pillar: 'sueno',
    data: { values: { hours: 8, quality } },
  });
  const history = weeklyHistory(
    [sleep('2026-09-14', 10), sleep('2026-09-28', 1)],
    '2026-09-14',
    '2026-10-01',
  );
  assert.deepEqual(
    history.weeks.map((week) => week.score),
    [100, null, 0],
  );
  assert.equal(history.trend, -100);
  assert.equal(history.score, 50);
});
test('New movement requires explicit cardio and a boolean strength answer', () => {
  const pillar = PILLARS.find((p) => p.key === 'actividad');
  assert.ok(validatePillar(pillar, { steps: 7500, minutes: 30, intensity: 5 }));
  assert.equal(validatePillar(pillar, day('2026-10-01').data.values), '');
  assert.ok(validatePillar(pillar, { ...day('2026-10-01').data.values, strength: 'true' }));
});
