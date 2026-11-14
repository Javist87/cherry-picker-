# CRM-funksjoner – sammenligning og prioritering

Status: forslag, 14. november 2026. Dokumentet sammenligner Cherry Picker med vanlige CRM-systemer og sier hva som er lagt inn nå, hva som bør komme, og hva som bør vente. Kodeverk og terskler som er lagt inn er forslag og må bekreftes med salgsteamet (fase 1 i [backlog.md](backlog.md)).

## Kort konklusjon

Cherry Picker hadde fra før det som skiller et salgsverktøy fra en liste: obligatorisk neste steg, tydelig eier, dublettvarsel, overlevering med bekreftelse og tilgang på server. Det som manglet mest sammenlignet med Lime, Salesforce og Pipedrive var **aktivitetslogg, varsel om saker som står stille, ferdige arbeidslister, utfall ved avslutning og konverteringstall**. Disse fem er lagt inn i programmet i denne leveransen.

Det meste av det som gjenstår er ikke kodearbeid først. Det er blokkert av beslutningene B-01 til B-12, særlig påminnelser (B-11), samtykke og kontaktønsker (B-04) og e-post- og kalenderintegrasjon (utenfor beta).

## Kilder og forbehold

Sammenligningen bygger på leverandørenes egne produktsider og tredjeparts oversikter, lest 14. november 2026. Den er ikke en test av produktene. Hva som inngår i hvilken lisens varierer og er ikke kontrollert. Der kildene var uklare står det «ikke bekreftet».

- Lime CRM: [produktside](https://www.lime-technologies.com/en/lime-crm/), [salg](https://www.lime-technologies.com/en/lime-crm/sales/), [GDPR](https://www.lime-technologies.com/en/insights/articles/how-lime-crm-supports-gdpr-compliance/), [Lime Go-funksjoner](https://www.lime-technologies.com/en/lime-go/features)
- Salesforce Sales Cloud: [funksjonsoversikt](https://www.salesforce.com/eu/products/sales-cloud/features/), [gjennomgang hos ZoomInfo](https://pipeline.zoominfo.com/sales/salesforce-features)
- Pipedrive: [funksjoner](https://www.pipedrive.com/nb/crm/features), [sammenligning med HubSpot hos Insightly](https://www.insightly.com/blog/hubspot-vs-pipedrive-crm-comparison/)
- SuperOffice: [pipeline og salgsoppfølging](https://www.superoffice.com/blog/best-sales-crm-pipeline-tracking/)

## Sammenligning

«Nå» betyr lagt inn i denne leveransen. «Fra før» fantes allerede.

| Funksjon | Hvor den er kjent fra | Cherry Picker | Merknad |
|---|---|---|---|
| Ett kundekort med kontakt, status og milepæler | Alle | Fra før | Sakskortet |
| Obligatorisk neste aktivitet på åpne saker | Pipedrive | Fra før | Håndheves på server (V-03) |
| Salgsflyt som tavle | Lime, Salesforce (Kanban), Pipedrive | Fra før | Uten dra-og-slipp |
| Dublettvarsel | Salesforce (dublettregler), Lime | Fra før | Sammenslåing er ikke bygget |
| Roller, omfang og revisjonslogg | Salesforce, Lime | Fra før | Bare med utviklingsadaptere |
| Aktivitetslogg på kundekortet (samtale, møte, e-post, notat) | Salesforce (Activity Timeline), Lime (historikk) | **Nå** | Type, utfall og kort notat |
| Varsel om saker som står stille | Pipedrive («rotting») | **Nå** | 14 dager uten aktivitet, forslag |
| Ferdige arbeidslister og sortering | Salesforce (List Views), Lime (filtre) | **Nå** | Sju faste lister. Egne lagrede lister gjenstår |
| Utfall ved avslutning (vunnet og tapsårsak) | Salesforce, Pipedrive, SuperOffice | **Nå** | Kodeverk er forslag |
| Salgstrakt og konvertering per kilde | Alle | **Nå** | Kohort på registreringsdato, dagens status |
| Ring og skriv e-post fra kortet | Alle | **Nå** | Lenker til egen telefon og e-postklient. Ingen utsending fra verktøyet |
| Påminnelser og varsler på frist | Lime Go, Pipedrive, HubSpot | Mangler | Fase 5. Krever B-11 |
| Flere oppgaver per sak | Alle | Mangler | Fase 5. Dagens modell har én åpen handling |
| E-post- og kalenderkobling | Alle | Mangler | Utenfor beta. Krever eget mandat |
| Samtykke og kontaktønsker | Lime (GDPR-portal), HubSpot | Mangler | Krever B-04 |
| Innsyn, eksport og sletting for registrerte | Lime (GDPR-portal) | Mangler | Krever B-10 |
| Import og nettskjemainntak | Alle | Delvis | Idempotent inntak finnes på server. Ruting og import er fase 6 |
| Prognose og verdi per sak | Salesforce (Forecasting), Pipedrive | Mangler | Se «Bør vente» |
| Automatisering og e-postsekvenser | HubSpot, Salesforce | Mangler | Se «Bør vente» |
| AI-rangering av leads | Salesforce (Einstein), Lime (AI) | Mangler | Besluttet utenfor beta |
| Dra-og-slipp i tavle | Salesforce, Pipedrive | Mangler | Lav verdi mot kostnad, se under |
| Dashbord for ledelse | Alle | Delvis | Aggregater uten personinnsyn finnes. Krever B-06 |

## Lagt inn nå

Alt under virker i den frittstående prototypen og mot API-serveren. Regler ligger i `crm.mjs`, og serverdelen i `server/service.mjs`.

### 1. Aktivitetslogg

På sakskortet kan ansvarlig logge telefon, møte, e-post, SMS eller notat, med utfall (fikk kontakt, ikke svar, la igjen beskjed, møte avtalt) og et kort notat på inntil 200 tegn. Loggen kan bare legges til, ikke endres eller slettes.

- **Tilgang på server:** ny operasjon `activity.create` med samme omfang som `case.update`. Selger kan logge på saker selgeren eier. Ventende mottaker av overlevering kan ikke logge før ansvaret er flyttet (N-23).
- **Personvern:** notatet er fritekst og lagres på saken. Det skrives aldri til revisjonsloggen. Feltet har advarsel mot helseopplysninger, men en advarsel hindrer ikke feil bruk. Se åpent spørsmål Å-1.

### 2. Stillstandsvarsel

Aktive saker uten registrert aktivitet på 14 dager merkes i lister, tavle og arbeidsdag. Siste aktivitet er den nyeste av registrering, fullført oppfølging og logget aktivitet. Saker som avventer er unntatt, fordi de har en avtalt dato for ny vurdering.

### 3. Smarte lister og sortering

Faste lister over søkefeltet: alle, mine aktive, forfalt, frist innen 7 dager, uten aktivitet, mangler kontaktinfo og avsluttet. Hver liste viser antall. Kolonnene kan sorteres, også med tastatur. Listene kombineres med søk og filtre.

Valget lagres ikke mellom besøk. I API-modus skal ingenting ligge i nettleserlagring, så egne lagrede lister må lagres på server og er ikke bygget.

### 4. Utfall ved avslutning

Avsluttede saker kan få et kodet utfall: vunnet (oppstart), tapt (valgte annen leverandør, ikke aktuelt lenger, ingen respons), feilregistrert eller dublett, annet. Feltet er valgfritt, slik at eksisterende flyt ikke brytes. Serveren avviser utfall på aktive saker og nullstiller utfallet når en sak åpnes igjen. Fritekstfeltet «årsak» er beholdt.

### 5. Salgstrakt og konvertering

Rapporten viser for henvendelser registrert i perioden: antall, avtaler og oppstarter, konvertering i prosent, median tid til avtale og fra avtale til oppstart, konvertering per kilde og fordeling av utfall.

Definisjonen står i rapporten: tallene måles på dagens status og er ikke historiske øyeblikksbilder. Tidligere versjon viste bevisst ingen konverteringsprosent, fordi datakilden ikke var avklart. Prosenten som er lagt inn nå har én entydig definisjon og bruker bare felt som finnes. Den må likevel godkjennes som rapportdefinisjon i fase 7. Omsetning er fortsatt ikke med.

Ledere uten saksinnsyn ser ikke trakten. De har fortsatt bare aggregatene med undertrykking av små grupper (B-06).

### 6. Ring og skriv e-post

Sakskortet har lenker som åpner brukerens egen telefon eller e-postklient. Verktøyet sender ingenting selv og logger ikke automatisk. Brukeren logger aktiviteten etterpå.

## Bør komme, i anbefalt rekkefølge

| Nr. | Funksjon | Hvorfor | Avhenger av |
|---|---|---|---|
| 1 | Påminnelser på frist og stillstand | Størst effekt på oppfølging. I dag må brukeren åpne verktøyet | B-11 (kanal og avsender), fase 4 |
| 2 | Flere oppgaver per sak | Én åpen handling er for lite når flere parter er involvert | Fase 5, endring i V-03 |
| 3 | Samtykke og kontaktønsker | Må være på plass før reell kontakt registreres | B-04 |
| 4 | Sammenslåing av dubletter | Dublettvarsel uten sammenslåing gir manuelt arbeid | B-09 |
| 5 | Egne lagrede lister | Faste lister dekker ikke alle arbeidsmåter | Lagring på server |
| 6 | Utfall og stillstand som aggregat for ledere | Tapsårsaker er mest nyttige på tvers av selgere | B-06, fordi små tall kan identifisere |
| 7 | Avslag og tilbaketrekking av overlevering | Mangler i dagens flyt | B-08 |
| 8 | Import og ruting av nettskjema | Én registrering per henvendelse | Fase 6, B-09 |

## Bør vente eller ikke bygges

- **Verdi per sak og prognose.** I BPA-salg er verdien i praksis antall vedtakstimer. Det kan være en opplysning om helse (risiko R-01). Bør ikke legges inn før B-04 er avklart.
- **AI-rangering av leads.** Besluttet utenfor beta. Varslene som er lagt inn er regelbaserte og forklarbare, og de rangerer ikke personer.
- **Automatiske e-postsekvenser og utsending.** Besluttet utenfor beta. Krever samtykke, avsender og sporbar levering.
- **Dra-og-slipp i salgsflyten.** Statusbytte krever ofte årsak, frist eller avtaledato, så et slipp må uansett åpne sakskortet. Gevinsten er liten, og løsningen må ha et fullverdig tastaturalternativ.
- **Markedsføring og kampanjer.** Kilde skal ikke innebære markedsføringssamtykke. Hører til etter B-04.
- **Dokumenter og e-signering.** Utenfor beta, og dokumenter i BPA-saker vil ofte inneholde helseopplysninger.

## Åpne spørsmål fra denne leveransen

| Nr. | Spørsmål | Forslag | Hører til |
|---|---|---|---|
| Å-1 | Skal aktivitetsloggen ha fritekstnotat, eller bare type og utfall? | Behold kort notat i beta med fiktive data. Avgjør før reelle data. Notatfeltet kan fjernes uten å endre resten | B-04, B-10 |
| Å-2 | Hvem kan logge aktivitet? | Som bygget: eier, teamleder i teamet, avdelingsleder i avdelingen | B-05 |
| Å-3 | Er 14 dager riktig terskel for stillstand, og bør den variere per steg? | Start med 14 dager for alle steg og juster etter erfaring | Fase 1 |
| Å-4 | Er kodeverkene for aktivitetstype, utfall og avslutning riktige? | Gjennomgå med salgsteamet | Fase 1, B-07 |
| Å-5 | Skal utfall være påkrevd ved avslutning? | Ja, når kodeverket er bekreftet. Valgfritt nå | Fase 1 |
| Å-6 | Godkjennes definisjonen av konvertering? | Som i rapporten. Vurder historiske øyeblikksbilder senere | Fase 7 |

## Hva som er testet

Se [validation.md](validation.md). Kort: regeltester for `crm.mjs`, API-tester for aktivitetslogg og utfall inkludert N-23, og nettlesertest av funksjonene i prototypen og i API-modus. Alt er kjørt med fiktive data og utviklingsadaptere. Ingenting er kjørt mot reell database eller innlogging.
