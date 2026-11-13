# Claude – inngang til prosjektet

Les AGENTS.md, README.md og docs/architecture.md først.

## Anbefalt separat oppgave: backendkontrakt og tilgangsmatrise
Lag egen gren fra siste head i PR #1 (`codex/medvind-beta-01`). Arbeid først i `docs/backend-contract.md`, `docs/access-matrix.md` og eventuelle isolerte kontrakttester. La `app.mjs`, `domain.mjs` og `test/browser.mjs` være urørt mens ChatGPT videreutvikler oppfølgingsflyten. Avtal ny fordeling i PR hvis du trenger å endre disse.

Kontrakten skal definere Person, Contact, Relationship, SalesCase, Action, Handoff og AuditEvent; API-feil, feltvalidering, samtidige oppdateringer med revisjon/ETag og idempotent inntak. Tilgangsmatrisen må dekke rolle, avdeling, team og sakstildeling på server; leder skal kunne få aggregater uten personsaksinnsyn, teknisk administrator skal ikke automatisk ha personinnsyn. Ta med negative tester av søk, direkte oppslag, endring og eksport.

Ikke velg en faktisk tenant, opprett databasekonto, sett opp hemmeligheter eller ta i bruk reelle data. Drift og identitet gjenstår å avklare. Lever konkret forslag som PR, med åpne beslutninger og tydelig hva som kun er spesifisert.

## Status ved videreføring
Beta: registrering, søk, kontaktløp, BPA-prosess, frister, pause, milepæler, simulert bekreftet overlevering og rapport. Neste tillegg registrerer fullført oppfølging med nytt steg og bevarer forrige handling. Klientdata er bare sessionStorage. 12 regeltester består lokalt etter tillegget; sjekk siste CI for nettlesertest. Claude-tilgang og kjøring er ikke bekreftet fra ChatGPT.

## Status for oppgaven over – 13. november 2026
Levert som forslag: `docs/backend-contract.md`, `docs/access-matrix.md`, `contract/reference-model.mjs` og `test/contract.test.mjs` (`npm run test:contract`). Planen i `docs/backlog.md` er revidert med faser, port før reelle data og beslutningsregister B-01 til B-12. Ingenting er godkjent eller bygget som backend. `app.mjs`, `domain.mjs` og `test/browser.mjs` er ikke endret.

## Status – server og klient, 13. november 2026 (senere samme dag)
Levert som utkast-PR fra `javsit87/admiring-franklin-0kh3be`: `docs/decision-brief.md`, API-server i `server/` bak porter for lagring og identitet med utviklingsadaptere, API-tester i `test/api/` (`npm run test:api`, N-01 til N-22 mot HTTP), klient bak datakilde i `client/`, `test/browser-api.mjs` og `docs/operations.md`. `app.mjs`, `index.html` og `server.mjs` er endret etter eksplisitt oppdrag. `domain.mjs`, `test/domain.test.mjs` og `test/browser.mjs` er ikke endret. B-01 til B-12 er fortsatt åpne, porten er ikke passert, og produksjonsprofilen starter ikke. Ikke skriv OIDC- eller databaseadapter før B-01 til B-03 er besluttet.
