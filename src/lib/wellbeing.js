import { addDays } from './domain.js';

export function weekStart(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function validEnergy(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10;
}
