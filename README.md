# Fråga Svenskarna

Prototyp byggd på Internetstiftelsens *Svenskarna och internet 2025*.

Rapporten på 264 sidor visar nästan uteslutande totalsiffran. Tabellbilagan har
varje fråga nedbruten på 168 segment men är ett banner-ark på över tusen rader.
Det här verktyget gör den bilagan användbar: en journalist skriver en fråga på
svenska och får rätt andel, rätt bas, antal intervjuer, frågans exakta
formulering, källhänvisning och en nedladdningsbar graf.

---

## Läget just nu

Fas 1–4 är byggda och körda mot den skarpa tabellbilagan: **7 frågetabeller i
`Studie 1 bas samtliga` och 91 i `Studie 1 bas internetanvändare`, noll
överhoppade.** 98 frågor, 168 segment, 85 080 celler. Valideringen går igenom
och fem värden är kontrollerade cell för cell mot arket.

`src/data/dataset.json` i repot är genererad ur den riktiga filen. Själva
xlsx-filen är gitignore:ad — den är Internetstiftelsens.

```bash
npm install
npm run fonts     # krävs, se Typsnitt nedan
npm run dev
```

Vill du testa fas 3, frågelagret, lägg nyckeln i `.env` först:

```bash
cp .env.example .env       # fyll i ANTHROPIC_API_KEY
```

`.env` är gitignore:ad. Nyckeln läses bara av `api/ask.ts`, aldrig av klienten
— i dev flyttar `vite.config.ts` över den till `process.env` för just den
modulen. Utan nyckel svarar `/api/ask` med 501 och appen faller tillbaka på
den deterministiska sökningen med en notis i gränssnittet.

För att lägga till eller bygga om en årgång:

```bash
cp ~/Downloads/tabellbilaga-svenskarna-och-internet-2026.xlsx data/
npm run parse -- data/tabellbilaga-svenskarna-och-internet-2026.xlsx 2026
npm run validate -- 2026
npm run spotcheck -- data/tabellbilaga-svenskarna-och-internet-2026.xlsx 2026
```

Årtalet är ett eget argument och gissas aldrig ur filnamnet: en felgissad
årgång hade tyst skrivit över en annan. Parsern skriver
`src/data/dataset-<år>.json`, och appen plockar upp varje sådan fil.

**Läs `data/parse-log.txt` efter varje körning.** Parsern gissar aldrig — den
hoppar över och loggar.

---

## Kommandon

| Kommando | Vad den gör |
| --- | --- |
| `npm run parse -- <xlsx>` | Fas 1. Skriver `src/data/dataset.json` och `data/parse-log.txt`. |
| `npm run validate` | Hårda fel och rimlighetsrapport. Exit 1 om datasetet inte är publicerbart. |
| `npm run spotcheck -- <xlsx>` | Skriver ut cellens exakta adress i arket bredvid det parsade värdet. |
| `npm run fixture` | Bygger om fixturen. |
| `npm run fonts` | Hämtar Instrument Sans och IBM Plex Mono till `public/fonts/` (behövs för exporten). |
| `npm run dev` | Kör appen. Fas 3 monteras på `/api/ask` även i dev. |
| `npm run build` | Produktionsbygge. |

---

## De fyra icke-förhandlingsbara

**1. Språkmodellen svarar aldrig på frågan.** `api/ask.ts` skickar bara
frågeindexet — id, frågetext, bas, segmentgrupper, svarsalternativ. Aldrig ett
värde. Modellen returnerar en query via strukturerad output där `question_id`
är ett enum över faktiska id:n; den *kan* alltså inte hitta på ett id. Klienten
validerar dessutom om mot datasetet i `src/lib/ask.ts` och slår upp värdet
deterministiskt i `src/lib/query.ts`. Inget tal passerar modellens
textgenerering.

**2. Varje svar visar bas och n.** `AnswerCard` renderar dem alltid; de är inte
valfria props.

**3. Varje svar visar källa.** Frågans exakta formulering står överst på kortet,
ordagrant och inte versaliserad. Rapportnamn, år och utgivare står i fotnoten.

**4. Ingen match = inget svar.** Vid `no_match`, låg confidence eller ett id som
inte finns i datasetet visas "Det här har vi inte mätt" plus de tre närmaste
frågorna. Aldrig ett kort.

Alla fyra är verifierade i webbläsaren, inklusive fallet där modellen skickar
ett påhittat fråge-id (klienten avvisar det och visar förslag i stället).

---

## De fyra fällorna

**Andelar, inte procent.** Lagras rått som 0–1. `formatPct` är det enda stället
där de blir procent.

**Noll betyder ingen bas.** `Antal intervjuer = 0` ger `pct: null` med
`reason: "no_base"`. Renderas som en grå stump och texten "ingen bas", aldrig
som 0 %.

**Samma frågetext, olika bas.** Fråge-id:t innehåller bas-slug
(`..._ai_verktyg__internetanvandare_8plus_ar` mot
`..._ai_verktyg__har_anvant_ai_verktyg_8plus_ar`). Basen står i träfflistan, på
kortet och i den exporterade bilden. Valideringen listar alla frågetexter som
förekommer på flera baser.

**Viktade baser.** Bilagan är inte konsekvent: `Antal intervjuer` finns bara i
första tabellen på varje blad. 96 av 98 tabeller redovisar enbart
`Antal viktade intervjuer`.
Saknas den ovägda raden används det viktade talet som bas, och `n_basis` sätts
till `viktade_intervjuer`. Då står det `VIKTADE INTERVJUER = 2 920` i fotnoten i
stället för `N = 2 806` — ett viktat tal är inte ett antal genomförda intervjuer
och får inte presenteras som ett. Valideringen räknar hur många frågor det
gäller, och parsern loggar varje sådan tabell.

**Små baser.** `reliable: false` vid `n < 100`. Grafen sätter en diskret markör
efter värdet och en förklarande rad i fotnoten.

**Flyttalsartefakter.** Celler som är exakt 100 % ligger i arket som
`1.0000000000000002`. De klipps till `1` inom flyttalsfelets storlek och
räknas i loggen. Allt utanför den marginalen stoppar bygget i valideringen.

**En fråga, flera tabeller.** Bilagan splittrar samma fråga på tre sätt, och
alla tre är filter inuti frågan snarare än olika frågor:

- **Bas.** "Hur ofta använder du internet?" finns på `Samtliga 16+ år`, `-64 år`
  och `65+ år`. Det är åldersfilter.
- **Frekvens.** "Vilka sociala medier har du använt minst någon gång / minst
  varje vecka / dagligen" är tre tabeller men en fråga om hur ofta.
- **Netto mot detalj.** AI-verktygsfrågan finns som en Netto-tabell och en
  detaljerad tabell på samma bas med samma n. De slås ihop till en alternativlista.

`src/lib/groups.ts` grupperar 101 tabeller till 64 frågor. Grupperingen sker i
presentationslagret, inte i parsern: datasetet speglar arket troget, en post per
tabell, så att stickprovet mot cellerna fortsätter gälla. Sammanslagning av
alternativ sker bara när bas OCH n är identiska.

Basen blir därmed ett synligt val i gränssnittet i stället för något som
avgörs av var i träfflistan man råkar klicka. Det gör bas-fällan svårare att
gå i, inte lättare.

**Frågetexter som inte står på egna ben.** 23 frågor heter bara ett
plattformsnamn (`Youtube`, `Tiktok`), sex heter `Har du tidigare använt …?` där
bara basen skiljer, och tre heter `Vilka har du använt dagligen?` utan att säga
vad. `src/data/titles.json` ger varje fråga en kort titel att söka och skumma
på. Titeln ersätter aldrig formuleringen — träfflistan visar båda, och
svarskortet visar formuleringen ordagrant.

**Identisk frågetext och identisk bas.** Fem frågor är olika tabeller trots
samma text och samma bas — typiskt en Netto-sammanställning och en detaljerad
uppdelning. De skiljs bara åt av svarsalternativen, så träfflistan visar en
alternativrad för just dem, och frågelagret får veta att de finns.

Signifikansmarkörerna (`Kolumn% Chi2`) parsas ut till `sig[]` i stället för att
kastas. De visas inte i gränssnittet ännu.

---

## Årgångar

Varje årgång är en egen fil och en egen, orörd spegling av sin tabellbilaga.
De blandas aldrig: en fråga hör till ett år, och ett svar hämtas alltid ur det
år användaren valt. Årsväljaren står överst, och ett årsbyte nollställer hela
urvalet — ett fråge-id, en bas och ett segment hör till sin årgång, och att
bära över dem hade tyst kunnat visa fel års siffra.

| Årgång | Frågetabeller | Frågor efter klustring | Segment |
| --- | --- | --- | --- |
| 2025 | 101 | 41 | 168 |
| 2026 | 84 | 51 | 165 |

Raden med ovägda intervjuer heter olika mellan åren — 2025 skriver
`Antal intervjuer`, 2026 skriver `Antal oviktade intervjuer`. Parsern känner
igen båda. Utan det hade hela 2026 tyst fallit tillbaka på viktade tal.

### Begrepp: ryggraden i det redaktionella lagret

`src/data/concepts.json` är en post per sak undersökningen mäter: titel,
synonymer och frågans exakta lydelse **per årgång**. Titlar och sökord hängde
tidigare på exakt frågetext och tappades vid varje omskrivning; nu hänger de på
begreppet. Filen ersätter `titles.json` och `synonyms.json`, och `clusters.json`
pekar numera på begrepps-id i stället för frågetexter.

```bash
npm run seed-concepts -- --force   # räkna om kopplingarna, behåll titlar och sökord
npm run link-concepts              # lista förslagen
npm run link-concepts -- ja 1 2 3  # bekräfta
npm run link-concepts -- nej 4     # markera som utan motsvarighet
npm run check-links                # granska alla kopplingar mot svarsalternativen
```

**Automatiken kopplar aldrig ihop årgångar på egen hand.** Den föreslår; en
människa bekräftar. Skälet står nedan.

### Jämförelser mellan år är ännu inte byggda

Och de får inte byggas på textmatchning. **Bara 31 av ~70 frågeformuleringar är
identiska mellan 2025 och 2026** — Internetstiftelsen skriver om frågorna
mellan årgångarna. `Har du minst någon gång under de senaste 12 månaderna
använt någon av följande e-legitimationer?` blev `Har du under de senaste 12
månaderna använt någon av följande e-legitimationer?`, och `minst varje vecka`
blev `varje vecka`.

En automatisk matchning skulle alltså missa mer än hälften, och — värre — råka
para ihop frågor som bara liknar varandra. En felaktig trendlinje är exakt den
sortens fel verktyget finns för att förhindra.

Tre konkreta fall ur 2026 års inläsning, alla fångade:

- Textlikhet 0.82 parade ihop `play- och strömmande tjänster ... dagligen` (2025)
  med `appar och tjänster ... dagligen` (2026). Den senare handlar om
  meddelandeappar.
- **Identisk frågetext räcker inte.** `Vilka har du använt dagligen?` står
  ordagrant i båda årgångarna, men gäller meddelandeappar 2025 och AI-tjänster
  2026.
- Av samma skäl fick en 2026-fråga om AI-tjänster rubriken
  `Meddelandeappar – dagligen`, eftersom titeln ärvdes via identisk text.

Därför krävs **överlappande svarsalternativ** för varje koppling, både när
seedern föreslår och i `npm run check-links`. Frågetexten avgör aldrig ensam,
och titlar nycklas på år och text tillsammans.

## Ämnen och exempel

`src/data/topics.json` följer rapportens egna fem kapitel — Användning av
internet och e-tjänster, AI, Sociala medier, Annonsbedrägerier, Dejting och
relationer — så att den som läst rapporten känner igen sig. Ämnen med
`chapter: null` finns i tabellbilagan men saknar eget kapitel i rapporten:
e-handel, play och strömmat, betalappar, kryptovaluta, arbetsliv. Det är där
verktyget ger mest, eftersom siffrorna finns men ingen har skrivit om dem.

`src/data/examples.json` innehåller exempelfrågor hämtade ordagrant ur
rapportens avsnittsrubriker. De är skrivna av Internetstiftelsen själva och
visar hur de formulerar sig om sitt material.

Båda filerna är handskrivna och redigerbara. De styr bara vägen fram till en
fråga och påverkar aldrig vilket värde som slås upp.

## Arkitektur

```
scripts/parse.ts       xlsx -> src/data/dataset.json     (fas 1)
scripts/validate.ts    hårda fel + rimlighetsrapport     (fas 1)
scripts/spotcheck.ts   cellens adress i arket            (fas 1)
src/lib/search.ts      deterministisk sökning            (fas 2)
src/lib/query.ts       fråga -> siffra, utan modell      (fas 2)
api/ask.ts             fråga -> query, med modell        (fas 3)
src/lib/export.ts      PNG och SVG ur samma nod          (fas 4)
```

Parsern är idempotent — stabil nyckelsortering, verifierad med sha256 över två
körningar. Segmentgrupperna läses ur arket via forward-fill av grupprubrikerna,
de är inte hårdkodade.

### Kluster och synonymer

`src/data/clusters.json` slår ihop frågor som är samma fråga ställd om olika
saker. Bilagan frågar om 22 plattformar — Youtube, Facebook, Tiktok, WhatsApp
och 18 till — med identisk alternativlista och identisk bas. Som 22 poster i en
lista är det brus; som en post med plattform som väljare är det en fråga.
Detsamma gäller E-legitimation och Meddelandeappar, som låg som två poster var
för att frekvensfrasen är formulerad olika. **64 poster blir 41.**

`src/data/synonyms.json` innehåller sökord som aldrig visas. Journalister söker
på vardagsspråk och undersökningen är skriven på utredningsspråk: ingen skriver
"mikrootrohet" i ett sökfält, men många skriver "svartsjuka". Även "streaming",
"tinder", "bankid", "kivra", "scam", "stalka", "distansarbete" och "influencer"
leder rätt.

Båda filerna ändrar bara vägen fram till en fråga. Frågans formulering är
Internetstiftelsens och visas ordagrant på svarskortet som vanligt.

### Det stora talet

Det stora talet visas bara när urvalet ger **ett** tal:

| Urval | Stort tal |
| --- | --- |
| Ett alternativ, ett segment | Den cellen, märkt `INSTAGRAM · GEN Z 1997-2009` |
| Ett alternativ, flera eller alla segment | Alternativets total, märkt `INSTAGRAM · TOTALT` |
| Flera alternativ | Inget — kortet går direkt till serierna |

Skälet: med tre valda alternativ och två valda segment hörde totalen för det
första alternativet inte ihop med något annat på kortet, men stod i 72 punkter
och lästes som svaret. Ett godtyckligt utvalt värde i den storleken är
missvisande även när det är korrekt hämtat. Suffixet `· TOTALT` finns av samma
skäl: utan det gick det inte att se att talet var frågans total och inte det
filtrerade urvalets.

### Väljarnas utgångsläge

Det alternativ som råkar stå först i tabellbilagan är aldrig ett vettigt
förval. "Youtube" som svar på *Hur många gör egna inlägg på sociala medier?*
säger mer om arkets sortering än om vad användaren frågade.

| Läge | Förval |
| --- | --- |
| Ingen nedbrytning | **Alla svarsalternativ** jämförs med varandra |
| Nedbrutet på segment | Frågans **Netto-rad**, bilagans egen sammanfattning |

Med en nedbrytning går "alla" inte att visa — tjugo alternativ gånger tio
segment är tvåhundra staplar — så där måste minst ett alternativ vara valt,
och `Alla`-knappen erbjuds inte.

Valda piller ligger på egen rad överst, ovalda under en hårfin linje. Med
tjugo alternativ i en klump gick det annars inte att se vad som var påslaget
utan att läsa varje piller, och det är just det valet som avgör vad grafen
visar. Enkelvalsväljare behåller en rad — där syns det ändå.

### Exempelfrågor filtreras till årgången

Rubrikerna kommer ur 2025 års rapport, och flera av frågorna finns inte 2026.
Ett exempel som leder till fel fråga är värre än inget exempel: användaren tror
att hen fått svar på det hen frågade. Exemplen visas bara i de årgångar där
frågan faktiskt går att besvara.

Av samma skäl märks svaga sökträffar ut. Rätt fråga landar normalt på 0.6–1.5 i
sökpoäng; *Hur många gör egna inlägg på sociala medier?* mot 2026 — där frågan
inte finns — gav 0.33 på något orelaterat. Under 0.5 står det numera att ingen
tydlig träff finns, och listan presenteras som det närmaste i stället för som
svar.

### Flerval

Grafen tar flera svarsalternativ och flera segment samtidigt. Väljer man Tiktok
och Snapchat blir varje alternativ en **serie** med egen färg, och varje serie
har en rad per valt segment. Serierubriken med färgprick står intill sina egna
staplar i stället för i en legend i ett hörn — designen tillåter ingen legend,
och en rubrik på plats är ändå lättare att läsa.

Segment väljs inom en grupp: `KÖN` och sedan bara `Man`, eller `GEN (XYZ)` och
sedan `Gen Z` och `Millenials` men inte `Baby Boomers`. Tom markering betyder
alla segment i gruppen.

Segmentgruppen är en kompakt lista, inte piller: bilagan har 39 grupper, och
som piller blir det sex rader som fyller halva skärmen innan man sett ett svar.

Frågelagret returnerar `segments` tillsammans med `options`, så att
"användning av tiktok och snapchat hos gen Z vs millennials" går hela vägen
i ett anrop. Etiketter modellen hittar på faller bort i klientens validering
och kvar blir hela gruppen.

### Signaturen

Svarskortet är **en enda SVG**, inte HTML med en graf inuti. Exporten
serialiserar exakt den nod som ligger på skärmen. Det finns ingen exportmall och
ingen möjlig skillnad mellan förhandsvisning och fil — siffran kan inte lämna
appen utan sin bas och sin källa.

---

## Avvikelser från briefen

**Recharts används inte.** Briefens motivering till Recharts är att det är
SVG-baserat och lätt att serialisera. Ett handskrivet SVG-kort ger den
serialiserbarheten direkt och gör dessutom att kortet *är* samma nod som
exporten — vilket är själva signaturkravet. Grafen har varken axlar, rutnät,
legend eller tooltip, så det Recharts tillför hade behövt monteras bort igen.
Paketet är avinstallerat. Säg till om du ändå vill ha det.

**"62 %", inte "62%".** Svenskt mellanslag före procenttecken, enligt TT. Det
som exporteras hamnar i en artikel. Briefens layoutskiss skriver `62%`; säg till
om skissen ska gälla ordagrant.

**Skalan i grafen är alltid 0–100 %.** Utan axel och stödlinjer måste stapelns
längd gå att läsa mot hela spåret. Skalning mot högsta värdet hade gjort en
42-procentare fullängds i en artikel.

**Palettens hexvärden är briefens, oförändrade.** De är samplade ur rapporten
och ska verifieras mot Internetstiftelsens grafiska manual innan de kallas
korrekta. Det är inte gjort.

---

## Typsnitt

```bash
npm run fonts
```

Hämtar Instrument Sans och IBM Plex Mono till `public/fonts/`. Behövs på två
ställen: appen serverar dem lokalt, och exporten bäddar in dem som base64 (en
fristående SVG- eller PNG-fil renderas utan tillgång till sidans typsnitt).

Appen hämtar dem alltså **inte** från Google Fonts vid sidladdning. Ett
`<link>` till fonts.googleapis.com i `<head>` blockerar renderingen: på ett nät
där domänen är långsam eller blockerad stod sidan still i 13 sekunder mot 0,3
med lokala filer. Saknas filerna faller webbläsaren tillbaka på systemtypsnitt
direkt, utan att vänta.

`public/fonts/` är tom i repot — byggmiljön nådde inte Google Fonts.

## Prestanda

Mätt mot produktionsbygget: 310 ms till interaktiv sida, 110 ms från fråga till
svarskort. Bundlen är 7,4 MB (1,0 MB gzippad), varav nästan allt är datasetet.
Blir det ett problem är nästa steg att flytta `dataset.json` till `public/` och
hämta den vid körning i stället för att bunta in den.

---

## Deploy

Vercel, ej indexerad. `vercel.json` sätter `X-Robots-Tag: noindex` och
`index.html` har motsvarande meta-tagg.

```bash
npm i -g vercel
vercel link
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

Nyckeln läses bara av `api/ask.ts`. Utan den svarar `/api/ask` med 501 och
appen faller tillbaka på den deterministiska sökningen med en notis i
gränssnittet — allt utom frågelagret fungerar.

### Frågelagret ser aldrig ett värde, strukturellt

`api/ask.ts` importerar `src/data/index-<år>.json`, inte datasetet. Indexfilen
innehåller id, frågetext, bas, segmentgrupper och svarsalternativens etiketter
— och ingenting annat. 27 MB blir 343 kB, men det viktiga är att värdena inte
finns i den modul språkmodellen körs ifrån. Det går inte att läcka en siffra
som inte är där. Filerna byggs av `scripts/build-index.ts` före varje bygge.

### Typsnitten ligger i repot

`public/fonts/` är versionshanterad, så bygget är oberoende av nätverket.
`npm run fonts` hämtar bara det som saknas; `-- --force` hämtar om allt.
Utan typsnitt faller appen tillbaka på systemtypsnitt — fult men fungerande,
och `prebuild` fäller aldrig ett bygge på en misslyckad hämtning.

### Handlern tar emot båda anropsformerna

Vercel anropar funktioner i `api/` antingen med webbstandardens `Request` eller
med Nodes `(req, res)`, beroende på runtime och projektversion. Fel gissning
ger 500 i produktion utan att något syns i dev, så handlern svarar i båda
formerna. Verktyget är användbart även då.

---

## Utanför scope

Andra årgångar än 2025, `Internetpenetrationstudie`-bladet, inloggning, sparade
sökningar, jämförelser över tid. Detta är en privat prototyp, inte en publik
tjänst under Internetstiftelsens varumärke.
