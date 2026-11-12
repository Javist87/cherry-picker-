# Cherry Picker – Medvind salgsverktøy

Første kjørbare prototype av den interne salgsarbeidsflaten. Bare fiktive data. **Ikke klar for produksjon eller reelle personopplysninger.**

## Start

Krever Node.js 22 eller nyere. Ingen pakkeinstallasjon nødvendig.

```sh
npm start
```

Åpne http://127.0.0.1:3000. Prototypen kan også kjøres på en vanlig statisk webserver. Den bruker relative ressurslenker og kan legges under en undermappe.

```sh
npm test
npm run test:browser
```

Nettlesertesten krever Playwright 1.62.1 og Chromium. Installer med `npm install --no-save playwright@1.62.1` og `npx playwright install chromium`. `CHROMIUM_PATH` kan peke til en eksisterende Chromium. Start serveren før testen. `BASE_URL` kan angi annen testadresse.

## Innhold i versjon 0.1

- Personlig arbeidsdag med forfalte og kommende oppfølginger.
- Registrering og redigering av sak, kontaktperson, kilde og kommune.
- Søk og filtre, visning av kontaktløp og separat BPA-prosess.
- Aktive saker krever ansvarlig, neste handling og frist.
- Dublettvarsel på e-post, telefon og saksnavn/kommune. Betaen blokkerer mulig dublett; manuell sammenslåing inngår ikke.
- Pause med årsak og ny vurderingsdato; avslutning med årsak.
- Avtaledato uten krav om ordningsnummer; separat faktisk oppstart.
- Overlevering som krever bekreftelse fra simulert mottaker.
- Enkel hendelseshistorikk og rapport med inkluderte saker og kildefordeling.
- Tilpasset mobil og PC, native skjema og dialog med tastaturstøtte.

Data oppbevares i sessionStorage, bare i den aktuelle fanen. Dette er ikke sikker lagring, sikkerhetskopi eller samarbeid. «Test som» er en demonstrasjon, ikke innlogging eller tilgangskontroll. En bruker kan redigere alle fiktive saker. Historikken er en enkel hendelsesliste, ikke en revisjonssikker logg. Ingen helseopplysninger skal legges inn.

## Videre bygging

Se [docs/architecture.md](docs/architecture.md) og [docs/backlog.md](docs/backlog.md). Produksjon krever valgt driftsmiljø og jobbinnlogging, database, tjenstlig tilgang på server, testet rollematrise, revisjonslogg, sikkerhetskopi, lagrings-/sletteplan og godkjent behandlingsgrunnlag. Ingen integrasjoner, utsendelser eller produksjonssetting er aktivert.

Grunnlag: Prosjektbeskrivelse «Salgsverktøy Medvind 1.0 beta», 12. november 2026. Teknologistakken for produksjon er ennå ikke besluttet. Prototypens standardbaserte JS/CSS og utviklingsserver binder ikke neste trinn til en bestemt leverandør.
