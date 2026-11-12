# Arkitektur og grenser

## Prototype 0.1
Vanilla JavaScript ESM, HTML og CSS. Ingen tredjepartskode eller eksterne nettverkskall i appen. Node-serveren serverer bare fem eksplisitt tillatte filer, binder til localhost og sender CSP. `domain.mjs` isolerer testbare forretningsregler; `app.mjs` er visning og demotilstand. sessionStorage begrenser levetiden, men gir ingen konfidensialitetsgaranti.

## Produksjonsmodell – forslag, ikke implementert
Skill Person, Contact, Relationship og SalesCase i databasen. En kontakt kan representere flere personer og saker. Case inneholder avdeling, team, eier, kontaktløp, BPA-prosess og to separate milepæler. Action har ansvarlig, frist og fullført-tid; Handoff har avsender, mottaker, forespurt-tid og bekreftet-tid. Source/Campaign skal ikke innebære markedsføringssamtykke. AuditEvent må ligge på server og registrere relevante endringer og tilgang.

Entra ID er en kandidat for jobbinnlogging; faktisk tenant og godkjent drift må avklares. Bruk OIDC og validerte sesjoner på server. Sjekk tilgang ved hvert lese-, søke-, skrive- og eksportkall. Administrator får teknisk oppsett uten automatisk personinnsyn; leder får aggregater der det er tilstrekkelig. Ikke bruk klientfiltre som sikkerhet. Data skal ikke ligge i GitHub, Drive-logger eller nettleserlagring i produksjon.

Inntak fra nettskjema krever ratebegrensning, validering, idempotens, sikker ruting, eksplisitt dubletthåndtering og feilkø. Påminnelser må komme fra en tjeneste med sporbar levering. Databehandlere, lagringstid, sletting, sikkerhetskopi og gjenoppretting skal avklares før pilot med reelle data.

## Kjente avgrensninger
Ingen jobbinnlogging, database/API, reell rolle-/avdelingstilgang, varsling, eksport/import, målsetting eller integrasjoner. Ingen automatisert kommunikasjon. Kontakt er foreløpig felt på sakskortet; normaliserte relasjoner gjenstår. Hendelseslisten viser tidspunkt/type, men ikke full feltdiff. Rapporter bruker aktuell status, ikke historiske snapshots. Overlevering kan simuleres, men er ingen sikker godkjenningsmekanisme. Pauseårsak er påkrevd og fristen brukes til ny vurdering. Kontaktønsker, formåls-/samtykkefelter og kampanjeregister gjenstår.
