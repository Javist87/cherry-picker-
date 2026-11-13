// Fiktive eksempelsaker for utviklingsprofilen. Ingen reelle opplysninger. Brukes ikke i test eller produksjon.
import { DEV_USERS } from './adapters/dev-identity.mjs';
import { dateInOslo } from './clock.mjs';

const [selgerA, selgerB, selgerC, selgerV] = DEV_USERS;
const offset = (clock, days) => { const d = new Date(dateInOslo(clock.now()) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export async function seedDevData(service, clock) {
  const rows = [
    [selgerA, 'Eksempelsak 001', 'Trondheim', 'trondelag-1', 'dialog', 'application', 'website', 'Avtal en innledende samtale', 0, '', ''],
    [selgerA, 'Eksempelsak 002', 'Stjørdal', 'trondelag-1', 'on_hold', 'awaiting_decision', 'fair', 'Sjekk status på søknad', 7, 'Venter på kommunen', ''],
    [selgerA, 'Eksempelsak 003', 'Malvik', 'trondelag-1', 'dialog', 'decision_made', 'referral', 'Avklar oppstart med koordinator', 1, '', offset(clock, -3)],
    [selgerB, 'Eksempelsak 004', 'Orkland', 'trondelag-1', 'new', 'unclear', 'phone', 'Svar på henvendelsen', 1, '', ''],
    [selgerC, 'Eksempelsak 005', 'Melhus', 'trondelag-2', 'dialog', 'application', 'email', 'Send informasjon', 3, '', ''],
    [selgerV, 'Eksempelsak 006', 'Bergen', 'vestland-1', 'new', 'unclear', 'website', 'Ring eksempelkontakt', 2, '', ''],
  ];
  let i = 0;
  for (const [owner, name, municipality, team, status, bpa, source, description, due, reason, agreementDate] of rows) {
    i += 1;
    await service.createCase({ principal: owner, requestId: '00000000-0000-4000-8000-0000000000f' + i }, {
      name, municipality, department: owner.departments[0], team, ownerId: owner.id, status, bpa, source, reason, agreementDate,
      contact: { displayName: 'Eksempelkontakt ' + i, email: `demo${i}@example.invalid` },
      action: { description, dueDate: offset(clock, due) },
    });
  }
}
