# Beslutningsgrunnlag B-01 til B-12

Utarbeidet 13. november 2026. Dokumentet er et forslag til beslutningseierne. Ingenting her er vedtatt. Registeret med status ligger i [backlog.md](backlog.md).

## Slik leses dokumentet

- **Fakta** er det som kan kontrolleres i repoet eller i kjørte tester.
- **Antakelse** er noe som ikke er bekreftet. Organisasjonens systemer, avtaler og organisering er ikke kjent fra repoet. Prosjektbeskrivelsen «Salgsverktøy Medvind 1.0 beta» ligger ikke i repoet og er ikke lest.
- **Anbefaling** er utviklers faglige råd. Den er ikke en beslutning og ikke en juridisk vurdering.
- Eier er oppgitt som **rolle**. Navn må settes av virksomheten.
- Juridiske spørsmål (B-04, B-10 og risiko R-01) er formulert som spørsmål til personvernansvarlig eller jurist. De er ikke besvart her.

Felles fakta for alle punktene: Serveren som er bygget i denne leveransen kjører bare med lokale utviklingsadaptere (minne og testinnlogging) og nekter å starte i produksjonsprofil. Lagring og identitet ligger bak porter i `server/ports.mjs`. Valgene under avgjør hvilke adaptere som må skrives. De krever ikke at API-et bygges om.

## Oversikt

| ID | Beslutning | Anbefaling i kortform | Foreslått eier (rolle) | Blokkerer |
|---|---|---|---|---|
| B-01 | Driftsmiljø, region, databehandlere | Bruk plattform virksomheten allerede har avtale med, i EØS | IT-ansvarlig, med daglig leder | Reell drift, porten |
| B-02 | Identitet og tenant, kilde for roller | Eksisterende jobbinnlogging over OIDC, roller fra grupper | IT-ansvarlig | Reell innlogging, porten |
| B-03 | Database, kryptering, driftstilgang | Forvaltet relasjonsdatabase, driftstilgang uten standard datainnsyn | IT-ansvarlig | Reell lagring |
| B-04 | Behandlingsgrunnlag, formål, særlige kategorier | Legg R-01 frem først. Bygg datamininert til svaret foreligger | Behandlingsansvarlig ved daglig leder, med personvernansvarlig | Porten |
| B-05 | Tilgangsmatrisen | Godkjenn matrisen. Ta eksport ut av beta | Salgsleder, med personvernansvarlig | Godkjent fase 3 og 4 |
| B-06 | Minste gruppestørrelse i aggregater | Terskel 5, ingen totalsum, månedsperiode som minimum | Personvernansvarlig, med salgsleder | Fase 7 |
| B-07 | Stabile koder i API | Ja | Teknisk ansvarlig | Fase 4 |
| B-08 | Overlevering: avslag, tilbaketrekking, mottakere | Legg til avslag og tilbaketrekking. Mottaker i samme avdeling | Salgsleder | Fase 5 |
| B-09 | Inntak: felter, ruting, nøkler, dublett på tvers | Ingen fritekst. Dublettdetaljer bare i eget omfang | Salgsleder, med personvernansvarlig | Fase 6 |
| B-10 | Lagringstid, sletting, innsyn, logginnhold | Logg uten feltverdier og søketekst. Frister må settes av virksomheten | Behandlingsansvarlig, med personvernansvarlig | Porten, fase 7 |
| B-11 | Kanal og avsender for påminnelser | Start med påminnelser i verktøyet. E-post senere, uten saksinnhold | Salgsleder, med IT-ansvarlig | Fase 5 |
| B-12 | Rollekombinasjoner og nødtilgang | Forbudt kombinasjon håndheves teknisk. Nødtilgang tidsbegrenset og logget | Daglig leder, med personvernansvarlig | Fase 4 i produksjon |

---

## B-01 Driftsmiljø, region og databehandlere

**Spørsmål:** Hvor skal løsningen kjøre, i hvilken region, og hvilke leverandører blir databehandlere?

**Fakta:** Ingen driftsplattform er valgt. Serveren er ren Node.js 22 uten tredjepartsavhengigheter og kan kjøres på de fleste plattformer.
**Antakelse:** Virksomheten har allerede en eller flere skyavtaler for andre systemer. Det er ikke bekreftet.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Plattform virksomheten allerede har avtale med, region i EØS | Eksisterende avtaleverk og kompetanse. Færre nye databehandlere | Kan binde til én leverandør. Krever at noen eier driften |
| B. Ny, forvaltet applikasjonsplattform i EØS | Rask oppstart, lite drift | Ny databehandleravtale og ny leverandørvurdering. Underleverandører må gjennomgås |
| C. Egen server eller lokal drift | Full kontroll på plassering | Krever egen kompetanse på sikring, oppdatering, sikkerhetskopi og overvåking. Høyest driftsrisiko for et lite team |

**Anbefaling:** A, hvis en slik avtale finnes. Ellers B. C frarådes uten dedikert driftskompetanse. Uansett valg: region i EØS, skriftlig databehandleravtale, og oversikt over underleverandører før reelle data.
**Blokkerer:** Reell drift, produksjonsadaptere, punktet «Driftsmiljø er godkjent» i porten.
**Spørsmål til jurist eller personvernansvarlig:** Hvilke krav stiller virksomheten til overføring ut av EØS hos leverandørens underleverandører?

## B-02 Identitetsløsning og tenant

**Spørsmål:** Hvilken innlogging skal brukes, i hvilken tenant, og hvor hentes roller, avdeling og team fra?

**Fakta:** Arkitekturnotatet nevner Entra ID som kandidat. Ingen tenant er valgt. Serveren har en identitetsport og en lokal testadapter. Det finnes ingen OIDC-adapter ennå. Tilgangstest N-21 er bare kjørt mot testadapteren.
**Antakelse:** De ansatte har jobbkontoer i en felles katalog.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Eksisterende jobbinnlogging over OIDC. Roller, avdeling og team fra grupper i katalogen | Én konto, sentral avslutning av tilgang, flerfaktor følger virksomhetens regler | Gruppene må opprettes og forvaltes. Den som forvalter grupper kan i praksis gi tilgang, se B-12 |
| B. Eksisterende jobbinnlogging over OIDC. Roller og tilhørighet forvaltes i verktøyet | Uavhengig av katalogstruktur | Krever egen administrasjonsflate og egen kontroll. Teknisk administrator får da makt over tilgang, i strid med prinsippet i matrisen |
| C. Egen brukerdatabase med passord | Ingen avhengighet til katalog | Egen passordhåndtering og flerfaktor. Frarådes |

**Anbefaling:** A. Rollene `selger`, `teamleder`, `avdelingsleder`, `leder`, `teknisk_admin` og `revisor` som egne grupper, og avdeling og team som grupper eller attributter. Fastsett samtidig hvor raskt en fjernet rolle skal virke (forslag: innen 15 minutter) og sesjonens levetid (forslag: 8 timer).
**Blokkerer:** OIDC-adapter, punktet «Jobbinnlogging er i bruk» i porten, N-21 mot reell løsning.

## B-03 Database, kryptering og tilgang for driftspersonell

**Spørsmål:** Hvilken database, hvordan krypteres data, og hvem i drift kan lese innholdet?

**Fakta:** Lagringsporten krever transaksjoner, revisjonskontroll og en logg som bare kan legges til. Testadapteren lagrer i minnet og mister alt ved omstart.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Forvaltet relasjonsdatabase (for eksempel PostgreSQL) hos valgt driftsleverandør | Transaksjoner, moden sikkerhetskopi, gjenoppretting til tidspunkt, bred kompetanse. Passer datamodellen | Løpende kostnad. Krever rutine for skjemaendringer |
| B. Forvaltet dokumentdatabase | Enkel start | Svakere støtte for relasjoner og transaksjoner på tvers. Mer logikk i applikasjonen |
| C. Filbasert database på applikasjonsserveren | Billig og enkelt | Sikkerhetskopi og samtidige brukere er eget ansvar. Egner seg ikke for flere instanser |

**Anbefaling:** A. Kryptering under transport og ved lagring. Applikasjonen bruker en databasekonto som ikke kan endre eller slette i loggtabellen. Driftspersonell har ikke stående lesetilgang til innholdet. Tilgang ved feilsøking følger nødtilgangen i B-12. Sikkerhetskopier krypteres og omfattes av slettefristene i B-10.
**Blokkerer:** Databaseadapter, sikkerhetskopi og gjenoppretting i porten.

## B-04 Behandlingsgrunnlag, formål og særlige kategorier

**Spørsmål:** Hva er formålet og behandlingsgrunnlaget? Er opplysningen om at en person har en BPA-sak en særlig kategori (R-01)? Skal det finnes felt for samtykke og kontaktønsker?

**Fakta:** Modellen har ingen fritekst- eller notatfelt, og inntaket avviser ukjente felt. Det er gjort for å begrense risikoen, ikke fordi spørsmålet er avgjort. R-01 står åpen i backlog.
**Utviklers vurdering, ikke juridisk konklusjon:** Svaret påvirker arkitekturen. Derfor bør det komme før B-01 til B-03 låses.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Få R-01 vurdert av personvernansvarlig eller jurist nå. Hold løsningen fri for fritekst til svaret foreligger | Unngår ombygging. Lav risiko i mellomtiden | Krever tid fra rett person tidlig |
| B. Gå videre som om opplysningene er alminnelige, og vurder senere | Raskest | Hvis vurderingen blir en annen, må tilgang, logging, lagring og kanskje driftsvalg gjøres om |
| C. Behandle alt som særlige kategorier inntil annet er avklart | Føre-var | Kan gi strengere krav enn nødvendig og forsinke pilot |

**Anbefaling:** A, med C som arbeidsforutsetning for tekniske valg til svaret foreligger.
**Spørsmål som må besvares av personvernansvarlig eller jurist:**
1. Er opplysningen om at en person er i en BPA-prosess en opplysning om helse?
2. Hva er behandlingsgrunnlaget for henvendelser fra nettskjema, telefon og messe, og for pårørende og kommunale kontaktpersoner?
3. Kreves det en personvernkonsekvensvurdering før pilot?
4. Trengs det felt for samtykke eller kontaktønsker, og hva skal de bety?
**Blokkerer:** Porten. Kontaktønske- og samtykkefelt i modellen.

## B-05 Godkjenning av tilgangsmatrisen

**Spørsmål:** Er cellene i [access-matrix.md](access-matrix.md) riktige? Særlig avdelingsleders skrivetilgang, teamleders innsyn i hele teamet, og eksport.

**Fakta:** Matrisen er bygget i serveren og testet med N-01 til N-22 mot API-et. Denne leveransen har lagt til én rad, `directory.read`, for at klienten skal kunne vise mulige ansvarlige og mottakere. Den raden er også et forslag.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Godkjenn som foreslått | Kan tas i bruk uten endring | Eksport gir en kopi av personsaksdata utenfor verktøyets tilgangskontroll |
| B. Godkjenn, men ta eksport ut av beta | Minst risiko. Aggregater dekker rapportbehov | Avstemming mot andre systemer må gjøres manuelt |
| C. Strammere: teamleder ser bare saker teamlederen er tildelt | Mindre innsyn | Teamleder kan ikke fordele eller dekke fravær. Krever annen løsning for eierskifte |

**Anbefaling:** B. Hvis eksport likevel trengs, behold kravet om formål og logging, og begrens feltene.
**Blokkerer:** Godkjent fase 3 og 4.

## B-06 Minste gruppestørrelse i aggregater

**Spørsmål:** Hvor små tall kan vises, og hvordan hindres at skjulte tall regnes ut?

**Fakta:** Serveren undertrykker grupper under en terskel (standard 5, konfigurerbar) og returnerer ingen totalsum. Den hindrer ikke utregning ved å sammenligne overlappende perioder.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Terskel 5, ingen totalsum, minste periode én kalendermåned | Enkelt å forklare. Begrenser differanseangrep vesentlig | Små avdelinger og kommuner får ofte «skjult» |
| B. Terskel 10 og avrunding til nærmeste 5 | Sterkere vern | Mindre nyttige tall |
| C. Terskel 3 | Mer detaljer | Høyere risiko for gjenkjenning, særlig i små kommuner (R-04) |

**Anbefaling:** A. Gruppering på kommune bør vurderes særskilt og kan slås av til behovet er bekreftet.
**Blokkerer:** Fase 7.

## B-07 Stabile koder i API

**Spørsmål:** Skal API-et bruke koder (`on_hold`) og la klienten vise tekst («Avventer»)?

**Fakta:** Serveren bruker koder slik kontrakten foreslår. Klienten oversetter. Prototypens lokale modus bruker fortsatt tekst.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Koder i API, tekst i klient | Tekst kan endres uten å endre data. Rapporter blir stabile | Kodeverket må vedlikeholdes ett sted |
| B. Visningstekst som verdi | Enklest nå | Omdøping krever datamigrering og bryter historiske tall |

**Anbefaling:** A. Selve kodeverket (status, BPA-prosess, kilde, relasjonsroller) bekreftes med salgsteamet i fase 1.
**Blokkerer:** Fase 4 formelt. Bygget etter A som antakelse.

## B-08 Overlevering

**Spørsmål:** Kan mottaker avslå? Kan avsender trekke tilbake? Hvem kan være mottaker?

**Fakta:** Serveren har bare `pending` og `confirmed`, og setter `cancelled` når saken avsluttes. Mottaker må i dag være en bruker med saksrolle i sakens avdeling. Det siste er en konservativ antakelse.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Legg til avslag og tilbaketrekking. Mottaker i samme avdeling | Ingen sak blir hengende. Ingen innsyn på tvers av avdelinger | Overlevering til drift i annen enhet krever egen løsning |
| B. Som A, men mottaker kan være i annen avdeling | Dekker overlevering til drift | Mottaker får lesetilgang på tvers mens overleveringen venter. Må godkjennes i B-05 |
| C. Behold dagens modell | Ingen utvikling | Feilsendt overlevering kan bare løses ved eierskifte fra leder |

**Anbefaling:** A i beta. Avklar i fase 1 om mottaker ved oppstart faktisk er i samme avdeling. Hvis ikke, vurder B.
**Blokkerer:** Fase 5.

## B-09 Inntak fra nettskjema

**Spørsmål:** Hvilke felt, er fritekst tillatt, hvordan rutes henvendelser, hvor lenge lagres nøkler, og hva vises ved dublett på tvers av avdelinger?

**Fakta:** Serveren tar imot `name`, `email`, `phone` og `municipality`, avviser alt annet, og svarer likt enten kontakten finnes eller ikke. Ved dublett på sak viser den bare treff i brukerens omfang, og ellers bare at det finnes et mulig treff. Bare teamleder og avdelingsleder kan bekrefte at det ikke er en dublett. Det siste er en antakelse. Nøkler slettes ikke i testadapteren. Ruting og feilkø-visning er ikke bygget.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Ingen fritekst. Ruting etter kommune til avdeling, ufordelt kø per avdeling. Dublettdetaljer bare i eget omfang | Minst risiko for helseopplysninger. Enkel regel | Selger må ringe for å forstå behovet. Kommunetabell må vedlikeholdes |
| B. Kort fritekst med advarsel | Mer kontekst | Inviterer til helseopplysninger. Henger sammen med B-04 |
| C. Dublettdetaljer vises på tvers av avdelinger | Raskere avklaring | Avslører at en person er kunde i en annen avdeling |

**Anbefaling:** A. Nøkler oppbevares i 30 dager som utgangspunkt, og fristen bekreftes mot nettskjemaets gjenforsøk. Meldingen «mulig treff utenfor ditt omfang» avslører i seg selv at noe finnes. Om det er akseptabelt bør personvernansvarlig vurdere.
**Blokkerer:** Fase 6.

## B-10 Lagringstid, sletting, innsyn og logginnhold

**Spørsmål:** Hvor lenge lagres saker, avviste henvendelser, logg og sikkerhetskopier? Hvordan gjennomføres innsyn og sletting? Skal loggen inneholde feltverdier og søketekst?

**Fakta:** Serveren logger hvilke felt som er endret, ikke verdiene. Søketekst logges ikke. Det finnes ingen slettefunksjon og ingen innsynsfunksjon. Ingen frister er satt.
**Ikke vurdert her:** Hvilke frister som er riktige. Det er et juridisk og forretningsmessig spørsmål.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Logg uten verdier og søketekst. Faste frister per kategori, automatisk sletting, sikkerhetskopier ruller ut etter fast tid | Minst kopiering av personopplysninger. Forutsigbart | Feilretting kan ikke lese gamle verdier fra loggen |
| B. Logg med gamle og nye verdier | Full sporbarhet | Loggen blir en ny kopi av personopplysninger og må slettes etter samme regler. Mer komplisert |
| C. Manuell sletting etter rutine | Ingen utvikling nå | Avhengig av at noen husker det. Vanskelig å dokumentere |

**Anbefaling:** A. Virksomheten fastsetter fristene for: avsluttede saker uten avtale, saker med avtale, ubehandlede og avviste henvendelser, revisjonslogg, og sikkerhetskopier.
**Spørsmål til personvernansvarlig eller jurist:** Hvilke frister gjelder, og hvordan skal sletting forholde seg til revisjonslogg og sikkerhetskopi?
**Blokkerer:** Porten og fase 7.

## B-11 Kanal og avsender for påminnelser

**Spørsmål:** Hvordan skal ansatte få påminnelser, og fra hvilken avsender?

**Fakta:** Ingen påminnelser er bygget. Ingen utsendelse er aktivert.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Bare i verktøyet (arbeidsdagen viser forfalt og kommende) | Ingen data forlater løsningen. Ingen ny databehandler | Krever at brukeren åpner verktøyet |
| B. E-post til jobbadresse med lenke, uten saksnavn og personopplysninger | Når brukeren der de er | Krever utsendelsestjeneste, avsenderadresse og sporbar levering |
| C. Varsel i samhandlingsverktøy | Synlig | Ny integrasjon og ny dataflyt. Innhold må begrenses på samme måte |

**Anbefaling:** A i beta. B når drift (B-01) er valgt. Påminnelser sendes aldri til personer utenfor virksomheten.
**Blokkerer:** Fase 5.

## B-12 Rollekombinasjoner og nødtilgang

**Spørsmål:** Kan samme person være teknisk administrator og ha saksrolle? Hvordan gis tilgang i en nødsituasjon?

**Fakta:** Serveren summerer rollene en bruker har. Den hindrer ikke kombinasjonen i dag. Det finnes ingen nødtilgang.
**Antakelse:** Organisasjonen er liten, så én person kan i praksis ha flere oppgaver.

| Alternativ | Fordeler | Ulemper og risiko |
|---|---|---|
| A. Kombinasjonen `teknisk_admin` og saksrolle avvises teknisk ved innlogging. Nødtilgang er tidsbegrenset, begrunnet, godkjent av en annen person og logget | Prinsippet kan kontrolleres | Krever to personer. Kan være upraktisk i en liten organisasjon |
| B. Kombinasjonen tillates etter dokumentert godkjenning, og varsles til revisor | Praktisk | Skillet avhenger av at noen leser varselet |
| C. Ingen regel | Enklest | Prinsippet om at teknisk rolle ikke gir personinnsyn blir uten innhold |

**Anbefaling:** A. Hvis organisasjonen er for liten, B med fast gjennomgang av loggen hver måned. Den som forvalter gruppene i katalogen (B-02) bør ikke selv ha saksrolle uten samme kontroll.
**Blokkerer:** Fase 4 i produksjon.

---

## Foreslått rekkefølge

1. **Uke 1:** Sett eier (rolle og navn) på alle tolv. Send R-01 og spørsmålene i B-04 til personvernansvarlig eller jurist. Dette har lengst ledetid og kan endre de andre valgene.
2. **Uke 1–2:** B-01 og B-02. De avgjør hvilke adaptere som skrives og er på kritisk linje.
3. **Uke 2:** B-03 følger nesten direkte av B-01. B-12 tas sammen med B-02, fordi begge handler om hvem som kan gi tilgang.
4. **Uke 2–3:** B-05 og B-07 med salgsleder, sammen med gjennomgang av prototypen i fase 1.
5. **Uke 3–4:** B-10 når svaret på B-04 foreligger.
6. **Før fase 5 og 6:** B-08, B-09 og B-11.
7. **Før fase 7:** B-06.

## E-post til beslutningseiere

Teksten kan sendes som den er. Sett inn mottakere, frist og eget navn.

> **Emne:** Salgsverktøyet Cherry Picker: tolv beslutninger vi trenger fra dere
>
> Hei,
>
> Salgsverktøyet Cherry Picker er nå bygget som en testversjon med server, tilgangsstyring og revisjonslogg. Den kjører bare med oppdiktede data og lokal testinnlogging. Vi kan ikke ta den i bruk med reelle opplysninger før tolv beslutninger er tatt. Det er beslutningene, ikke utviklingen, som nå bestemmer fremdriften.
>
> Vedlagt ligger et beslutningsgrunnlag (docs/decision-brief.md) med alternativer, risiko og en anbefaling for hvert punkt.
>
> Jeg ber om følgende innen [dato]:
>
> 1. **Daglig leder:** Bekreft hvem som eier hver beslutning, og ta stilling til B-12 (kan teknisk administrator også ha saksrolle, og hvordan gis nødtilgang).
> 2. **Personvernansvarlig eller jurist:** Vurder B-04. Det viktigste spørsmålet er om opplysningen om at en person er i en BPA-prosess må behandles som en helseopplysning. Svaret kan endre de tekniske valgene, så vi trenger det først. Deretter B-10 (lagringstid og sletting).
> 3. **IT-ansvarlig:** Ta stilling til B-01 (driftsmiljø og databehandlere), B-02 (jobbinnlogging og hvor roller hentes fra) og B-03 (database og driftstilgang).
> 4. **Salgsleder:** Gå gjennom tilgangsmatrisen (B-05), kodeverket (B-07), overlevering (B-08), nettskjema (B-09) og påminnelser (B-11). Jeg foreslår at vi gjør dette i et møte på én time med testversjonen på skjerm.
>
> Inntil beslutningene er tatt og kontrollpunktene i «Port før reelle data» er kvittert, skal det ikke legges inn reelle personopplysninger i verktøyet.
>
> Si fra hvis noen av punktene bør ligge hos en annen enn meg har foreslått.
>
> Vennlig hilsen
> [navn]

Eksempel på tilpasning: Hvis personvernansvarlig er ekstern, flytt punkt 2 til en egen e-post og legg ved bare avsnittene B-04 og B-10 samt risiko R-01 fra backlog.
