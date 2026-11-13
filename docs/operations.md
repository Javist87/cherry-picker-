# Drift – dokumentasjon uten kjøring

Status 13. november 2026: Ingenting i dette dokumentet er satt i drift. Det finnes ingen produksjon, ingen database og ingen reell innlogging. Dokumentet beskriver hva som er bygget, hva som må på plass, og hvilke beslutninger som mangler. Valg av leverandør er ikke tatt (B-01 til B-03, se [decision-brief.md](decision-brief.md)).

**Løsningen er ikke klar for reelle personopplysninger.** Se avkrysningslisten nederst.

## 1. Miljøer

| Miljø | Formål | Lagring | Innlogging | Data | Status |
|---|---|---|---|---|---|
| Frittstående prototype (`npm start`) | Vise arbeidsflyt | sessionStorage i fanen | Ingen. «Test som» er ikke sikkerhet | Fiktive | Finnes |
| Utvikling (`npm run start:api`, profil `development`) | Utvikle og demonstrere server og tilgang | Minne, tapes ved omstart | Testbrukere uten passord | Fiktive | Finnes |
| Test (profil `test`, `npm run test:api`) | Automatiske tester | Minne per test | Testbrukere | Fiktive | Finnes |
| Produksjonslikt testmiljø | Kjøre N-01 til N-22, gjenoppretting og sletting mot valgt database og innlogging | Valgt database | Valgt identitetsløsning | Fiktive | Mangler. Krever B-01 til B-03 |
| Produksjon (profil `production`) | Reell bruk | Valgt database | Valgt identitetsløsning | Reelle, etter porten | Mangler. Serveren nekter å starte |

Utviklings- og testprofilen binder alltid til `127.0.0.1`. Produksjonsprofilen godtar ikke utviklingsadaptere, og det finnes ingen andre adaptere. Dette er testet i `test/api/contract-http.test.mjs`.

## 2. Konfigurasjon

Bare navn og betydning. Ingen verdier i tabellen er hemmeligheter, og ingen hemmeligheter finnes i repoet. Se også `.env.example`.

| Variabel | Betydning | Standard | Merknad |
|---|---|---|---|
| `APP_PROFILE` | `development`, `test` eller `production` | `development` | Styrer hvilke adaptere som er tillatt |
| `PORT` | Port | `3000` | |
| `HOST` | Lytteadresse | `127.0.0.1` | Leses bare i produksjonsprofil |
| `REPOSITORY_ADAPTER` | Lagringsadapter | `dev-memory` | Ingen produksjonsadapter finnes (B-03) |
| `IDENTITY_ADAPTER` | Identitetsadapter | `dev` | Ingen produksjonsadapter finnes (B-02) |
| `SESSION_TTL_SECONDS` | Sesjonens levetid | `28800` | Forslag. Besluttes i B-02 |
| `AGGREGATE_MIN_CELL` | Minste gruppestørrelse i aggregater | `5` | Forslag. Besluttes i B-06 |
| `INTAKE_RATE_LIMIT_PER_MINUTE` | Ratebegrensning for inntak per tjenestekonto | `30` | Holdes i minnet. Må flyttes ved flere instanser |
| `REQUEST_LOG` | `off` slår av forespørselslogg | på | |
| `DEV_SEED` | `off` starter utvikling uten eksempelsaker | på | Bare utviklingsprofil |

Variabler som vil komme med reelle adaptere, og som da er hemmeligheter: databasetilkobling, klienthemmelighet eller sertifikat for OIDC, og nøkkel for signering av sesjoner. Navn fastsettes når adapterne skrives. De skal ligge i plattformens hemmelighetslager, aldri i repoet, i `.env`-filer som sjekkes inn, i logger eller i feilmeldinger. `.gitignore` utelukker `.env` og `.env.*`.

## 3. Oppstart og stopp (skript, ikke kjørt mot noe miljø)

```sh
npm run start:api          # utvikling: API og klient på http://127.0.0.1:3000
npm run test:all           # regeltester, kontrakttester og API-tester
npm run test:browser:api   # nettlesertest i API-modus (krever at start:api kjører)
APP_PROFILE=production node server/main.mjs   # stopper med feilmelding til B-01–B-03 er besluttet
```

Det finnes ingen skript for utrulling. Det skal lages når driftsmiljø er valgt.

## 4. Sikkerhetskopi og gjenoppretting

**Finnes i dag:** Ingenting. Utviklingsadapteren lagrer i minnet.

**Krav til valgt løsning (forslag, bekreftes under B-01 og B-03):**

- Automatisk daglig sikkerhetskopi og gjenoppretting til tidspunkt, lagret kryptert i EØS og adskilt fra primærdatabasen.
- Revisjonsloggen inngår i sikkerhetskopien.
- Mål for tillatt datatap og gjenopprettingstid fastsettes av virksomheten. Tall er ikke foreslått her, fordi de avhenger av hvor kritisk verktøyet er for salgsarbeidet.
- Sikkerhetskopier omfattes av slettefristene i B-10. Det må avklares hvordan en sletting gjennomføres når opplysningen fortsatt finnes i en eldre kopi.

**Gjenopprettingstest før porten (prosedyre):**

1. Fyll testmiljøet med fiktive saker og noter antall saker, handlinger og logghendelser.
2. Ta sikkerhetskopi. Gjør deretter endringer som skal gå tapt.
3. Gjenopprett til nytt, tomt miljø.
4. Kontroller antall, at en sak kan leses med riktig revisjon, at tilgangstestene består, og at revisjonsloggen er uendret.
5. Noter tidsbruk, hvem som utførte, og avvik. Legg resultatet i [validation.md](validation.md).

## 5. Logging uten persondata

**Forespørselslogg (bygget):** Én JSON-linje per forespørsel til standard ut med tidspunkt, `requestId`, metode, rutemønster (for eksempel `/cases/:caseId`), status og varighet. Loggen inneholder ikke faktisk sti, spørring, innhold, navn, e-post, brukeridentitet eller IP-adresse. Ved uventet feil logges bare feiltypen.

**Revisjonslogg (bygget, AuditEvent):** Hvem, når, hvilken operasjon, utfall, hvilken sak og hvilke felt som ble endret. Loggen inneholder ikke feltverdier eller søketekst. Unntak: `purpose` ved eksport og begrunnelse ved eierskifte er fritekst skrevet av en ansatt. Det bør stå i brukerveiledningen at feltene ikke skal inneholde personopplysninger. Loggen kan bare legges til. Det finnes ingen rute og ingen metode i lagringsporten for å endre eller slette. Testet i N-20.

**Mangler:** Varsling ved mange avslag, oppbevaringstid for begge logger (B-10), og innsamling til et loggsystem (B-01). Avslag uten sesjon (401) skrives til revisjonsloggen. Det kan misbrukes til å fylle loggen og må begrenses i plattformen foran serveren.

## 6. Lagrings- og slettefrister – åpent punkt (B-10)

Ingen frister er satt, og ingen slettefunksjon er bygget. Lagringsporten har med hensikt ingen slettemetode før reglene er besluttet. Dette må besluttes av behandlingsansvarlig med personvernansvarlig:

| Kategori | Frist | Slettemåte |
|---|---|---|
| Henvendelse som ikke blir sak, og avviste innsendinger | Ikke besluttet | Ikke besluttet |
| Avsluttet sak uten avtale | Ikke besluttet | Ikke besluttet |
| Sak med avtale og oppstart | Ikke besluttet | Ikke besluttet |
| Idempotensnøkler fra inntak | Ikke besluttet (forslag 30 dager, B-09) | Automatisk |
| Revisjonslogg | Ikke besluttet | Ikke besluttet |
| Forespørselslogg | Ikke besluttet | Automatisk i loggsystemet |
| Sikkerhetskopier | Ikke besluttet | Ruller ut etter fast tid |

Når fristene er satt, må det bygges en slettejobb, og den må testes også mot sikkerhetskopi og logg (fase 7).

## 7. Avviksrutine – utkast

Utkastet må godkjennes av behandlingsansvarlig. Ansvarlige er oppgitt som roller, og navn mangler.

1. **Oppdage:** Alle som oppdager mulig avvik (feil tilgang, feilsendt opplysning, tap av data, uvanlig aktivitet i loggen) melder straks til avviksansvarlig. Rolle: ikke utpekt.
2. **Begrense:** IT-ansvarlig stenger tilgangen det gjelder eller tar løsningen ned. Bevis sikres. Revisjonsloggen skal ikke endres.
3. **Vurdere:** Personvernansvarlig vurderer om det er et brudd på personopplysningssikkerheten, hvem som er berørt, og om det skal meldes til tilsynsmyndighet og berørte. Fristene for melding følger av personvernregelverket og må bekreftes av personvernansvarlig. De er ikke fastsatt i dette dokumentet.
4. **Rette:** Årsak rettes, og tilgangstestene kjøres på nytt.
5. **Dokumentere:** Hendelse, vurdering og tiltak dokumenteres, også når det ikke meldes.

Teknisk støtte som finnes: `requestId` i alle svar og logger, og revisjonslogg over oppslag, søk, endringer, eksport og avslag.

## 8. Innsynsrutine – utkast

Gjelder når en registrert person ber om innsyn, retting eller sletting. Må godkjennes av behandlingsansvarlig.

1. Henvendelsen registreres, og identiteten bekreftes på en måte personvernansvarlig har godkjent.
2. Opplysningene finnes ved søk på navn, e-post og telefon i saker, kontakter og innsendinger fra nettskjema.
3. Svaret utarbeides og kvalitetssikres av personvernansvarlig før det sendes. Svarfrist følger av regelverket og må bekreftes av personvernansvarlig.
4. Retting gjøres i saken. Sletting følger reglene fra B-10.

**Mangler teknisk:** Det finnes ingen funksjon for å hente ut alt om én person på tvers av avdelinger. Ingen rolle har i dag slikt innsyn, og det er med hensikt. Det må besluttes hvem som skal utføre uttrekket (B-10, B-12), og funksjonen må bygges med egen logging. Innsendinger fra nettskjema kan i dag ikke leses av noen rolle.

## 9. Avkrysningsliste mot «Port før reelle data»

Listen speiler porten i [backlog.md](backlog.md). Ingen punkter er kvittert. «Teknisk forberedt» betyr at koden finnes og er testet med utviklingsadaptere og fiktive data. Det er ikke det samme som oppfylt.

| # | Punkt i porten | Status | Hva som finnes | Hva som mangler | Beslutning |
|---|---|---|---|---|---|
| 1 | Behandlingsgrunnlag og formål er godkjent | Ikke oppfylt | Spørsmål formulert i decision-brief | Vurdering og godkjenning | B-04 |
| 2 | Behov for personvernkonsekvensvurdering er vurdert | Ikke oppfylt | Risiko R-01 beskrevet | Vurderingen | B-04 |
| 3 | Driftsmiljø godkjent, databehandleravtaler på plass | Ikke oppfylt | Leverandørnøytral server | Valg, avtaler, utrulling | B-01 |
| 4 | Jobbinnlogging i bruk, «Test som» fjernet fra produksjonsbygget | Ikke oppfylt. Teknisk forberedt | Identitetsport. Testinnlogging sperret i produksjonsprofil | OIDC-adapter, tenant, grupper. Frittstående prototype må ikke rulles ut | B-02 |
| 5 | N-01 til N-22 består mot produksjonslikt miljø | Ikke oppfylt. Teknisk forberedt | 22 av 22 består mot API-et med utviklingsadaptere | Kjøring mot valgt database og innlogging. Svartid i N-02 er ikke målt | B-01–B-03, B-05 |
| 6 | Revisjonslogg er på og kan ikke endres via applikasjonen | Ikke oppfylt. Teknisk forberedt | Logg som bare kan legges til, testet i N-20 | Varig lagring, databasekonto uten endringsrett på loggen, oppbevaringstid | B-03, B-10 |
| 7 | Sikkerhetskopi er gjenopprettet i test | Ikke oppfylt | Prosedyre i kapittel 4 | Database, sikkerhetskopi, gjennomført test | B-01, B-03 |
| 8 | Lagringstid og sletting er besluttet og testet | Ikke oppfylt | Tabell over kategorier i kapittel 6 | Frister, slettejobb, test | B-10 |
| 9 | Rutine for avvik og innsynskrav er beskrevet, med navngitt ansvarlig | Ikke oppfylt | Utkast i kapittel 7 og 8 | Godkjenning, navngitte ansvarlige, uttrekksfunksjon | B-10, B-12 |

Hvert punkt kvitteres av beslutningseieren med navn og dato i backlog.md. Utvikler kan ikke kvittere.
