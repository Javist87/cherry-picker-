# Claude – inngang til prosjektet

Les AGENTS.md, README.md og docs/architecture.md først.

## Anbefalt separat oppgave: backendkontrakt og tilgangsmatrise
Lag egen gren fra siste head i PR #1 (`codex/medvind-beta-01`). Arbeid først i `docs/backend-contract.md`, `docs/access-matrix.md` og eventuelle isolerte kontrakttester. La `app.mjs`, `domain.mjs` og `test/browser.mjs` være urørt mens ChatGPT videreutvikler oppfølgingsflyten. Avtal ny fordeling i PR hvis du trenger å endre disse.

Kontrakten skal definere Person, Contact, Relationship, SalesCase, Action, Handoff og AuditEvent; API-feil, feltvalidering, samtidige oppdateringer med revisjon/ETag og idempotent inntak. Tilgangsmatrisen må dekke rolle, avdeling, team og sakstildeling på server; leder skal kunne få aggregater uten personsaksinnsyn, teknisk administrator skal ikke automatisk ha personinnsyn. Ta med negative tester av søk, direkte oppslag, endring og eksport.

Ikke velg en faktisk tenant, opprett databasekonto, sett opp hemmeligheter eller ta i bruk reelle data. Drift og identitet gjenstår å avklare. Lever konkret forslag som PR, med åpne beslutninger og tydelig hva som kun er spesifisert.

## Status ved videreføring
Beta: registrering, søk, kontaktløp, BPA-prosess, frister, pause, milepæler, simulert bekreftet overlevering og rapport. Neste tillegg registrerer fullført oppfølging med nytt steg og bevarer forrige handling. Klientdata er bare sessionStorage. 12 regeltester består lokalt etter tillegget; sjekk siste CI for nettlesertest. Claude-tilgang og kjøring er ikke bekreftet fra ChatGPT.
