# Fråga Svenskarna

Prototyp byggd på Internetstiftelsens *Svenskarna och internet 2025*.

Rapporten på 264 sidor visar nästan uteslutande totalsiffran. Tabellbilagan har
varje fråga nedbruten på 168 segment men är ett banner-ark på över tusen rader.
Det här verktyget gör den bilagan användbar: en journalist skriver en fråga på
svenska och får rätt andel, rätt bas, antal intervjuer, frågans exakta
formulering, källhänvisning och en nedladdningsbar graf.

---

## Läget just nu

Fas 1–4 är byggda och verifierade. **Men den riktiga tabellbilagan finns inte i
repot** — den låg inte i miljön och gick inte att hämta.

Allt är därför verifierat mot `data/fixture-tabellbilaga.xlsx`, ett ark som
återskapar arkstrukturen exakt men har påhittade värden. Fixturen innehåller
alla fyra fällorna med flit, så parsern har fått hantera dem på riktigt.

**Så här kör du på den riktiga filen:**

```bash
npm install
cp ~/Downloads/tabellbilaga-svenskarna-och-internet-2025.xlsx data/
npm run parse -- data/tabellbilaga-svenskarna-och-internet-2025.xlsx
npm run validate
npm run spotcheck -- data/tabellbilaga-svenskarna-och-internet-2025.xlsx
npm run dev
```

Parsern skriver `src/data/dataset.json`, som resten av appen läser. Fixturen
behövs inte efter det.

Två saker att räkna med vid första körningen mot skarp fil: parsern är skriven
mot arkstrukturen som den beskrivs i briefen, inte mot filen själv, så det kan
finnas avvikelser den behöver justeras för. Den gissar aldrig — den hoppar över
och loggar. **Läs `data/parse-log.txt` innan du litar på JSON:en.** Är antalet
frågetabeller inte 7 respektive 91 står svaret i loggen.

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

**Viktade baser.** Bilagan är inte konsekvent: en del tabeller har både
`Antal intervjuer` och `Antal viktade intervjuer`, andra bara den viktade raden.
Saknas den ovägda raden används det viktade talet som bas, och `n_basis` sätts
till `viktade_intervjuer`. Då står det `VIKTADE INTERVJUER = 2 920` i fotnoten i
stället för `N = 2 806` — ett viktat tal är inte ett antal genomförda intervjuer
och får inte presenteras som ett. Valideringen räknar hur många frågor det
gäller, och parsern loggar varje sådan tabell.

**Små baser.** `reliable: false` vid `n < 100`. Grafen sätter en diskret markör
efter värdet och en förklarande rad i fotnoten.

Signifikansmarkörerna (`Kolumn% Chi2`) parsas ut till `sig[]` i stället för att
kastas. De visas inte i gränssnittet ännu.

---

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

## Typsnitt och export

Appen laddar Instrument Sans och IBM Plex Mono från Google Fonts. En fristående
SVG- eller PNG-fil renderas däremot utan tillgång till sidans typsnitt, så
exporten bäddar in dem som base64 när de finns i `public/fonts/`:

```bash
npm run fonts
```

Utan det fungerar exporten men faller tillbaka på systemtypsnitt. `public/fonts/`
är tom i repot — nätverket i byggmiljön nådde inte Google Fonts.

---

## Deploy

Vercel, ej indexerad. `vercel.json` sätter `X-Robots-Tag: noindex` och
`index.html` har motsvarande meta-tagg. Sätt `ANTHROPIC_API_KEY` som
miljövariabel i projektet — den läses bara av `api/ask.ts`.

Utan nyckel svarar `/api/ask` med 501 och appen faller tillbaka på fas 2 med en
notis i gränssnittet. Verktyget är användbart även då.

---

## Utanför scope

Andra årgångar än 2025, `Internetpenetrationstudie`-bladet, inloggning, sparade
sökningar, jämförelser över tid. Detta är en privat prototyp, inte en publik
tjänst under Internetstiftelsens varumärke.
