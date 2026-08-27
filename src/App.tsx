import { useMemo, useRef, useState } from 'react';
import type { Question } from './types';
import { dataset, TOTAL_GROUP } from './lib/dataset';
import { bestOption, bestSegmentGroup, nearestQuestions, searchQuestions } from './lib/search';
import { executeQuery } from './lib/query';
import { askModel, AskUnavailable } from './lib/ask';
import { exportFilename, exportPng, exportSvg } from './lib/export';
import { SearchField } from './components/SearchField';
import { Hits } from './components/Hits';
import { Pills } from './components/Pills';
import { NoMatch } from './components/NoMatch';
import { AnswerCard } from './components/AnswerCard';

type View =
  | { kind: 'idle' }
  | { kind: 'selected'; questionId: string }
  | { kind: 'no_match'; query: string; suggestions: Question[] };

const EXAMPLES = dataset.questions.slice(0, 3).map((q) => q.text);

export function App() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [option, setOption] = useState<string | null>(null);
  const [group, setGroup] = useState<string>(TOTAL_GROUP);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRef = useRef<SVGSVGElement>(null);

  // Fas 2: sökningen är helt deterministisk och gör inga API-anrop.
  const hits = useMemo(
    () => (view.kind === 'selected' || query.trim().length < 2 ? [] : searchQuestions(query, 6).map((h) => h.question)),
    [query, view.kind],
  );

  const answer = useMemo(
    () => (view.kind === 'selected'
      ? executeQuery({ questionId: view.questionId, optionLabel: option, segmentGroup: group })
      : null),
    [view, option, group],
  );

  /** Väljer en fråga och sätter alternativ och segmentgrupp ur användarens egen text. */
  function select(q: Question, sourceText = query, spec?: { option?: string | null; group?: string | null }) {
    setOption(spec?.option ?? bestOption(q, sourceText) ?? q.options[0].label);
    const g = spec?.group ?? bestSegmentGroup(q, sourceText);
    setGroup(g && q.segment_groups.includes(g) ? g : TOTAL_GROUP);
    setView({ kind: 'selected', questionId: q.id });
  }

  // Fas 3: modellen översätter frågan till en query. Den ser aldrig ett värde.
  async function ask() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setNotice(null);
    try {
      const spec = await askModel(q);
      // Ingen match eller låg tillförsikt: visa de tre närmaste frågorna, gissa aldrig.
      if (spec.no_match || spec.confidence === 'low' || !spec.question_id) {
        setView({ kind: 'no_match', query: q, suggestions: nearestQuestions(q) });
        return;
      }
      const question = dataset.questions.find((x) => x.id === spec.question_id)!;
      select(question, q, { option: spec.options[0] ?? null, group: spec.segment_group });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // Utan frågelager faller appen tillbaka på fas 2. Verktyget är användbart ändå.
      const local = searchQuestions(q, 6).map((h) => h.question);
      setNotice(
        e instanceof AskUnavailable
          ? `${e.message} Visar sökträffar i stället.`
          : 'Något gick fel i frågelagret. Visar sökträffar i stället.',
      );
      setView(local.length ? { kind: 'idle' } : { kind: 'no_match', query: q, suggestions: [] });
    } finally {
      setBusy(false);
    }
  }

  function reset(next: string) {
    setQuery(next);
    setNotice(null);
    if (view.kind !== 'idle') setView({ kind: 'idle' });
  }

  async function download(kind: 'png' | 'svg') {
    if (!cardRef.current || !answer) return;
    const name = exportFilename(answer.question.id, answer.option.label, answer.segmentGroup);
    try {
      if (kind === 'png') await exportPng(cardRef.current, name);
      else await exportSvg(cardRef.current, name);
    } catch (e) {
      setNotice(`Exporten misslyckades: ${(e as Error).message}`);
    }
  }

  const groupsForCard = answer
    ? [TOTAL_GROUP, ...answer.question.segment_groups.filter((g) => g !== TOTAL_GROUP)]
    : [];

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

      {view.kind !== 'selected' && (
        <Hits hits={hits} activeId={null} onSelect={(q) => select(q)} label="Frågor i undersökningen" />
      )}

      {view.kind === 'no_match' && (
        <NoMatch query={view.query} suggestions={view.suggestions} onSelect={(q) => select(q, view.query)} />
      )}

      {view.kind === 'idle' && hits.length === 0 && (
        <section className="empty">
          <p>
            {dataset.questions.length} frågor ur {dataset.meta.source}, nedbrutna på{' '}
            {dataset.segments.length} segment. Skriv en fråga, eller börja här:
          </p>
          <ul className="empty__examples">
            {EXAMPLES.map((text) => (
              <li key={text}>
                <button type="button" className="empty__example" onClick={() => { setQuery(text); }}>
                  {text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {answer && (
        <>
          <Pills
            ariaLabel="Svarsalternativ"
            items={answer.optionLabels.map((l) => ({ id: l, label: l }))}
            active={answer.option.label}
            onSelect={setOption}
            maxVisible={6}
          />
          <Pills
            ariaLabel="Segmentgrupp"
            items={groupsForCard.map((g) => ({ id: g, label: g === TOTAL_GROUP ? 'Totalt' : g }))}
            active={answer.segmentGroup}
            onSelect={setGroup}
            maxVisible={7}
          />

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
