# Cherry Picker – Medvind salgsverktøy

Intern salgsarbeidsflate. Versjon 0.2 består av en frittstående prototype og en API-server med tilgangsstyring som bare kjører med utviklingsadaptere. Bare fiktive data.

**Ikke klar for produksjon eller reelle personopplysninger.** «Port før reelle data» i [docs/backlog.md](docs/backlog.md) er ikke passert, og ingen av beslutningene B-01 til B-12 er tatt. Se [docs/decision-brief.md](docs/decision-brief.md).

## Start

Krever Node.js 22 eller nyere. Ingen pakkeinstallasjon og ingen avhengigheter.

| Kommando | Hva den starter | Data | Innlogging |
|---|---|---|---|
| `npm start` | Frittstående prototype på http://127.0.0.1:3000 | sessionStorage i fanen | Ingen. «Test som» er ikke sikkerhet |
| `npm run start:api` | API og klient på http://127.0.0.1:3000 | Serverens minne, tapes ved omstart | Testbrukere uten passord. Bare utvikling |

Prototypen kan også legges på en vanlig statisk webserver sammen med mappen `client/`. Den bruker relative ressurslenker.

API-serveren nekter å starte med `APP_PROFILE=production`. Det finnes ingen adapter for database eller jobbinnlogging før B-01 til B-03 er besluttet. Konfigurasjon er beskrevet i [docs/operations.md](docs/operations.md).

## Test

```sh
npm test                  # 12 regeltester for prototypen (domain.mjs)
npm run test:contract     # 20 kontrakttester mot referansemodellen
npm run test:api          # 48 tester mot API-et over HTTP, blant dem N-01 til N-22
npm run test:all          # de tre over
npm run test:browser      # nettlesertest av prototypen, krever npm start
npm run test:browser:api  # nettlesertest i API-modus, krever npm run start:api
```

Nettlesertestene krever Playwright 1.62.1 og Chromium. Installer med `npm install --no-save playwright@1.62.1` og `npx playwright install chromium`. `CHROMIUM_PATH` kan peke til en eksisterende Chromium. `BASE_URL` kan angi annen testadresse. Playwright er eneste eksterne pakke, og den brukes bare i test.

## Hva som finnes

**Prototype (uendret arbeidsflyt):** Arbeidsdag med forfalte og kommende oppfølginger. Registrering og redigering. Søk og filtre, kontaktløp og BPA-prosess. Aktive saker krever ansvarlig, neste handling og frist. Dublettvarsel. Pause og avslutning med årsak. Avtaledato og separat oppstart. Overlevering med mottaksbekreftelse. Fullført oppfølging med nytt steg. Rapport. Mobil og PC, native skjema og dialog med tastaturstøtte.

**API-server (`server/`):** Bygget etter [docs/backend-contract.md](docs/backend-contract.md) og [docs/access-matrix.md](docs/access-matrix.md).

- Tilgang avgjøres på server ved hvert kall, etter rolle, avdeling, team og sakstildeling. Teknisk administrator har ikke personinnsyn. Leder får bare aggregater.
- Servervalidering, feil som `application/problem+json`, revisjon og ETag med `If-Match`, idempotent inntak med ratebegrensning.
- Revisjonslogg som bare kan legges til. Den inneholder feltnavn, ikke feltverdier eller søketekst.
- Lagring og identitet ligger bak porter (`server/ports.mjs`). Eneste adaptere er `dev-memory` og `dev`, tydelig merket og sperret i produksjonsprofil.

**Klient:** `app.mjs` bruker en datakilde (`client/`). `local` er prototypen. `api` bruker serveren og skriver ingenting til nettleserlagring.

## Begrensninger

- Utviklingsadapterne er ikke sikkerhet. Testinnloggingen har ikke passord, og lagringen er prosessminnet.
- N-01 til N-22 er grønne mot API-et med utviklingsadaptere. De er ikke kjørt mot en reell database eller identitetsløsning, og svartid i N-02 er ikke målt.
- Kontrakten og matrisen er fortsatt forslag og er ikke godkjent (B-05).
- Ikke bygget: OIDC-adapter, databaseadapter, sletting og lagringsfrister, innsynsuttrekk, påminnelser, avslag og tilbaketrekking av overlevering, ruting og feilkø for inntak, historiske rapporter, administrasjon av kodeverk.
- Ingen integrasjoner, utsendelser eller produksjonssetting er aktivert. Ingen helseopplysninger skal legges inn.

## Dokumenter

| Dokument | Innhold |
|---|---|
| [docs/decision-brief.md](docs/decision-brief.md) | Beslutningsgrunnlag B-01 til B-12 med anbefaling og e-post til beslutningseiere |
| [docs/backlog.md](docs/backlog.md) | Faser, port før reelle data, beslutningsregister, risikoer |
| [docs/backend-contract.md](docs/backend-contract.md) | Datamodell, validering, API-feil, endepunkter |
| [docs/access-matrix.md](docs/access-matrix.md) | Roller, omfang, matrise og negative tester |
| [docs/operations.md](docs/operations.md) | Miljøer, konfigurasjon, logging, rutiner, status mot porten |
| [docs/architecture.md](docs/architecture.md) | Arkitektur og grenser |
| [docs/validation.md](docs/validation.md) | Hva som er kontrollert, og hva som ikke er det |

Grunnlag: Prosjektbeskrivelse «Salgsverktøy Medvind 1.0 beta», 12. november 2026. Den ligger ikke i repoet. Teknologistakken for produksjon er ikke besluttet. Serveren er ren Node.js uten tredjepartskode og binder ikke neste trinn til en bestemt leverandør.
