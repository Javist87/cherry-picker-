// Fiktive eksempelsaker for utviklingsprofilen. Ingen reelle opplysninger. Brukes ikke i test eller produksjon.
// Datasettet er laget slik at hver rolle har noe å vise: forfalte og kommende frister, pause, avtale,
// ventende overlevering, avsluttet sak, to avdelinger, og nok saker til at aggregater ikke bare er skjult.
import { DEV_USERS } from './adapters/dev-identity.mjs';
import { dateInOslo } from './clock.mjs';

const byName = name => DEV_USERS.find(u => u.displayName === name);
const offset = (clock, days) => { const d = new Date(dateInOslo(clock.now()) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export async function seedDevData(service, clock) {
  const A = byName('Test Selger A'), B = byName('Test Selger B'), C = byName('Test Selger C'), V = byName('Test Selger V');
  const TL = byName('Test Teamleder T1');
  const ago = n => offset(clock, -n);
  // [eier, kommune, team, status, bpa, kilde, neste handling, frist om dager, årsak, avtaledato, oppstartsdato]
  const rows = [
    [A, 'Trondheim', 'trondelag-1', 'dialog', 'application', 'website', 'Avtal en innledende samtale', 0],
    [A, 'Stjørdal', 'trondelag-1', 'on_hold', 'awaiting_decision', 'fair', 'Sjekk status på søknad', 7, 'Venter på kommunen'],
    [A, 'Malvik', 'trondelag-1', 'dialog', 'decision_made', 'referral', 'Avklar oppstart med koordinator', 1, '', ago(3)],
    [A, 'Trondheim', 'trondelag-1', 'new', 'unclear', 'phone', 'Ring tilbake', 2],
    [B, 'Orkland', 'trondelag-1', 'new', 'unclear', 'phone', 'Svar på henvendelsen', 1],
    [B, 'Trondheim', 'trondelag-1', 'dialog', 'application', 'website', 'Send informasjon om ordningen', 3],
    [B, 'Melhus', 'trondelag-1', 'dialog', 'provider_change', 'referral', 'Avtal møte', 5, '', ago(1)],
    [B, 'Trondheim', 'trondelag-1', 'closed', 'provider_change', 'email', '', 0, 'Overlevert til drift', ago(10), ago(2)],
    [C, 'Melhus', 'trondelag-2', 'dialog', 'application', 'email', 'Send informasjon', 3],
    [C, 'Levanger', 'trondelag-2', 'new', 'unclear', 'website', 'Ring eksempelkontakt', 0],
    [C, 'Steinkjer', 'trondelag-2', 'on_hold', 'awaiting_decision', 'fair', 'Ny vurdering', 14, 'Venter på vedtak'],
    [C, 'Levanger', 'trondelag-2', 'dialog', 'decision_made', 'website', 'Avklar oppstart', 4, '', ago(2)],
    [V, 'Bergen', 'vestland-1', 'new', 'unclear', 'website', 'Ring eksempelkontakt', 2],
    [V, 'Bergen', 'vestland-1', 'dialog', 'application', 'phone', 'Følg opp søknad', 1],
    [V, 'Voss', 'vestland-1', 'dialog', 'awaiting_decision', 'referral', 'Sjekk status', 6],
    [V, 'Askøy', 'vestland-1', 'on_hold', 'awaiting_decision', 'fair', 'Ny vurdering', 10, 'Venter på kommunen'],
    [V, 'Bergen', 'vestland-1', 'dialog', 'decision_made', 'email', 'Avklar oppstart', 3, '', ago(1)],
    [V, 'Voss', 'vestland-1', 'new', 'unclear', 'website', 'Svar på henvendelsen', 0],
  ];
  const created = [];
  let i = 0;
  for (const [owner, municipality, team, status, bpa, source, description, due, reason = '', agreementDate = '', startDate = ''] of rows) {
    i += 1;
    const n = String(i).padStart(3, '0');
    const result = await service.createCase({ principal: owner, requestId: '00000000-0000-4000-8000-000000000' + n }, {
      name: 'Eksempelsak ' + n, municipality, department: owner.departments[0], team, ownerId: owner.id, status, bpa, source, reason, agreementDate, startDate,
      contact: { displayName: 'Eksempelkontakt ' + n, email: `demo${n}@example.invalid` },
      ...(status === 'closed' ? {} : { action: { description, dueDate: offset(clock, due) } }),
    });
    created.push(result);
  }
  // Ventende overlevering fra Selger A til Selger B (sak 003 har avtale), og én fullført oppfølging på sak 006.
  const handoverCase = created[2];
  await service.requestHandoff({ principal: A, requestId: '00000000-0000-4000-8000-0000000000a1' }, handoverCase.body.id, handoverCase.etag, { toUserId: B.id });
  const followup = created[5];
  await service.completeAction({ principal: B, requestId: '00000000-0000-4000-8000-0000000000a2' }, followup.body.id, followup.body.openAction.id, followup.etag, { next: { description: 'Ring for å bekrefte mottak', dueDate: offset(clock, 2) } });
  // Ett eierskifte utført av teamleder, slik at revisjonsloggen viser begrunnelse.
  const reassigned = created[3];
  await service.reassignCase({ principal: TL, requestId: '00000000-0000-4000-8000-0000000000a3' }, reassigned.body.id, reassigned.etag, { toUserId: B.id, reason: 'Fordeling av arbeidsmengde (demo)' });
}
