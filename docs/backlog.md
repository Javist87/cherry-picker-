# Plan og neste leveranser

Revidert 13. november 2026, sist etter at server og klient ble bygget med utviklingsadaptere. Se «Endringer fra forrige versjon» nederst.

## Kort status

- Prototypen med fiktive data er kjørbar og flettet til `main` (PR #1 og #3).
- Forslag til backendkontrakt og tilgangsmatrise er levert: [backend-contract.md](backend-contract.md) og [access-matrix.md](access-matrix.md). Forslaget er ikke godkjent.
- API-server etter kontrakten er bygget bak porter for lagring og identitet, med utviklingsadaptere (minne og testinnlogging). N-01 til N-22 består mot API-et. Klienten kan kjøre mot API-et uten nettleserlagring.
- Ingen database, ingen reell innlogging og ingen reelle data. Produksjonsprofilen starter ikke.
- Ingen av beslutningene B-01 til B-12 er tatt, og ingen eier er satt. Beslutningsgrunnlag med anbefalinger ligger i [decision-brief.md](decision-brief.md).
- CRM-tillegg er lagt inn 14. november 2026: aktivitetslogg, stillstandsvarsel, smarte lister, utfall ved avslutning og salgstrakt. Sammenligning med andre CRM-systemer og åpne spørsmål Å-1 til Å-6 står i [crm-features.md](crm-features.md). Tilleggene endrer ikke porten eller beslutningene.
- Status mot porten og driftsdokumentasjon ligger i [operations.md](operations.md).

## Kritisk linje

Fase 1 og fase 2 kan starte nå og gå parallelt. Den leverandørnøytrale delen av fase 4 er bygget. Resten av fase 4 (database og jobbinnlogging) og alt etter den er blokkert av beslutningene i fase 2. Det som holder fremdriften tilbake er beslutninger, ikke koding.

```
Fase 1 Prosess ─────────┐
Fase 2 Beslutninger ────┼─► Fase 4 Server og tilgang ─► Fase 5 ─► Fase 6 ─► Fase 7 ─► Port ─► Pilot
Fase 3 Kontrakt (levert)┘   (fase 4: bygget bak porter, adaptere mangler)
```

## Faser

### Fase 1 – Bekreft prosessen med salgsteamet
- **Mål:** Verktøyet beskriver arbeidet slik det faktisk gjøres.
- **Leveranser:** Gjennomgang av prototypen med fiktive eksempler. Avklarte åpne spørsmål fra prosjektbeskrivelsen. Bekreftet kodeverk for status, BPA-prosess, kilde og relasjonsroller.
- **Ferdig når:** Salgsteamet har registrert, fulgt opp, pauset og overlevert en fiktiv sak uten hjelp, og avvik er ført som issues. Manuell visuell gjennomgang på PC og mobil er gjort (gjenstår fra [validation.md](validation.md)).
- **Avhenger av:** Ingenting.
- **Status:** Ikke startet.

### Fase 2 – Beslutninger om drift, identitet og personvern
- **Mål:** Grunnlag for å bygge og for å behandle reelle opplysninger.
- **Leveranser:** Beslutning B-01 til B-06 og B-10 i registeret under, med navngitt beslutningseier og dato.
- **Ferdig når:** Hver beslutning er dokumentert i repoet eller lenket fra det.
- **Avhenger av:** Ingenting. Bør starte umiddelbart, fordi den blokkerer fase 4.
- **Status:** Ikke startet.

### Fase 3 – Kontrakt og tilgangsmatrise
- **Mål:** Entydig spesifikasjon som kan bygges og testes uavhengig av leverandør.
- **Leveranser:** Datamodell, valideringsregler, API-feil, revisjonskontroll, idempotent inntak, tilgangsmatrise og negative tester.
- **Ferdig når:** Forslaget er gjennomgått, B-05 til B-09 og B-12 er besluttet, og dokumentene er oppdatert etter beslutningene.
- **Avhenger av:** Fase 1 for kodeverk og roller.
- **Status:** Forslag levert og bygget. Godkjenning gjenstår. Valg gjort under bygging er listet i kontraktens kapittel 6 og må bekreftes.

### Fase 4 – Server, database og tilgang
- **Mål:** Saker lagres på server med tilgang på rolle, avdeling, team og tildeling.
- **Leveranser:** API etter kontrakten. Normaliserte personer, kontakter, relasjoner og saker. Servervalidering. Jobbinnlogging. Revisjonslogg. Klienten flyttet fra sessionStorage til API.
- **Ferdig når:** Alle negative tester N-01 til N-22 består mot faktisk backend med testbrukere per rolle. Regeltestene i `domain.mjs` har tilsvarende servertester. Ingen saksdata ligger i nettleserlagring.
- **Avhenger av:** Fase 2 (B-01, B-02, B-03) og fase 3.
- **Status:** Delvis bygget. Blokkert for fullføring.
  - Bygget og testet med utviklingsadaptere og fiktive data: API etter kontrakten, normaliserte ressurser, servervalidering, revisjon med `If-Match`, idempotent inntak, revisjonslogg, tilgang på rolle, avdeling, team og tildeling, og klient mot API uten saksdata i nettleserlagring. N-01 til N-22 og de tolv regeltestene består mot API-et (`npm run test:api`, 48 tester).
  - Mangler, blokkert av B-01 til B-03: databaseadapter, OIDC-adapter for jobbinnlogging, og kjøring av testene i et produksjonslikt miljø.
  - Mangler, blokkert av B-12: teknisk håndheving av forbudte rollekombinasjoner og nødtilgang.

### Fase 5 – Overlevering, historikk, oppgaver og påminnelser
- **Mål:** Oppfølging som ikke avhenger av at noen husker å åpne verktøyet.
- **Leveranser:** Reell overlevering med mottaksbekreftelse. Eierskifte som egen, begrunnet handling. Historikk med feltendringer. Kontaktønsker. Flere oppgaver per sak. Påminnelser med sporbar levering.
- **Ferdig når:** Overlevering og eierskifte er testet med to faktiske brukere. En påminnelse kan spores fra frist til levering. Ingen utsendelse går til personer utenfor Medvind.
- **Avhenger av:** Fase 4, B-08 og B-11.
- **Status:** Blokkert.

### Fase 6 – Nettskjemainntak og prøveimport
- **Mål:** Henvendelser kommer inn én gang, til riktig sted.
- **Leveranser:** Inntak etter kontraktens kapittel 7. Feltmapping fra dagens løsning. Prøveimport med avstemming. Feilkø. Ingen full innbokskopiering.
- **Ferdig når:** Samme innsending sendt to ganger gir én henvendelse. Antall importert stemmer med kilden. Feilkøen er tom eller forklart. Prøveimporten er gjort med fiktive eller godkjente data.
- **Avhenger av:** Fase 4 og B-09. Reelle data krever at porten under er passert.
- **Status:** Blokkert.

### Fase 7 – Rapporter, datakvalitet og driftstester
- **Mål:** Tall ledelsen kan stole på, og drift som tåler feil.
- **Leveranser:** Rapportdefinisjoner og mål. Historiske øyeblikksbilder. Datakvalitetskontroller. Aggregater uten personinnsyn. Test av sikkerhetskopi og gjenoppretting, sletting og eksport.
- **Ferdig når:** Hver rapportlinje har skriftlig definisjon og kan avstemmes mot sakslisten. Gjenoppretting fra sikkerhetskopi er gjennomført og tidfestet. Sletting er verifisert også i sikkerhetskopi og logg etter besluttet regel.
- **Avhenger av:** Fase 4, B-06 og B-10.
- **Status:** Blokkert.

## Port før reelle data

Ingen reelle personopplysninger legges inn før alle punktene er oppfylt og kvittert av den som eier beslutningen. Ingen punkter er kvittert. Hva som er teknisk forberedt og hva som mangler per punkt står i [operations.md](operations.md), kapittel 9.

- [ ] Behandlingsgrunnlag og formål er godkjent (B-04).
- [ ] Behov for personvernkonsekvensvurdering er vurdert, og vurderingen er gjennomført om den kreves (B-04).
- [ ] Driftsmiljø er godkjent, og databehandleravtaler er på plass (B-01).
- [ ] Jobbinnlogging er i bruk. «Test som» er fjernet fra produksjonsbygget (B-02).
- [ ] Negative tilgangstester N-01 til N-23 består mot produksjonslikt miljø.
- [ ] Revisjonslogg er på og kan ikke endres via applikasjonen.
- [ ] Sikkerhetskopi er gjenopprettet i test.
- [ ] Lagringstid og sletting er besluttet og testet (B-10).
- [ ] Rutine for avvik og innsynskrav er beskrevet, med navngitt ansvarlig.

## Beslutningsregister

Ingen beslutningseier er registrert i repoet. Kolonnen viser en foreslått rolle, og virksomheten må sette navn. «Forslag» er utgangspunkt for diskusjon, ikke vedtak. Alternativer, risiko og anbefaling for hver beslutning står i [decision-brief.md](decision-brief.md).

| ID | Beslutning | Forslag | Blokkerer | Eier | Status |
|---|---|---|---|---|---|
| B-01 | Driftsmiljø, region og databehandlere | Plattform virksomheten allerede har avtale med, i EØS | Fase 4 | Ikke satt. Foreslått rolle: IT-ansvarlig, med daglig leder | Åpen |
| B-02 | Identitetsløsning og tenant. Hvor roller, avdeling og team hentes fra | Entra ID er nevnt som kandidat i arkitekturnotatet | Fase 4 | Ikke satt. Foreslått rolle: IT-ansvarlig | Åpen |
| B-03 | Database, kryptering og tilgang for driftspersonell | Forvaltet relasjonsdatabase. Ingen stående lesetilgang for drift | Fase 4 | Ikke satt. Foreslått rolle: IT-ansvarlig | Åpen |
| B-04 | Behandlingsgrunnlag, formål, samtykke- og kontaktønskefelt. Om saksdata er særlige kategorier | Se risiko R-01 | Port | Ikke satt. Foreslått rolle: Behandlingsansvarlig ved daglig leder, med personvernansvarlig | Åpen |
| B-05 | Godkjenning av tilgangsmatrisen: avdelingsleders skrivetilgang, teamleders innsyn, eksport | Som i [access-matrix.md](access-matrix.md) | Fase 3, 4 | Ikke satt. Foreslått rolle: Salgsleder, med personvernansvarlig | Åpen |
| B-06 | Minste gruppestørrelse i aggregater og vern mot utregning av små tall | Terskel 5 | Fase 7 | Ikke satt. Foreslått rolle: Personvernansvarlig, med salgsleder | Åpen |
| B-07 | Stabile koder i API med visningstekst i klient | Ja | Fase 4 | Ikke satt. Foreslått rolle: Teknisk ansvarlig | Åpen |
| B-08 | Overlevering: kan mottaker avslå, kan avsender trekke tilbake, hvem kan motta | Legg til avslag og tilbaketrekking | Fase 5 | Ikke satt. Foreslått rolle: Salgsleder | Åpen |
| B-09 | Inntak: felter, fritekst, ruting, oppbevaring av nøkler, dublett på tvers av avdelinger | Ingen fritekst. Dublettdetaljer bare i eget omfang | Fase 6 | Ikke satt. Foreslått rolle: Salgsleder, med personvernansvarlig | Åpen |
| B-10 | Lagringstid, sletting, innsyn for registrerte. Om logg lagrer feltverdier og søketekst | Logg uten feltverdier og søketekst (bygget slik). Frister må settes av virksomheten | Port, fase 7 | Ikke satt. Foreslått rolle: Behandlingsansvarlig, med personvernansvarlig | Åpen |
| B-11 | Kanal og avsender for påminnelser | Bare i verktøyet i beta | Fase 5 | Ikke satt. Foreslått rolle: Salgsleder, med IT-ansvarlig | Åpen |
| B-12 | Rollekombinasjoner (teknisk administrator med saksrolle) og nødtilgang | Ikke tillatt uten dokumentert godkjenning | Fase 4 | Ikke satt. Foreslått rolle: Daglig leder, med personvernansvarlig | Åpen |

## Risikoer

| ID | Risiko | Tiltak |
|---|---|---|
| R-01 | At en person har en BPA-sak kan i seg selv si noe om helse. Regelen «ingen helseopplysninger» i prototypen dekker da ikke hele problemet. Dette er en vurdering, ikke en juridisk konklusjon | Legg spørsmålet frem for personvernansvarlig eller jurist som del av B-04 før arkitekturen låses |
| R-02 | Bygging starter før B-01 til B-03 er avklart, og må gjøres om | Det som er bygget ligger bak porter og er uavhengig av leverandør. Adaptere skrives først når beslutningene er tatt |
| R-03 | Tilgang håndheves i klient i stedet for på server | N-01 til N-22 kjøres mot API-et i CI. Klienten skjuler bare det serveren uansett avviser |
| R-04 | Små tall i rapporter identifiserer enkeltpersoner, særlig i små kommuner | B-06 og kjent svakhet beskrevet i tilgangsmatrisen |
| R-05 | To verktøy endrer samme filer samtidig | Egen gren per oppgave og avtalt filfordeling, se AGENTS.md |
| R-06 | Prototypen tas i bruk med reelle data fordi den «virker» | Porten over. Advarsel i README beholdes til porten er passert |
| R-07 | API-serveren med utviklingsadaptere eksponeres eller brukes med reelle data. Testinnloggingen har ikke passord, og data ligger ukryptert i minnet | Serveren binder bare til localhost utenfor produksjonsprofil. Utviklingsadaptere er sperret i produksjonsprofil. Advarsel ved oppstart og i klienten |
| R-08 | Grønne tester leses som at løsningen er godkjent. Testene er kjørt mot utviklingsadaptere, ikke mot reell database og innlogging | Forbehold står i README, validation.md og tilgangsmatrisen. Porten krever kjøring i produksjonslikt miljø |
| R-10 | Fritekstnotat i aktivitetsloggen brukes til helseopplysninger | Advarsel i feltet og maks 200 tegn. Notatet logges ikke i revisjonsloggen. Feltet kan fjernes uten å endre resten. Avgjøres under B-04, se Å-1 i [crm-features.md](crm-features.md) |
| R-09 | Valg gjort under bygging (mottaker i samme avdeling, hvem som kan bekrefte «ikke dublett», katalogoppslag) blir stående uten beslutning | Valgene er listet i kontraktens kapittel 6 og knyttet til B-05, B-08 og B-09 |

## Utenfor beta

Valgt e-post og kalender, dokumentkobling og AI-utkast etter eget mandat kommer senere. Ingen automatisk utsendelse, samtaleopptak eller AI-rangering i beta.

## Endringer fra forrige versjon

| Forrige punkt | Nå |
|---|---|
| 1. Bekreft prosess med salgsteamet | Fase 1, med ferdigkriterium |
| 2. Velg drift, identitet og lagring | Fase 2, delt i navngitte beslutninger B-01 til B-04 |
| 3. Bygg server, API og tilgang | Delt i fase 3 (spesifikasjon, levert som forslag) og fase 4 (bygging) |
| 4. Overlevering, historikk, oppgaver, påminnelser | Fase 5 |
| 5. Nettskjemainntak og prøveimport | Fase 6 |
| 6. Rapporter, datakvalitet, test før produksjon | Fase 7. Kontrollene før produksjon er løftet ut til en egen port |

Senere 13. november 2026: beslutningsgrunnlag lagt til, foreslått eierrolle satt inn i registeret, fase 4 oppdatert til delvis bygget, risiko R-07 til R-09 lagt til, og porten lenket til status i operations.md.

Nytt i første revisjon: avhengigheter og kritisk linje, ferdigkriterier per fase, port før reelle data, beslutningsregister og risikoliste. Tilgangstestene er flyttet frem fra siste punkt til fase 4, slik at de er på plass før det bygges mer oppå.
