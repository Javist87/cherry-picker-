# Kontroll – 12. november 2026

- `npm test`: 9 av 9 tester bestått. Dekker obligatorisk oppfølging, pause/avslutningsårsak, dubletter, datovalidering, milepæler, rapportgrunnlag, historikk og bekreftet overlevering.
- `node --check` på app.mjs, domain.mjs og server.mjs: bestått.
- Nettlesertest: laget, men ikke gjennomført i denne kjøringen. Playwrights standard Chromium manglet. Systemets Chromium feilet ved oppstart: `socket() failed: Operation not permitted`. Delt nettleser fikk `ERR_CONNECTION_REFUSED` mot lokal server. Derfor er visuell kontroll og nettleserflyt ikke verifisert.
- CI: lagt til GitHub Actions som kjører regeltester og Playwright med installert Chromium. Resultatet er ikke kjent ved første levering.
- Ingen produksjonssetting, reelle data, eksterne integrasjoner eller tilgangstester mot faktisk innlogging utført.

## Pilotkontroll som gjenstår
Åpne desktop og mobil. Registrer, søk, oppdater, pause med årsak, sett avtaledato uten ordningsnummer, be om overlevering og bekreft som mottaker. Kontroller rapportens inkluder­te saker. Test tastatur, leserekkefølge, kontrast, zoom og smal skjerm. Reell tilgangskontroll skal først testes når backend og jobbinnlogging er implementert.

## Bekreftet CI-resultat
GitHub Actions-kjøring 43311799955 (PR #1, kode 114636c4c06b5674aa6b227379738260280552bb) fullførte nettlesertesten: registrering, obligatoriske felt, søk/ingen treff, redigering, mottaksbekreftet overlevering, bevaring ved gjenlasting, rapporttall, dialog/Escape og mobil uten horisontal side-overflyt. Ingen JavaScript-feil observert. Regeltestene besto også i CI. Lokal blokkering ovenfor ble løst ved å kjøre testen i GitHubs testmiljø. Skjermbilder ble produsert av testen, men manuell visuell gjennomgang gjenstår.

Testkjøring: https://github.com/Javist87/cherry-picker-/actions/runs/43311799955

## Kontrakt og tilgangsmatrise – 13. november 2026
- `npm run test:contract`: 20 av 20 tester bestått. Dekker tilgang ved direkte oppslag, søk, endring og eksport, aggregater, revisjonskontroll og idempotent inntak, og at tabellen i docs/access-matrix.md er lik referansemodellen.
- Testene kjører mot `contract/reference-model.mjs`. Ingen backend finnes, så ingenting er verifisert mot faktisk server, innlogging eller database. N-19 til N-22 i tilgangsmatrisen er ikke testet.
- `npm test`: 12 av 12 regeltester bestått. `app.mjs`, `domain.mjs` og `test/browser.mjs` er ikke endret. Nettlesertesten er ikke kjørt lokalt i denne leveransen; se CI.

## Server, tilgang og klient mot API – 13. november 2026

Kjørt lokalt med Node.js 22.23.4. Alle tall er fra faktiske kjøringer.

| Kommando | Resultat | Hva den kjører mot |
|---|---|---|
| `npm test` | 12 av 12 bestått | Prototypens regler i `domain.mjs` |
| `npm run test:contract` | 20 av 20 bestått | Referansemodellen |
| `npm run test:api` | 48 av 48 bestått | API-et over HTTP, med utviklingsadaptere |
| `npm run test:browser` | Bestått | Frittstående prototype i Chromium. Testfilen er uendret |
| `npm run test:browser:api` | Bestått | Klienten i API-modus i Chromium |

De 48 API-testene består av N-01 til N-22 (22 tester), de tolv regeltestene speilet mot serveren (12 tester) og 14 tester av feilformat, revisjonskontroll, inntak, ratebegrensning, katalogoppslag, eierskifte, porter og produksjonssperre.

Kontroll av at testene fanger feil: Tilgangskontrollen ble midlertidig svekket to ganger (teamomfang satt til alltid sant, og sesjonskravet slått av). Testene feilet begge ganger (7 og 2 feil), og koden ble satt tilbake.

Søk i repoet etter hemmeligheter og reelle data: ingen funn. Alle e-postadresser bruker `example.invalid`, alle navn er «Eksempel…» eller «Test…», og `.env` er utelukket i `.gitignore`.

### Ikke verifisert

- Ingenting er kjørt mot reell database, reell innlogging eller et produksjonslikt miljø. N-20 og N-21 er derfor bare vist for lagring i minnet og testinnlogging.
- Svartid i N-02 er ikke målt. Like svar er kontrollert for status, innhold og headere.
- Ytelse, samtidige brukere i større omfang og flere serverinstanser er ikke testet.
- Manuell visuell gjennomgang, skjermleser, kontrast og zoom er ikke gjort. Skjermbildene fra nettlesertesten i API-modus er sett på for PC og mobil.
- Sikkerhetskopi, gjenoppretting og sletting finnes ikke og er ikke testet.
- CI-resultatet for denne leveransen må leses av i PR-en.

## Demoversjon med alle roller – 14. november 2026

| Kommando | Resultat |
|---|---|
| `npm test` | 12 av 12 bestått |
| `npm run test:contract` | 20 av 20 bestått |
| `npm run test:api` | 50 av 50 bestått |
| `npm run test:browser` | Bestått, testfilen uendret |
| `npm run test:browser:api` | Bestått. Går gjennom superbruker, leder, avdelingsleder, teamleder, selgere, revisor, teknisk administrator og inntakstjeneste |

Rettet etter automatisk gjennomgang av forrige leveranse: En dialog som fikk 412 kunne lagres ved nytt forsøk og overskrive andres endringer med utdaterte felt. Dialogen bruker nå revisjonen den ble åpnet med, og må åpnes på nytt. Nettlesertesten dekker tilfellet med to forsøk.

Ikke verifisert: det samme som i forrige avsnitt. I tillegg er de nye visningene bare kontrollert automatisk og på ett skjermbilde, ikke manuelt på mobil eller med skjermleser.
