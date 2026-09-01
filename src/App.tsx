import { useMemo, useRef, useState } from 'react';
import { dataset, TOTAL_GROUP } from './lib/dataset';
import { bestOption, bestSegmentGroup, nearestQuestions, searchQuestions } from './lib/search';
import { availableSegments, executeQuery } from './lib/query';
import { askModel, AskUnavailable } from './lib/ask';
import { exportFilename, exportPng, exportSvg } from './lib/export';
import { allGroups, groupOf, resolve, selectionFor, type QuestionGroup } from './lib/groups';
import { examplesFor, questionsInTopic } from './lib/labels';
import { SearchField } from './components/SearchField';
import { Hits } from './components/Hits';
import { Pills } from './components/Pills';
import { GroupSelect } from './components/GroupSelect';
import { NoMatch } from './components/NoMatch';
import { AnswerCard } from './components/AnswerCard';
import { Topics } from './components/Topics';

type View =
  | { kind: 'idle' }
  | { kind: 'selected'; groupId: string }
  | { kind: 'no_match'; query: string; suggestions: QuestionGroup[] };

/** Träffar är frågor, inte tabeller. Flera tabeller i samma grupp blir en rad. */
function toGroups(questions: { id: string }[]): QuestionGroup[] {
  const out: QuestionGroup[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    const g = groupOf(q.id);
    if (!g || seen.has(g.id)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}

export function App() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [topic, setTopic] = useState<string | null>(null);

  // Val inom den valda frågan. Bas och frekvens pekar ut vilken tabell i
  // bilagan som slås upp; alternativ och segmentgrupp styr vad kortet visar.
  const [base, setBase] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string | null>(null);
  // Flerval. Tom lista betyder alla — så att man kan jämföra Tiktok och
  // Snapchat, eller Gen Z och millennials, utan att först behöva välja bort.
  const [options, setOptions] = useState<string[]>([]);
  const [segmentGroup, setSegmentGroup] = useState<string>(TOTAL_GROUP);
  const [segments, setSegments] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRef = useRef<SVGSVGElement>(null);

  // Fas 2: sökningen är helt deterministisk och gör inga API-anrop.
  const hits = useMemo(() => {
    if (view.kind === 'selected') return [];
    if (query.trim().length >= 2) return toGroups(searchQuestions(query, 12).map((h) => h.question));
    return topic ? toGroups(questionsInTopic(topic)) : [];
  }, [query, view.kind, topic]);

  const group = view.kind === 'selected' ? allGroups().find((g) => g.id === view.groupId) : undefined;

  const answer = useMemo(() => {
    if (!group) return null;
    const question = resolve(group, { base, frequency });
    return executeQuery({
      questionId: question.id,
      optionLabels: options,
      segmentGroup,
      segmentIds: segments,
      question,
    });
  }, [group, base, frequency, options, segmentGroup, segments]);

  /** Öppnar en fråga och sätter val ur användarens egen text. */
  function select(
    g: QuestionGroup,
    sourceText = query,
    from?: { questionId?: string; options?: string[]; group?: string | null; segments?: string[] },
  ) {
    const sel = from?.questionId ? selectionFor(from.questionId) : {};
    const nextBase = sel.base ?? g.bases[0];
    const nextFreq = sel.frequency ?? (g.frequencies[0] ?? null);
    setBase(nextBase);
    setFrequency(nextFreq);

    const question = resolve(g, { base: nextBase, frequency: nextFreq });

    const guessed = bestOption(question, sourceText);
    setOptions(from?.options?.length ? from.options : guessed ? [guessed] : [question.options[0].label]);

    const sg = from?.group ?? bestSegmentGroup(question, sourceText);
    const nextGroup = sg && question.segment_groups.includes(sg) ? sg : TOTAL_GROUP;
    setSegmentGroup(nextGroup);

    const wanted = from?.segments ?? [];
    const available = availableSegments(question, nextGroup);
    setSegments(wanted.filter((id) => available.some((s) => s.id === id)));

    setView({ kind: 'selected', groupId: g.id });
  }

  // Fas 3: modellen översätter frågan till en query. Den ser aldrig ett värde.
  async function ask() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setNotice(null);
    try {
      const spec = await askModel(q);
      // Ingen match eller låg tillförsikt: visa de tre närmaste, gissa aldrig.
      if (spec.no_match || spec.confidence === 'low' || !spec.question_id) {
        setView({ kind: 'no_match', query: q, suggestions: toGroups(nearestQuestions(q)) });
        return;
      }
      const g = groupOf(spec.question_id);
      if (!g) {
        setView({ kind: 'no_match', query: q, suggestions: toGroups(nearestQuestions(q)) });
        return;
      }
      // Modellens val av bas och frekvens följer med via fråge-id:t.
      select(g, q, {
        questionId: spec.question_id,
        options: spec.options,
        group: spec.segment_group,
        segments: spec.segments,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // Utan frågelager faller appen tillbaka på fas 2. Verktyget är användbart ändå.
      setNotice(
        e instanceof AskUnavailable
          ? `${e.message} Visar sökträffar i stället.`
          : 'Något gick fel i frågelagret. Visar sökträffar i stället.',
      );
      setView({ kind: 'idle' });
    } finally {
      setBusy(false);
    }
  }

  function reset(next: string) {
    setQuery(next);
    setNotice(null);
    if (next.trim()) setTopic(null);
    if (view.kind !== 'idle') setView({ kind: 'idle' });
  }

  function chooseTopic(id: string | null) {
    setTopic(id);
    setQuery('');
    setNotice(null);
    setView({ kind: 'idle' });
  }

  async function download(kind: 'png' | 'svg') {
    if (!cardRef.current || !answer) return;
    const name = exportFilename(answer.question.id, answer.selectedOptions.join('-'), answer.segmentGroup);
    try {
      if (kind === 'png') await exportPng(cardRef.current, name);
      else await exportSvg(cardRef.current, name);
    } catch (e) {
      setNotice(`Exporten misslyckades: ${(e as Error).message}`);
    }
  }

  const segmentGroups = answer
    ? [TOTAL_GROUP, ...answer.question.segment_groups.filter((g) => g !== TOTAL_GROUP)]
    : [];
  const segmentOptions = answer ? availableSegments(answer.question, answer.segmentGroup) : [];

  return (
    <main className="page">
      <p className="masthead">Fråga Svenskarna · {dataset.meta.source}</p>

      <SearchField
        value={query}
        onChange={reset}
        onSubmit={ask}
        busy={busy}
        canSubmit={query.trim().length > 1}
      />

      {notice && <p className="error" role="status">{notice}</p>}

      {view.kind !== 'selected' && !query.trim() && (
        <section className="empty">
          <p>
            {allGroups().length} frågor ur {dataset.meta.source}, nedbrutna på{' '}
            {dataset.segments.length} segment. Skriv en fråga, eller välj ett ämne.
          </p>
          <Topics active={topic} onSelect={chooseTopic} />

          {/* Rapportens egna avsnittsrubriker. Det är så Internetstiftelsen
              formulerar sig om materialet, och ungefär så en journalist
              skulle söka i det. */}
          <ul className="empty__examples">
            {examplesFor(topic).map((e) => (
              <li key={e.text}>
                <button type="button" className="empty__example" onClick={() => reset(e.text)}>
                  {e.text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.kind !== 'selected' && (
        <Hits groups={hits} activeId={null} onSelect={(g) => select(g)} label="Frågor i undersökningen" />
      )}

      {view.kind === 'no_match' && (
        <NoMatch query={view.query} suggestions={view.suggestions} onSelect={(g) => select(g, view.query)} />
      )}

      {answer && group && (
        <>
          {/* Bas och frekvens pekar ut vilken tabell som slås upp. Basen är
              inte en detalj: samma fråga på olika baser ger olika andelar. */}
          <Pills
            ariaLabel="Bas"
            items={group.bases.map((b) => ({ id: b, label: b }))}
            selected={[base ?? group.bases[0]]}
            onChange={(next) => setBase(next[0] ?? null)}
            maxVisible={6}
          />
          <Pills
            ariaLabel="Hur ofta"
            items={group.frequencies.map((f) => ({ id: f, label: f }))}
            selected={frequency ? [frequency] : []}
            onChange={(next) => setFrequency(next[0] ?? null)}
          />

          <GroupSelect
            groups={segmentGroups}
            active={answer.segmentGroup}
            onSelect={(g) => { setSegmentGroup(g); setSegments([]); }}
            totalLabel="Ingen — visa totalt"
          />

          <Pills
            ariaLabel="Svarsalternativ"
            items={answer.optionLabels.map((l) => ({ id: l, label: l }))}
            selected={answer.selectedOptions}
            onChange={(next) => setOptions(next.length ? next : [answer.optionLabels[0]])}
            multi
            maxVisible={6}
          />

          {segmentOptions.length > 0 && (
            <Pills
              ariaLabel="Segment"
              items={segmentOptions.map((s) => ({ id: s.id, label: s.label }))}
              selected={segments}
              onChange={setSegments}
              multi
              allLabel="Alla"
              maxVisible={10}
            />
          )}

          <div className="card-wrap">
            {/* Samma nod renderas på skärmen och serialiseras vid export. */}
            <AnswerCard ref={cardRef} answer={answer} />
            <div className="card-actions">
              <button type="button" className="button" onClick={() => download('png')}>Ladda ner PNG</button>
              <button type="button" className="button" onClick={() => download('svg')}>Ladda ner SVG</button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
