import {
  addDays,
  clamp,
  daysBetween,
  isValidDay,
  mean,
  normalizedScore,
  PILLARS,
  recordValues,
} from './domain.js';
import { weekStart } from './wellbeing.js';

export const MOVEMENT_TARGETS = { steps: 7500, cardio: 150, strength: 3 };
const movement = PILLARS.find((p) => p.key === 'actividad');
function numeric(value, max) {
  if (value === '' || value == null || !['number', 'string'].includes(typeof value)) return null;
  if (typeof value === 'string' && !/^[0-9]+([.][0-9]+)?$/.test(value)) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= max ? result : null;
}

export function movementWeek(records) {
  const values = records
    .filter((r) => r.pillar === 'actividad')
    .map((r) => recordValues(movement, r.data));
  const steps = values.map((v) => numeric(v.steps, 100000)).filter((v) => v !== null);
  // Legacy "minutes" mixed different exercises: they cannot be relabeled as cardio.
  const cardio = values.map((v) => numeric(v.cardio_minutes, 600)).filter((v) => v !== null);
  const strength = values.filter((v) => typeof v.strength === 'boolean');
  const stepsScore = mean(steps.map((v) => clamp((v / MOVEMENT_TARGETS.steps) * 100)));
  const cardioMinutes = cardio.length ? cardio.reduce((sum, v) => sum + v, 0) : null;
  const strengthDays = strength.length ? strength.filter((v) => v.strength).length : null;
  const cardioScore =
    cardioMinutes === null
      ? null
      : Math.round(clamp((cardioMinutes / MOVEMENT_TARGETS.cardio) * 100));
  const strengthScore =
    strengthDays === null
      ? null
      : Math.round(clamp((strengthDays / MOVEMENT_TARGETS.strength) * 100));
  return {
    score: [stepsScore, cardioScore, strengthScore].some((v) => v === null)
      ? null
      : mean([stepsScore, cardioScore, strengthScore]),
    stepsScore,
    cardioScore,
    strengthScore,
    cardioMinutes,
    strengthDays,
    stepsAverage: mean(steps),
    stepsDays: steps.length,
    cardioDays: cardio.length,
    strengthRecordedDays: strength.length,
    days: values.filter(
      (v) =>
        numeric(v.steps, 100000) !== null &&
        numeric(v.cardio_minutes, 600) !== null &&
        typeof v.strength === 'boolean',
    ).length,
  };
}

export function weeklySummary(records, anchor, today = anchor) {
  const start = weekStart(anchor);
  const end = addDays(start, 6);
  const until = end < today ? end : today;
  const unique = new Map();
  for (const r of records) {
    if (
      isValidDay(r.date) &&
      r.date >= start &&
      r.date <= until &&
      PILLARS.some((p) => p.key === r.pillar)
    )
      unique.set(`${r.date}/${r.pillar}`, r);
  }
  const rows = [...unique.values()];
  const activity = movementWeek(rows);
  const pillars = PILLARS.map((p) => {
    const values = rows
      .filter((r) => r.pillar === p.key)
      .map(normalizedScore)
      .filter((n) => n !== null);
    return { ...p, score: p.key === 'actividad' ? activity.score : mean(values) };
  });
  return {
    start,
    end,
    until,
    activity,
    pillars,
    score: mean(pillars.map((p) => p.score).filter((n) => n !== null)),
    days: new Set(rows.map((r) => r.date)).size,
    coverage: pillars.filter((p) => p.score !== null).length,
    elapsedDays: Math.max(0, Math.min(7, daysBetween(start, until) + 1)),
    inProgress: today <= end,
  };
}

export function weeklyHistory(records, from, today) {
  const weeks = [];
  for (let day = weekStart(from); day <= today; day = addDays(day, 7))
    weeks.push(weeklySummary(records, day, today));
  const scored = weeks.filter((w) => w.score !== null);
  const first = scored[0];
  const last = scored.at(-1);
  const common =
    first && last
      ? first.pillars.filter(
          (p) => p.score !== null && last.pillars.find((q) => q.key === p.key)?.score !== null,
        )
      : [];
  return {
    weeks,
    score: mean(scored.map((w) => w.score)),
    pillars: PILLARS.map((p) => ({
      ...p,
      score: mean(
        weeks.map((w) => w.pillars.find((q) => q.key === p.key).score).filter((n) => n !== null),
      ),
    })),
    trend:
      scored.length < 2 || !common.length
        ? null
        : mean(common.map((p) => last.pillars.find((q) => q.key === p.key).score)) -
          mean(common.map((p) => p.score)),
  };
}
