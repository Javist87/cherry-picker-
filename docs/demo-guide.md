# Demoversjon – slik viser du alle funksjonene

Demoen kjører lokalt på egen maskin med oppdiktede data. Den er ikke innlogging, ikke sikker lagring og ikke klar for reelle personopplysninger. Alt forsvinner når serveren stoppes.

## Start

Krever Node.js 22 eller nyere. Ingen installasjon.

```sh
npm run demo
```

Åpne http://127.0.0.1:3000. Velg testbruker øverst til høyre. Listen går fra superbruker og leder og nedover. Menyen viser bare det rollen har tilgang til, og serveren avviser alt annet, også ved direkte kall.

Vil du starte på nytt: åpne **Tilgang** og velg **Nullstill demodata**.

## Testbrukere

| Testbruker | Roller | Ser og kan |
|---|---|---|
| Test Superbruker (alle roller, kun demo) | Alle personroller | Alt unntatt nettskjemainntak. Finnes bare for å vise hele løsningen fra én bruker |
| Test Leder | leder | Bare aggregerte tall. Ingen enkeltsaker |
| Test Avdelingsleder Trøndelag / Vestland | avdelingsleder | Alle saker i egen avdeling, eierskifte, eksport, aggregater |
| Test Teamleder T1 | teamleder | Saker i eget team, eierskifte, bekrefte «ikke dublett», aggregater for teamet |
| Test Selger A, B, C, V | selger | Egne saker, registrering, oppfølging, overlevering |
| Test Revisor | revisor | Revisjonslogg. Ingen saker |
| Test Teknisk administrator | teknisk_admin | Teknisk oppsett og antall i inntakskø. Ingen saker eller personer |
| Tjenestekonto inntak (test) | inntak | Kan bare levere fra nettskjema |
| Test Uten rolle | ingen | Ingenting |

Superbrukeren kombinerer teknisk administrator med saksroller. Om en slik kombinasjon skal være tillatt i drift er ikke besluttet (B-12). I demoen er den bare et hjelpemiddel.

## Forslag til gjennomgang (ca. 20 minutter)

| # | Testbruker | Vis | Poeng |
|---|---|---|---|
| 1 | Superbruker | **Tilgang**: roller og tabellen over funksjoner | Tilgang styres av rolle, avdeling, team og tildeling |
| 2 | Selger A | **Min arbeidsdag**, åpne en sak, **Fullfør og avtal neste steg** | Hver aktiv sak har ansvarlig, neste handling og frist |
| 3 | Selger A | **+ Ny henvendelse** med samme navn og kommune som en eksisterende sak | Serveren stopper mulig dublett |
| 4 | Selger A | **Saker og leads**: bare egne saker. **Tilgang**: eksport og eierskifte er ikke tillatt | Selger ser ikke kollegers saker |
| 5 | Selger B | **Min arbeidsdag** → Overleveringer til deg → Eksempelsak 003 → **Bekreft mottak** | Ansvar flyttes først når mottaker bekrefter |
| 6 | Selger A | Søk etter Eksempelsak 003 | Tidligere eier har mistet tilgangen |
| 7 | Teamleder T1 | Åpne en sak, **Gjennomfør eierskifte** med begrunnelse | Leder kan flytte ansvar ved fravær. Det loggføres |
| 8 | Avdelingsleder Trøndelag | **Rapport**: saksrapport, antall per gruppe, **Eksporter** med formål | Eksport krever formål. Vestland vises ikke |
| 9 | Leder | **Rapport** | Bare tall. Små grupper er skjult. Ingen saker eller navn |
| 10 | Revisor | **Revisjonslogg**, filtrer på «Bare avslag» | Hvem gjorde hva, formål og begrunnelse. Ingen feltverdier |
| 11 | Tjenestekonto inntak | **Nettskjema**: send inn to ganger med samme nøkkel | Samme innsending gir bare én henvendelse |
| 12 | Teknisk administrator | **Oppsett** | Ser miljø og antall i kø, men ingen saker eller personer |
| 13 | Uten rolle | **Tilgang** | Alt er avslått |

Vil du vise at tilgangen ligger på serveren: logg inn som Leder, åpne nettleserens adresselinje og gå til `/api/v1/cases`. Svaret er 403.

## Hva demoen ikke viser

- Reell jobbinnlogging og database. Begge venter på beslutning B-01 til B-03.
- Påminnelser, avslag og tilbaketrekking av overlevering, ruting av nettskjema til sak, sletting og lagringsfrister, innsynsuttrekk.
- Innholdet i innsendinger fra nettskjema. Ingen rolle kan lese dem ennå (B-09).

## Viktig før du viser demoen til andre

- Bruk bare oppdiktede opplysninger, også når du skriver inn nye saker under visningen.
- Demoen skal kjøre på egen maskin. Serveren lytter bare på `127.0.0.1` og skal ikke legges ut på internett. Testinnloggingen har ikke passord.
- Den frittstående prototypen (`npm start`) har ikke roller og tilgang. Bruk `npm run demo` når tilgang skal vises.
