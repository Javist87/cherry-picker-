// Klokke som kan byttes ut i tester. Frister og milepæler vurderes i norsk tid.
const osloDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' });
export const dateInOslo = date => osloDate.format(date);
export const systemClock = { now: () => new Date() };
export const today = clock => dateInOslo(clock.now());
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
    new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
