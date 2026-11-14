# Backendkontrakt – forslag, bygget med utviklingsadaptere

Status: forslag til vurdering, 13. november 2026. Kontrakten er ikke godkjent. Den er bygget i `server/` og testet over HTTP, men bare med utviklingsadaptere for lagring og innlogging. Det finnes ingen database og ingen reell innlogging. Dokumentet beskriver hva en backend må oppfylle, uavhengig av leverandør og teknologivalg. Tilgangsregler står i [access-matrix.md](access-matrix.md). Åpne beslutninger har ID-er (B-xx) som viser til registeret i [backlog.md](backlog.md).

Grunnlag: [architecture.md](architecture.md), CLAUDE.md, issue #2 og reglene i `domain.mjs`. Prosjektbeskrivelsen «Salgsverktøy Medvind 1.0 beta» ligger ikke i repoet og er ikke lest.

| Del | Status |
|---|---|
| Datamodell, valideringsregler, API-feil, revisjonskontroll, idempotent inntak | Spesifisert her |
| Tilgangsregler, revisjonskontroll og idempotens | Kjørbar referansemodell i `contract/reference-model.mjs`, testet med `npm run test:contract` |
| API-server med validering, feilformat, revisjonskontroll, inntak, revisjonslogg, eksport og tilgang | Bygget i `server/`, testet med `npm run test:api` mot utviklingsadaptere |
| Database, reell innlogging (OIDC), varsling, sletting | Ikke bygget. Krever B-01, B-02, B-03, B-10, B-11 |

## 1. Felles regler

- JSON over HTTPS under `/api/v1`. Brudd på kontrakten krever ny versjon.
- `id` er UUID satt av server. Klienten kan ikke velge eller endre `id`.
- Alle ressurser har `revision` (heltall fra 1, øker med 1 per endring), `createdAt`, `updatedAt` og `createdBy`. Disse settes av server.
- Tidspunkt er RFC 3339 i UTC. Frister og milepæler er kalenderdatoer (`YYYY-MM-DD`) vurdert i norsk tid (Europe/Oslo), som i prototypen.
- Tekstfelt trimmes. Maks 200 tegn der ikke annet er oppgitt.
- Ukjente felt avvises med `unknown_field`. De ignoreres ikke stille.
- Serveren validerer alt på nytt. Klientvalidering er bare brukerstøtte.
- Fritekst om helse skal ikke forekomme. Modellen har derfor ingen notatfelt. Se B-04.

## 2. Datamodell

Prototypen har ett flatt sakskort. Kontrakten deler det i sju ressurser, slik arkitekturnotatet beskriver.

```
Person 1 ── * Relationship * ── 1 Contact
Person 1 ── * SalesCase 1 ── * Action
                          1 ── * Handoff
                          1 ── * Activity
                          1 ── * AuditEvent
```

### Person
Den saken gjelder. Holdes minimal.

| Felt | Type | Regel |
|---|---|---|
| `displayName` | tekst | Påkrevd |

### Contact
Den Medvind kommuniserer med. En kontakt kan gjelde flere personer og saker.

| Felt | Type | Regel |
|---|---|---|
| `displayName` | tekst | Påkrevd |
| `email` | tekst | Valgfri. Gyldig e-postformat |
| `phone` | tekst | Valgfri |
| `emailNormalized`, `phoneNormalized` | tekst | Utledet av server (små bokstaver og trimmet; bare sifre). Brukes til dublettkontroll |

Kontaktønsker, formål og samtykkefelt er ikke med. De krever avklaring, se B-04. Kilde eller kampanje innebærer ikke markedsføringssamtykke.

### Relationship
Kobler Contact til Person.

| Felt | Type | Regel |
|---|---|---|
| `personId`, `contactId` | UUID | Påkrevd. Kombinasjonen er unik blant aktive relasjoner |
| `role` | kode | `self`, `next_of_kin`, `guardian`, `municipal_caseworker`, `other`. Kodeverket må bekreftes med salgsteamet |
| `endedAt` | tidspunkt | Valgfri. Avsluttet relasjon beholdes for historikk |

### SalesCase

| Felt | Type | Regel |
|---|---|---|
| `name` | tekst | Påkrevd (saksnavn) |
| `personId` | UUID | Påkrevd |
| `primaryContactId` | UUID | Valgfri. Må ha Relationship til sakens person |
| `municipality` | tekst | Påkrevd |
| `department` | kode | Påkrevd. Må finnes i kodeverk |
| `team` | kode | Påkrevd. Må tilhøre avdelingen |
| `ownerId` | UUID | Påkrevd for aktive saker |
| `status` | kode | Se kodeverk under |
| `bpa` | kode | Se kodeverk under |
| `source` | kode | Se kodeverk under |
| `reason` | tekst | Påkrevd når `status` er `on_hold` eller `closed` |
| `agreementDate` | dato | Valgfri. Krever ikke ordningsnummer |
| `startDate` | dato | Valgfri. Se regler under |
| `closeOutcome` | kode | Valgfri. Bare på avsluttet sak. Nullstilles av server når saken åpnes igjen |
| `closedAt` | tidspunkt | Satt av server ved avslutning |

Neste handling og frist er ikke felt på saken. De ligger i sakens åpne Action.

| Kodeverk | Kode → visning i prototypen |
|---|---|
| `status` | `new` Ny · `dialog` Dialog · `on_hold` Avventer · `handover` Oppstartsoverlevering · `closed` Avsluttet |
| `bpa` | `unclear` Uavklart · `application` Søknad · `awaiting_decision` Venter på vedtak · `decision_made` Vedtak foreligger · `provider_change` Leverandørbytte |
| `source` | `website` Nettside · `email` E-post · `phone` Telefon · `fair` Messe · `referral` Anbefaling |
| `closeOutcome` | `won` Vunnet – oppstart · `lost_other_provider` Tapt – valgte annen leverandør · `lost_not_relevant` Tapt – ikke aktuelt lenger · `lost_no_response` Tapt – ingen respons · `invalid` Feilregistrert eller dublett · `other` Annet |
| `activityType` | `call` Telefon · `meeting` Møte · `email` E-post · `sms` SMS · `note` Notat |
| `activityOutcome` | `reached` Fikk kontakt · `no_answer` Ikke svar · `message_left` La igjen beskjed · `meeting_booked` Møte avtalt |

Stabile koder i stedet for visningstekst er et forslag, se B-07.

### Action

| Felt | Type | Regel |
|---|---|---|
| `caseId` | UUID | Påkrevd |
| `description` | tekst | Påkrevd |
| `assigneeId` | UUID | Påkrevd |
| `dueDate` | dato | Påkrevd. Fra i dag eller senere når handlingen opprettes |
| `completedAt`, `completedBy` | tidspunkt, UUID | Settes av server ved fullføring. Fullført handling kan ikke endres |

### Handoff

| Felt | Type | Regel |
|---|---|---|
| `caseId`, `fromUserId`, `toUserId` | UUID | Påkrevd. Mottaker kan ikke være nåværende eier |
| `state` | kode | `pending`, `confirmed`. Forslag til utvidelse: `declined`, `cancelled`, se B-08 |
| `requestedAt`, `decidedAt` | tidspunkt | Settes av server |

### Activity

Gjennomført kontakt eller notat på en sak. Lagt til 14. november 2026, se [crm-features.md](crm-features.md). Kan bare legges til. Det finnes ingen rute for endring eller sletting.

| Felt | Type | Regel |
|---|---|---|
| `caseId` | UUID | Påkrevd |
| `type` | kode | Påkrevd. Se kodeverk `activityType` |
| `outcome` | kode | Påkrevd for alle typer unntatt `note`. Ikke tillatt for `note` |
| `note` | tekst | Valgfri, inntil 200 tegn. Påkrevd for `note`. Fritekst: skrives aldri til revisjonsloggen. Om feltet skal finnes med reelle data er åpent, se B-04 og B-10 |
| `at`, `by` | tidspunkt, UUID | Settes av server |

### AuditEvent
Ligger på server, kan bare legges til, og kan ikke endres eller slettes via API.

| Felt | Type | Innhold |
|---|---|---|
| `at`, `requestId` | tidspunkt, UUID | Når, og hvilken forespørsel |
| `actorId`, `actorRoles` | UUID, liste | Hvem, med rollene på tidspunktet. Tjenestekontoer inngår |
| `operation` | kode | Operasjonskoden fra tilgangsmatrisen, for eksempel `case.read` |
| `outcome` | kode | `allowed` eller `denied`, med årsakskode ved avslag |
| `entityType`, `entityId`, `caseId` | kode, UUID | Hva hendelsen gjelder |
| `changedFields` | liste | Navn på endrede felt |
| `purpose` | tekst | Påkrevd ved eksport |

Loggføres: opprettelse, endring, fullføring, overlevering, eierskifte, eksport, direkte oppslag, søk, avslag og endring av roller eller oppsett. Om loggen skal lagre gamle og nye feltverdier, og om søketekst skal lagres, er ikke besluttet. Begge deler kan gi en ny kopi av personopplysninger, se B-10.

Sakshistorikken brukeren ser er et utdrag av AuditEvent for saken, uten oppslag og søk.

## 3. Valideringsregler

Reglene i prototypen videreføres på server. Kolonnen «Kilde» viser hvor regelen er i dag.

| ID | Regel | Feilkode | Kilde |
|---|---|---|---|
| V-01 | `name`, `municipality`, `department` må fylles ut | `required` | `validate` |
| V-02 | `status`, `bpa`, `source` må være gyldig kode | `invalid_enum` | `validate` |
| V-03 | Aktiv sak (`status` ≠ `closed`) må ha eier og nøyaktig én åpen Action med ansvarlig og gyldig frist | `open_action_required` | `validate` |
| V-04 | `on_hold` og `closed` krever `reason`. Ved `on_hold` er fristen dato for ny vurdering | `required` | `validate` |
| V-05 | Datoer må være gyldige kalenderdatoer | `invalid_date` | `validDate` |
| V-06 | `startDate` krever `agreementDate` og kan ikke være før den | `date_order` | `validate` |
| V-07 | `startDate` kan ikke ligge i fremtiden | `future_date` | `validate` |
| V-08 | `email` må ha gyldig format | `invalid_email` | `validate` |
| V-09 | Fullføring krever ny handling med frist fra i dag eller senere | `next_action_required` | `completeFollowup` |
| V-10 | Avsluttet sak kan ikke få fullført oppfølging eller overlevering | `case_closed` | `completeFollowup`, `requestHandoff` |
| V-11 | Overlevering krever `agreementDate` | `agreement_required` | `requestHandoff` |
| V-12 | Saken kan bare ha én ventende overlevering | `handoff_pending` | `requestHandoff` |
| V-13 | Eier flyttes først når mottaker bekrefter | – | `acceptHandoff` |
| V-14 | Mulig dublett på normalisert e-post, telefon eller saksnavn og kommune | `possible_duplicate` | `duplicates` |
| V-15 | `closeOutcome` må være gyldig kode og kan bare settes når `status` er `closed` | `invalid_enum`, `not_applicable` | `validateCloseOutcome` i `crm.mjs` |
| V-16 | Aktivitet krever gyldig type. Utfall kreves for alt unntatt notat, og notat krever tekst. Avsluttet sak kan ikke få aktivitet | `required`, `invalid_enum`, `not_applicable`, `case_closed` | `logActivity` i `crm.mjs` |

Nytt i forhold til prototypen:

- V-03 er strengere: nøyaktig én åpen handling per aktiv sak. Flere samtidige oppgaver er lagt til en senere leveranse i planen.
- Ved avslutning lukker serveren åpen handling og avviser ventende overlevering i samme transaksjon.
- V-14: prototypen blokkerer. Serveren bør svare med 409 og la en bruker med myndighet bekrefte at det ikke er en dublett. Treff utenfor brukerens innsyn skal ikke vise identifiserende opplysninger, se [access-matrix.md](access-matrix.md) og B-09.

## 4. API-feil

Feil returneres som `application/problem+json` (RFC 9457) med stabil `code`. Klienten skal styre etter `code`, ikke etter tekst.

```json
{
  "type": "https://medvind.example/problems/validation_failed",
  "title": "Valideringen feilet",
  "status": 422,
  "code": "validation_failed",
  "requestId": "…",
  "errors": [
    { "field": "startDate", "code": "date_order", "message": "Oppstart kan ikke være før avtalen." }
  ]
}
```

| Status | `code` | Når |
|---|---|---|
| 400 | `malformed_request`, `idempotency_key_required` | Ugyldig JSON eller manglende nøkkel ved inntak |
| 401 | `unauthenticated` | Ingen gyldig sesjon |
| 403 | `forbidden_operation`, `forbidden_scope` | Se tilgangsmatrisen |
| 404 | `not_found` | Finnes ikke, eller er utenfor innsyn. Likt svar |
| 403 | `forbidden_origin` | Skrivende kall med `Origin` fra en annen vert |
| 405 | `method_not_allowed` | Ruten finnes, men ikke med denne metoden |
| 409 | `possible_duplicate`, `handoff_pending`, `handoff_not_pending`, `case_closed`, `agreement_required`, `action_already_completed` | Forespørselen er gyldig, men strider mot sakens tilstand |
| 413 | `payload_too_large` | Innhold over 64 kB |
| 415 | `unsupported_media_type` | Skrivende kall uten `Content-Type: application/json` |
| 412 | `precondition_failed` | `If-Match` stemmer ikke med gjeldende revisjon |
| 422 | `validation_failed`, `idempotency_key_reused` | Feltfeil, eller nøkkel gjenbrukt med annet innhold |
| 428 | `precondition_required` | `If-Match` mangler |
| 429 | `rate_limited` | For mange forespørsler. `Retry-After` oppgis |
| 500 | `internal_error` | Uventet feil. Ingen interne detaljer i svaret |

Feltfeil har kodene `required`, `invalid_enum`, `invalid_date`, `invalid_email`, `invalid_type`, `invalid_reference`, `too_long`, `unknown_field`, `read_only`, `past_date`, `future_date`, `date_order`, `open_action_required` og `next_action_required`. Kodene i de tre radene 403 `forbidden_origin`, 405, 413 og 415 samt `handoff_not_pending`, `action_already_completed` og feltkodene utover tabellen i kapittel 3 er lagt til under bygging.

Rekkefølgen på kontrollene er: sesjon (401), tilgang (403 eller 404), `If-Match` (428 eller 412), validering (422), tilstand (409). En bruker uten innsyn får derfor 404 også når `If-Match` mangler.

Feilmeldinger skal ikke inneholde personopplysninger eller opplysninger om andre saker. `requestId` gjør at feilen kan finnes i loggen uten at innholdet gjengis.

## 5. Samtidige oppdateringer

- Hvert svar med en ressurs har `ETag: "<revision>"`.
- Alle endringer krever `If-Match` med ETag fra siste lesing. Det gjelder PATCH, fullføring, overlevering, bekreftelse og eierskifte. `If-Match: *` godtas ikke.
- Mangler headeren, svarer serveren 428. Er revisjonen utdatert, svarer den 412 med gjeldende ETag. Ingenting er da endret.
- Klienten henter saken på nytt, viser brukeren hva som er endret, og lar brukeren sende på nytt. Automatisk overskriving er ikke tillatt.
- Handlinger som berører flere ressurser (fullføring oppretter ny Action, bekreftelse flytter eier) skjer i én transaksjon og øker sakens revisjon. `If-Match` gjelder saken.

Eksempel: To brukere leser en sak med revisjon 3. Den første lagrer og får revisjon 4. Den andre sender `If-Match: "3"`, får 412 og må lese saken på nytt. Dette er verifisert i referansemodellen.

## 6. Endepunkter

Oversikten viser omfanget, ikke endelig utforming.

| Metode og sti | Operasjon | Merknad |
|---|---|---|
| `GET /me` | – | Innlogget bruker, tildelte operasjoner og kodeverk. Krever bare sesjon |
| `GET /users` | `directory.read` | Kolleger med saksrolle i egne avdelinger, for valg av ansvarlig og mottaker |
| `GET /cases` | `case.search` | Søk (`q`), filtre (`status`, `bpa`, `source`, `ownerId`), sideinndeling med `limit` og `cursor`. Bare saker i omfanget |
| `POST /cases` | `case.create` | Oppretter sak med første Action i samme kall |
| `GET /cases/{id}` | `case.read` | Med Person, kontakter, åpen Action, ventende Handoff og aktiviteter |
| `PATCH /cases/{id}` | `case.update` | Delvis oppdatering. Krever `If-Match` |
| `POST /cases/{id}/actions/{actionId}/complete` | `action.complete` | Krever neste handling, ansvarlig og frist |
| `POST /cases/{id}/handoffs` | `handoff.request` | |
| `POST /cases/{id}/handoffs/{handoffId}/confirm` | `handoff.confirm` | Flytter eier |
| `POST /cases/{id}/activities` | `activity.create` | Logger aktivitet. Krever `If-Match` og øker sakens revisjon. Svarer 201 med saken |
| `POST /cases/{id}/reassign` | `case.reassign` | Eierskifte uten bekreftelse. Krever begrunnelse |
| `GET /cases/{id}/events` | `case.read` | Sakshistorikk |
| `GET /reports/aggregate` | `report.aggregate` | `from`, `to`, `groupBy`. Bare antall |
| `POST /exports` | `case.export` | Krever `purpose` |
| `GET /audit-events` | `audit.read` | Filtre `caseId`, `actorId`, `operation`, `outcome` |
| `GET /admin/config` | `admin.config` | Teknisk oppsett uten saks- eller persondata. Endring av kodeverk er ikke bygget |
| `POST /intake/web-form` | `intake.submit` | Se under |

Person, Contact og Relationship opprettes og endres under saken de tilhører, og følger sakens tilgang. Det finnes ingen ruter som `/persons/{id}` eller `/contacts/{id}`.

Valg gjort under bygging, som må bekreftes:

- `POST /cases` tar `person`, `contact` og `action` som nøstede objekter. Uten `person` brukes saksnavnet. Hver ny sak får egen Person og Contact. Gjenbruk og sammenslåing er ikke bygget.
- `PATCH /cases/{id}` kan ikke endre `ownerId`. Eier endres bare ved bekreftet overlevering eller eierskifte.
- Flytting til annet team eller annen avdeling krever at målet er i brukerens omfang for `case.create`.
- Eier, ansvarlig og mottaker må være ansatt med saksrolle i sakens avdeling (B-08).
- Ved bekreftet overlevering og ved eierskifte følger åpen handling med når tidligere eier var ansvarlig. Eierskifte trekker ventende overlevering (`cancelled`).
- Bare teamleder og avdelingsleder kan sende `confirmNotDuplicate: true` (B-09).
- Aggregater filtreres på opprettelsesdato og returnerer ingen totalsum (B-06).
- Frist må være i dag eller senere når en handling opprettes eller fristen endres. Uendret, forfalt frist hindrer ikke annen lagring.
- Aktivitet får tidspunktet den logges. Tilbakedatering er ikke mulig. Logging øker sakens revisjon, slik at en samtidig redigering får 412 og må lese saken på nytt.
- `closeOutcome` er valgfritt. Om det skal være påkrevd ved avslutning avgjøres når kodeverket er bekreftet (fase 1).

## 7. Idempotent inntak

Gjelder nettskjema og senere prøveimport.

1. Avsender må sende `Idempotency-Key` (16–128 tegn, unik per innsending). Mangler den: 400.
2. Første gang nøkkelen brukes lagres innsendingen, og svaret er `202 Accepted` med `submissionId`.
3. Samme nøkkel med samme innhold gir samme svar på nytt med `Idempotent-Replayed: true`. Det opprettes ikke noe nytt. Rekkefølgen på feltene har ingen betydning.
4. Samme nøkkel med annet innhold gir 422 `idempotency_key_reused`.
5. Tillatte felt i forslaget er `name`, `email`, `phone` og `municipality`. Navn og minst ett kontaktpunkt er påkrevd. Andre felt avvises. Fritekstfelt er bevisst utelatt, fordi det inviterer til helseopplysninger. Se B-09.
6. Svaret til avsender er likt enten kontakten finnes fra før eller ikke. Mulig dublett merkes internt og går til manuell vurdering.
7. En innsending blir ikke automatisk en sak. Den får tilstand `received`, `possible_duplicate`, `converted`, `rejected` eller `failed`. Ruting til avdeling, team og eier skjer etter regler som må besluttes. Innsendinger som ikke kan rutes eller behandles havner i feilkø med synlig antall og alder.
8. Endepunktet har ratebegrensning og tjenestekonto med bare `intake.submit`. Tjenestekontoen kan ikke lese saker.

Hvor lenge nøkler oppbevares er ikke besluttet. Det må være lenger enn avsenders lengste gjenforsøk. Punkt 1–6 og 8 er bygget og testet mot API-et. Av punkt 7 er bare tilstandene `received` og `possible_duplicate` bygget. Ruting, konvertering til sak og feilkø er ikke bygget, og ingen rolle kan i dag lese innsendinger.

## 8. Hva som ikke er spesifisert

- Autentisering, sesjoner og hvor roller og tilhørighet hentes fra (B-02). Identitetsporten i `server/ports.mjs` beskriver hva en adapter må levere.
- Lagringstid, sletting, innsyn for registrerte og oppbevaring av logg (B-10).
- Påminnelser og varsling (B-11).
- Historiske rapporter og måltall. Dagens rapport bruker gjeldende status, ikke øyeblikksbilder.
- Ytelse, sideinndeling i detalj, og drift (sikkerhetskopi, gjenoppretting, overvåking).
- Avslag og tilbaketrekking av overlevering (B-08), innsynsuttrekk for registrerte (B-10) og administrasjon av kodeverk.

## 9. Fra kontrakttest til backendtest

`test/contract.test.mjs` kjører mot referansemodellen. `test/api/` kjører de samme tilfellene og N-19 til N-23 mot API-et over HTTP med testbrukere per rolle (`npm run test:api`, 57 tester). En egen test sammenligner serverens tilgangsavgjørelse med referansemodellen for alle roller, operasjoner og saksforhold.

Testene beviser at API-et følger reglene med utviklingsadaptere. De beviser ikke at en databaseadapter eller en OIDC-adapter gjør det. Når slike adaptere finnes, skal `test/api/` kjøres mot dem i et produksjonslikt miljø før porten kan kvitteres.
