/**
 * Fas 3 — Frågelagret.
 *
 * Det här är den enda plats i systemet där en språkmodell är inblandad, och
 * dess roll är strikt avgränsad: den översätter användarens fråga på svenska
 * till en strukturerad query. Den svarar aldrig på frågan.
 *
 * Modellen får se frågeindexet — id, frågetext, bas, segmentgrupper och
 * svarsalternativ. Den ser aldrig ett enda värde ur datasetet. Uppslagningen
 * görs deterministiskt i appen efteråt. Inget tal passerar någonsin genom
 * modellens textgenerering.
 *
 * API-nyckeln finns bara här, aldrig i klienten.
 */
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import dataset from '../src/data/dataset.json' with { type: 'json' };
import type { Dataset } from '../src/types';

export const config = { runtime: 'nodejs' };

const data = dataset as unknown as Dataset;

/** Exakt det modellen får se. Inga värden, inga n, inga andelar. */
const questionIndex = data.questions.map((q) => ({
  id: q.id,
  fraga: q.text,
  bas: q.base_label,
  segmentgrupper: q.segment_groups,
  svarsalternativ: q.options.map((o) => o.label),
}));

const QUESTION_IDS = data.questions.map((q) => q.id);
const SEGMENT_GROUPS = [...new Set(data.segments.map((s) => s.group))];

/** Segmentetiketter per grupp, så att modellen kan peka ut enskilda segment. */
const SEGMENTS_BY_GROUP: Record<string, string[]> = {};
for (const s of data.segments) {
  (SEGMENTS_BY_GROUP[s.group] ??= []).push(s.label);
}

/**
 * Strukturerad output med enum över faktiska id:n. Modellen kan alltså inte
 * hitta på ett fråge-id ens om den vill — schemat tillåter bara de som finns.
 */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    question_id: {
      anyOf: [{ type: 'string', enum: QUESTION_IDS }, { type: 'null' }],
      description: 'Id för den fråga i undersökningen som bäst matchar. null om ingen matchar.',
    },
    segment_group: {
      anyOf: [{ type: 'string', enum: SEGMENT_GROUPS }, { type: 'null' }],
      description: 'Segmentgrupp att bryta ner på. null om användaren inte bett om en nedbrytning.',
    },
    segments: {
      type: 'array',
      items: { type: 'string' },
      description: 'Enskilda segment inom segment_group, ordagrant som etiketterna står i segmentlistan. Tom lista betyder alla segment i gruppen.',
    },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'Svarsalternativ som frågan gäller, ordagrant som de står i frågans lista. Flera är tillåtna. Tom lista om inget särskilt alternativ efterfrågas.',
    },
    confidence: { type: 'string', enum: ['high', 'low'] },
    no_match: { type: 'boolean' },
  },
  required: ['question_id', 'segment_group', 'segments', 'options', 'confidence', 'no_match'],
  additionalProperties: false,
} as const;

const SYSTEM = `Du är ett översättningslager i ett verktyg för journalister som slår upp siffror i undersökningen "${data.meta.source}" från ${data.meta.publisher}.

Din enda uppgift är att översätta användarens fråga till en query mot ett färdigt dataset. Du svarar aldrig på själva frågan. Du skriver aldrig ut någon siffra, andel eller procentsats — du har inte tillgång till värdena, och du ska inte gissa dem.

Du får ett index över undersökningens frågor. För varje fråga finns:
- id
- den exakta frågetexten
- basen (vilken population frågan ställdes till)
- vilka segmentgrupper frågan är nedbruten på
- vilka svarsalternativ frågan har

Regler:

1. Välj den fråga vars faktiska formulering svarar på det användaren undrar. Räcker det inte, sätt no_match: true.

2. Basen är avgörande. Samma frågetext förekommer med olika baser, och andelarna skiljer sig kraftigt. Nämner användaren en population (till exempel "av alla svenskar" eller "av dem som använder AI"), välj den fråga vars bas motsvarar det. Är det oklart vilken bas som avses, välj den bredaste basen och sätt confidence: "low".

3. segment_group sätts bara när användaren faktiskt frågar efter en nedbrytning. "Hur många 00-talister..." betyder GENERATION. "Skiljer det mellan män och kvinnor" betyder KÖN. Frågar användaren efter totalen, lämna segment_group som null. Gruppen måste finnas i den valda frågans segmentgrupper.

4. segments används när användaren pekar ut vissa segment i stället för hela gruppen. "Gen Z vs millennials" betyder gruppen GEN (XYZ) och just de två segmenten. "Bara män" betyder gruppen KÖN och segmentet Man. Etiketterna måste stå ordagrant som i segmentlistan nedan. Vill användaren se hela gruppen, lämna segments tom.

5. options ska innehålla svarsalternativens etiketter ordagrant som de står i frågans lista. Flera är tillåtna: "tiktok och snapchat" ger båda. Hitta aldrig på ett alternativ.

6. Indexet innehåller frågor med identisk frågetext OCH identisk bas som ändå är olika tabeller — typiskt en Netto-sammanställning ("Netto – Har använt AI-verktyg") och en detaljerad uppdelning ("Ja, ChatGPT", "Ja, Copilot", ...). De skiljs bara åt av svarsalternativen. Välj den vars svarsalternativ faktiskt innehåller det användaren frågar om. Frågar användaren om ett namngivet verktyg, välj den detaljerade. Frågar användaren om hur många som över huvud taget gjort något, välj Netto-tabellen.

7. confidence: "high" bara när du är säker på både fråga och bas. Vid minsta tvekan: "low". Låg confidence gör att appen visar förslag i stället för ett svar, vilket är rätt utfall när du är osäker.

8. no_match: true när undersökningen helt enkelt inte mätt det användaren frågar om. Det är ett korrekt och önskvärt svar. Att välja en fråga som ligger ungefär rätt är värre än att säga att vi inte mätt det.

Segment per grupp:
${JSON.stringify(SEGMENTS_BY_GROUP, null, 1)}

Frågeindex:
${JSON.stringify(questionIndex, null, 1)}`;

const client = new Anthropic();

interface AskBody { question?: unknown; }

export default async function handler(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  // Utan nyckel är fas 3 avstängd. Appen faller tillbaka på fas 2 och säger till.
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY saknas.' }, 501);
  }

  let body: AskBody;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return json({ error: 'Ogiltig JSON.' }, 400);
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return json({ error: 'Fältet question saknas.' }, 400);
  if (question.length > 500) return json({ error: 'Frågan är för lång.' }, 400);

  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 2000,
      output_config: { format: jsonSchemaOutputFormat(OUTPUT_SCHEMA) },
      // Indexet är identiskt mellan anrop, så det cachas.
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: question }],
    });

    const parsed = response.parsed_output;
    if (!parsed) return json({ error: 'Modellen gav inget giltigt svar.' }, 502);

    // Sista kontrollen sker ändå i klienten mot det faktiska datasetet.
    return json({
      question_id: parsed.question_id ?? null,
      segment_group: parsed.segment_group ?? null,
      segments: Array.isArray(parsed.segments) ? parsed.segments : [],
      options: Array.isArray(parsed.options) ? parsed.options : [],
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
      no_match: parsed.no_match === true,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'För många anrop just nu.' }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'Ogiltig API-nyckel.' }, 502);
    if (err instanceof Anthropic.APIError) return json({ error: `Modellen svarade ${err.status}.` }, 502);
    return json({ error: 'Okänt fel i frågelagret.' }, 500);
  }
}
