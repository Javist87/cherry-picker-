# Samarbeid om Cherry Picker

Thomas har autorisert videre utvikling og at Claude også bidrar. Dette dokumentet er felles arbeidsavtale, ikke bevis på at et annet verktøy er tilkoblet.

- Les README, docs/architecture.md, docs/backlog.md og åpne PR-er/issues før endringer.
- GitHub er original for kode. Drive inneholder status og revisjonslenker, ikke konkurrerende kildekode.
- Bruk egen gren per oppgave. Ikke push til en annens aktive gren, force-push eller overskriv arbeid. Velg eksakt basegren/commit fra oppgaven; main kan ligge bak beta-PR-en.
- Beskriv hvilke filer du endrer og testene i PR-en. Ikke anta at ansvarsfelt er en teknisk lås.
- Bruk kun fiktive data. Ingen hemmeligheter, kundedata eller møtetranskripsjoner i repo eller logger.
- Serverbasert tilgang er bygget i `server/`, men bare med utviklingsadaptere. Jobbinnlogging og database er ikke implementert. Test som-velgeren og testinnloggingen er aldri sikkerhet.
- Kjør npm run test:all og relevante nettlesertester. Oppgi eksplisitt hva som ikke er verifisert.
- Ikke aktiver integrasjoner eller produksjonsdrift som en del av et forslag til arkitektur.
