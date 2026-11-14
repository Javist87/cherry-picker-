# Tilgangsmatrise – forslag, bygget med utviklingsadaptere

Status: forslag til vurdering, 13. november 2026. Matrisen er ikke godkjent. Den håndheves i `server/access.mjs` og er testet mot API-et over HTTP, men bare med testinnlogging og lagring i minnet. Prototypens «Test som» og serverens testinnlogging er ikke sikkerhet. Rollenavn, omfang og enkeltceller må godkjennes, se beslutning B-05, B-06 og B-12 i [backlog.md](backlog.md).

Grunnlag: [architecture.md](architecture.md), CLAUDE.md og issue #2. Prosjektbeskrivelsen «Salgsverktøy Medvind 1.0 beta» ligger ikke i repoet og er ikke lest. Rollene under er derfor utledet av arkitekturnotatet og må avstemmes mot faktisk organisering.

## Prinsipper

1. **Avslag er standard.** En operasjon er bare tillatt når en rolle gir den og saken ligger i rollens omfang.
2. **Alt avgjøres på server**, ved hvert lese-, søke-, skrive- og eksportkall. Klienten kan skjule knapper, men det er aldri tilgangskontroll.
3. **Tre dimensjoner:** rolle, organisatorisk tilhørighet (avdeling, team) og sakstildeling (eier, ansvarlig for åpen handling, ventende mottaker).
4. **Teknisk rolle gir ikke personinnsyn.** Teknisk administrator har oppsett, men ingen saks-, søke-, eksport- eller rapporttilgang.
5. **Aggregater erstatter innsyn** der det er tilstrekkelig. Rollen `leder` ser bare antall per gruppe.
6. **Eksistens skal ikke lekke.** Oppslag på en sak utenfor innsyn gir samme svar som en sak som ikke finnes.
7. **Tilgang og avslag loggføres** som AuditEvent, se [backend-contract.md](backend-contract.md).

## Roller

| Rolle | Beskrivelse | Tilhørighet som må være satt |
|---|---|---|
| `selger` | Følger opp egne saker. | Avdeling og team |
| `teamleder` | Fordeler og følger opp sakene i eget team. | Avdeling og team |
| `avdelingsleder` | Ansvar for alle saker i egen avdeling. | Avdeling |
| `leder` | Trenger tall på tvers, ikke enkeltsaker. | Ingen |
| `teknisk_admin` | Teknisk oppsett: kodeverk, integrasjonsoppsett, driftsstatus. | Ingen |
| `revisor` | Leser revisjonslogg, for eksempel personvern- eller internkontrollansvarlig. | Ingen |
| `inntak` | Tjenestekonto for nettskjema. Ikke en person. | Ingen |

En bruker kan ha flere roller. Effektiv tilgang er summen av rollene, aldri mer. Mottaker av overlevering er ikke en egen rolle. Mottakeren er en bruker som er pekt ut i en konkret overlevering.

## Omfang

| Omfang | Saken er i omfanget når |
|---|---|
| `eier` | brukeren er sakens eier |
| `ansvarlig` | brukeren er ansvarlig for sakens åpne handling |
| `mottaker` | brukeren er mottaker i en ventende overlevering |
| `tildelt` | ett av de tre over gjelder |
| `team` | sakens team er et av brukerens team |
| `avdeling` | sakens avdeling er en av brukerens avdelinger |
| `alle` | ingen saksavgrensning; brukes bare for operasjoner uten personsaksinnsyn |

## Matrise

`—` betyr ingen tilgang. Tabellen er maskinlest: `npm run test:contract` feiler hvis den avviker fra `contract/reference-model.mjs`.

<!-- matrix:start -->
| Operasjon | selger | teamleder | avdelingsleder | leder | teknisk_admin | revisor | inntak |
|---|---|---|---|---|---|---|---|
| `case.read` | tildelt | team | avdeling | — | — | — | — |
| `case.search` | tildelt | team | avdeling | — | — | — | — |
| `case.create` | team | team | avdeling | — | — | — | — |
| `case.update` | eier | team | avdeling | — | — | — | — |
| `action.complete` | ansvarlig | ansvarlig | ansvarlig | — | — | — | — |
| `handoff.request` | eier | team | avdeling | — | — | — | — |
| `handoff.confirm` | mottaker | mottaker | mottaker | — | — | — | — |
| `case.reassign` | — | team | avdeling | — | — | — | — |
| `activity.create` | eier | team | avdeling | — | — | — | — |
| `case.export` | — | — | avdeling | — | — | — | — |
| `report.aggregate` | — | team | avdeling | alle | — | — | — |
| `audit.read` | — | — | — | — | — | alle | — |
| `admin.config` | — | — | — | — | alle | — | — |
| `intake.submit` | — | — | — | — | — | — | alle |
| `directory.read` | avdeling | avdeling | avdeling | — | — | — | — |
<!-- matrix:end -->

Hva operasjonene dekker:

- `case.read` gjelder også sakens Person, Contact, Relationship, Action, Handoff og sakshistorikk. Det finnes ingen egen vei til person- eller kontaktdata utenom en sak brukeren har innsyn i.
- `case.search` gjelder liste, søk, filtre og egen arbeidsdag. Treff og antall beregnes bare av saker i omfanget.
- `activity.create` er logging av gjennomført kontakt eller notat på saken. Raden er lagt til 14. november 2026 med samme omfang som `case.update`. Aktiviteter leses som del av saken (`case.read`).
- `case.reassign` er eierskifte uten mottaksbekreftelse, for eksempel ved fravær. Det er holdt adskilt fra overlevering, som krever bekreftelse.
- `report.aggregate` gir antall per gruppe. Se regler under.
- `admin.config` gir ikke adgang til å tildele seg selv saksroller, se beslutning B-12.
- `directory.read` gir navn, avdeling og team for kolleger med saksrolle i egne avdelinger. Raden er lagt til under bygging, fordi klienten må kunne vise mulige ansvarlige og mottakere. Den gir ikke saks- eller personinnsyn.

## Svar ved avslag

| Situasjon | Svar |
|---|---|
| Ingen gyldig sesjon | 401 `unauthenticated` |
| Ingen av brukerens roller har operasjonen | 403 `forbidden_operation` |
| Brukeren kan lese saken, men operasjonen er utenfor omfanget | 403 `forbidden_scope` |
| Saken er utenfor brukerens innsyn, eller finnes ikke | 404 `not_found`, identisk svar i begge tilfeller |
| Opprettelse i annet team eller annen avdeling | 403 `forbidden_scope` |

## Særregler

**Overlevering.** Ventende mottaker får lesetilgang til saken for å kunne vurdere den, og kan bekrefte. Mottakeren kan ikke endre saken før ansvaret er flyttet. Tidligere eier mister tilgang som `tildelt` når overleveringen er bekreftet, og beholder bare det team- eller avdelingsrollen gir.

**Aktivitetslogg.** Aktiviteter kan bare legges til. Ventende mottaker kan lese loggen, men ikke logge før ansvaret er flyttet. Notatteksten skrives ikke til revisjonsloggen. Om selger som er ansvarlig for åpen handling uten å eie saken også skal kunne logge er ikke avklart, se B-05.

**Aggregater.** Svaret inneholder bare gruppe og antall, aldri saks-, person- eller kontaktidentitet. Tillatte grupperinger er status, BPA-prosess, kilde, kommune, avdeling og team. Gruppering på ansvarlig er ikke tillatt i forslaget, fordi det er resultatmåling av ansatte og bør besluttes særskilt. Grupper med færre enn fem saker undertrykkes. Terskelen er et forslag, se B-06.

Kjent svakhet: undertrykte celler kan regnes ut hvis totalsum eller overlappende perioder også vises. Referansemodellen løser ikke dette. Før rapporter tas i bruk må det besluttes om totaler skal avrundes, om flere celler skal undertrykkes, eller om minste periode skal begrenses.

**Eksport.** Krever oppgitt formål, loggføres med formål og antall saker, og er avgrenset til avdeling. Forslaget gir ikke selger eller teamleder eksport. Om eksport av personsaksdata i det hele tatt skal tilbys i beta bør vurderes, se B-05.

**Dublettkontroll.** Dublettsøk kan avsløre at en person finnes i en annen avdeling. Forslag: detaljer vises bare for treff i brukerens omfang. Ved treff utenfor omfanget får brukeren beskjed om mulig dublett uten identifiserende opplysninger, og saken rutes til en som har myndighet til å vurdere den. Krever beslutning, se B-09.

**Avsluttede saker.** Følger samme leseomfang som aktive saker inntil lagringstid og sletting er besluttet, se B-10.

## Negative tester

Testene under skal bestå mot et produksjonslikt miljø før pilot med reelle data. «Referansemodell» er `test/contract.test.mjs`. «API» er `test/api/access.test.mjs`, som kjører over HTTP mot serveren med utviklingsadaptere og testbrukere per rolle. Ingen av testene er kjørt mot reell database eller reell innlogging.

| ID | Type | Forventet resultat | Referansemodell | API med utviklingsadaptere | Forbehold |
|---|---|---|---|---|---|
| N-01 | Direkte oppslag | Selger får 404 på kollegas sak i samme team, sak i annet team og sak i annen avdeling. | Ja | Ja |  |
| N-02 | Direkte oppslag | Svar utenfor innsyn er identisk med svar for sak som ikke finnes. | Ja | Ja | Status, innhold og headere er like. Svartid er ikke målt. |
| N-03 | Direkte oppslag | Teamleder får 404 utenfor team. Avdelingsleder får 404 utenfor avdeling. | Ja | Ja |  |
| N-04 | Søk | Treff og totalantall inneholder bare saker i omfanget, også ved søk på eksakt navn. | Ja | Ja |  |
| N-05 | Søk | Teknisk administrator, leder, revisor og inntakstjeneste får 403 på søk. | Ja | Ja |  |
| N-06 | Endring | Selger får 404 ved endring av sak selgeren ikke eier. | Ja | Ja |  |
| N-07 | Endring | Ventende mottaker får 403 ved endring før bekreftelse. | Ja | Ja |  |
| N-08 | Endring | Bare ansvarlig kan fullføre åpen handling. Bare mottaker kan bekrefte overlevering. | Ja | Ja |  |
| N-09 | Endring | Selger kan ikke gjennomføre eierskifte. | Ja | Ja | Heller ikke ved å sende `ownerId` i PATCH. |
| N-10 | Endring | Opprettelse i annet team eller annen avdeling gir 403. | Ja | Ja | Gjelder også flytting med PATCH. |
| N-11 | Endring | Tidligere eier mister tilgang etter bekreftet overlevering. | Ja | Ja |  |
| N-12 | Eksport | Selger og teamleder får 403. Avdelingsleder får bare egen avdeling. | Ja | Ja |  |
| N-13 | Eksport | Eksport uten formål avvises med 422. | Ja | Ja |  |
| N-14 | Teknisk administrator | 403 på oppslag, søk, endring, eksport, aggregater og revisjonslogg. | Ja | Ja |  |
| N-15 | Leder | 403 på enkeltsaker, søk og eksport. Aggregatsvar inneholder ingen identiteter. | Ja | Ja |  |
| N-16 | Aggregater | Små grupper undertrykkes. Gruppering på navn eller ansvarlig avvises. | Ja | Ja | Utregning ved overlappende perioder er ikke løst (B-06). |
| N-17 | Uten rolle | Bruker uten rolle får 403 på alle operasjoner. Uten sesjon gir 401. | Ja | Ja |  |
| N-18 | Flere roller | Kombinasjon av roller gir ikke tilgang utover summen. | Ja | Ja |  |
| N-19 | Underressurser | Person, Contact, Relationship, Action og Handoff kan ikke hentes via egen ID uten innsyn i tilhørende sak. | Nei | Ja | Det finnes ingen ruter for underressurser utenom saken. |
| N-20 | Revisjonslogg | Hvert avslag og hver eksport gir AuditEvent. Loggen kan ikke endres eller slettes via API. | Nei | Ja | Testet mot lagring i minnet. Varig lagring og databaserettigheter gjenstår (B-03). |
| N-21 | Sesjon | Endret rolle eller tilhørighet får virkning uten ny innlogging innen avtalt tid. Utløpt sesjon gir 401. | Nei | Ja | Bare mot testinnlogging, der endring virker umiddelbart. Må kjøres på nytt mot valgt identitetsløsning (B-02). |
| N-22 | Dublett | Dublettsvar avslører ikke opplysninger om saker utenfor omfanget. | Nei | Ja | Svaret sier at det finnes et mulig treff utenfor omfanget. Om det er akseptabelt må besluttes (B-09). |
| N-23 | Aktivitet | Selger får 404 ved logging på sak selgeren ikke har innsyn i. Ventende mottaker får 403. Roller uten saksinnsyn får 403. Avslag loggføres uten notattekst. | Nei | Ja | `test/api/activities.test.mjs`. Lagt til 14. november 2026. |

## Åpne spørsmål i matrisen

Disse er samlet i beslutningsregisteret i [backlog.md](backlog.md): B-02 (hvor roller og tilhørighet hentes fra), B-05 (godkjenning av cellene, særlig avdelingsleders skrivetilgang, teamleders innsyn og eksport), B-06 (terskel og differansekontroll for aggregater), B-08 (avslag og tilbaketrekking av overlevering), B-09 (dublett på tvers av avdelinger), B-10 (innsyn i avsluttede saker) og B-12 (rollekombinasjoner og nødtilgang).
