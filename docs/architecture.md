# Arkitektur og grenser

## Prototype 0.1
Vanilla JavaScript ESM, HTML og CSS. Ingen tredjepartskode eller eksterne nettverkskall i appen. Node-serveren serverer bare fem eksplisitt tillatte filer, binder til localhost og sender CSP. `domain.mjs` isolerer testbare forretningsregler; `app.mjs` er visning og demotilstand. sessionStorage begrenser levetiden, men gir ingen konfidensialitetsgaranti.

## Versjon 0.2 – server bak porter, bare utviklingsadaptere
```
Nettleser: index.html, app.mjs, crm.mjs (CRM-regler uten lagring: varsler, lister, trakt, aktivitet)
  └─ client/datasource.mjs ── local-source.mjs (domain.mjs + sessionStorage, frittstående)
                           └─ api-source.mjs   (fetch mot /api/v1, ingen nettleserlagring)

server/main.mjs → bootstrap.mjs (velger adaptere etter profil)
  http.mjs      ruting, feilformat, opprinnelseskontroll, ratebegrensning, logg uten persondata
  service.mjs   regler, validering, revisjonskontroll, revisjonslogg
  access.mjs    tilgang etter rolle, avdeling, team og tildeling (tabell fra contract/reference-model.mjs)
  ports.mjs     lagringsport og identitetsport
  adapters/     dev-memory-repository.mjs og dev-identity.mjs – kun utvikling og test
```
Applikasjonslaget kjenner bare portene. En databaseadapter og en OIDC-adapter kan legges til uten å endre `service.mjs` eller `http.mjs`. Produksjonsprofilen avviser adaptere som ikke uttrykkelig er merket som produksjonsklare, og det finnes ingen slike. Ingen tredjepartsavhengigheter i kjørende kode.

Kjente forenklinger: søketekst filtreres i applikasjonslaget etter at lagringsadapteren har avgrenset til brukerens omfang. Ratebegrensning og sesjoner holdes i minnet. Hver ny sak får egen Person og Contact, og sammenslåing er ikke bygget.

## Produksjonsmodell – forslag, delvis bygget med utviklingsadaptere
Skill Person, Contact, Relationship og SalesCase i databasen. En kontakt kan representere flere personer og saker. Case inneholder avdeling, team, eier, kontaktløp, BPA-prosess og to separate milepæler. Action har ansvarlig, frist og fullført-tid; Handoff har avsender, mottaker, forespurt-tid og bekreftet-tid. Source/Campaign skal ikke innebære markedsføringssamtykke. AuditEvent må ligge på server og registrere relevante endringer og tilgang.

Entra ID er en kandidat for jobbinnlogging; faktisk tenant og godkjent drift må avklares. Bruk OIDC og validerte sesjoner på server. Sjekk tilgang ved hvert lese-, søke-, skrive- og eksportkall. Administrator får teknisk oppsett uten automatisk personinnsyn; leder får aggregater der det er tilstrekkelig. Ikke bruk klientfiltre som sikkerhet. Data skal ikke ligge i GitHub, Drive-logger eller nettleserlagring i produksjon.

Inntak fra nettskjema krever ratebegrensning, validering, idempotens, sikker ruting, eksplisitt dubletthåndtering og feilkø. Påminnelser må komme fra en tjeneste med sporbar levering. Databehandlere, lagringstid, sletting, sikkerhetskopi og gjenoppretting skal avklares før pilot med reelle data.

## Kjente avgrensninger
Ingen jobbinnlogging, database, varsling, import, målsetting eller integrasjoner. Aktivitetslogg, stillstandsvarsel, smarte lister, utfall og salgstrakt er lagt til, se crm-features.md; påminnelser, flere oppgaver per sak og samtykkefelt gjenstår. API, rolle-/avdelingstilgang og eksport finnes bare med utviklingsadaptere og fiktive data. Avsnittet under beskriver den frittstående prototypen. Ingen automatisert kommunikasjon. Kontakt er foreløpig felt på sakskortet; normaliserte relasjoner gjenstår. Hendelseslisten viser tidspunkt/type, men ikke full feltdiff. Rapporter bruker aktuell status, ikke historiske snapshots. Overlevering kan simuleres, men er ingen sikker godkjenningsmekanisme. Pauseårsak er påkrevd og fristen brukes til ny vurdering. Kontaktønsker, formåls-/samtykkefelter og kampanjeregister gjenstår.
