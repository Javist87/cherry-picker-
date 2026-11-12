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
