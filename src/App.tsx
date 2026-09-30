import { useMemo, useRef, useState } from 'react';
import type { Question } from './types';
import { datasetFor, DEFAULT_YEAR, TOTAL_GROUP, YEARS } from './lib/dataset';
import { answerable, bestOption, bestSegmentGroup, CONFIDENT_SCORE, nearestQuestions, searchQuestions } from './lib/search';
import { availableSegments, defaultOption, executeQuery } from './lib/query';
import { askModel, AskUnavailable } from './lib/ask';
import { exportFilename, exportPng, exportSvg } from './lib/export';
import { allGroups, axesFor, bestObject, groupOf, resolve, selectionFor, type QuestionGroup } from './lib/groups';
import { examplesFor, questionsInTopic } from './lib/labels';
import { YearPicker } from './components/YearPicker';
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
function toGroups(year: number, questions: { id: string }[]): QuestionGroup[] {
  const out: QuestionGroup[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    const g = groupOf(year, q.id);
    if (!g || seen.has(g.id)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}

export function App() {
  // Årgången är det yttersta valet: allt annat — sökning, frågor, segment,
  // frågelagret — är scopat till den. Årgångar blandas aldrig.
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [topic, setTopic] = useState<string | null>(null);

  // Val inom den valda frågan. Bas och frekvens pekar ut vilken tabell i
  // bilagan som slås upp; alternativ och segmentgrupp styr vad kortet visar.
  const [base, setBase] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [object, setObject] = useState<string | null>(null);
  // Flerval. Tom lista betyder alla — så att man kan jämföra Tiktok och
  // Snapchat, eller Gen Z och millennials, utan att först behöva välja bort.
  const [options, setOptions] = useState<string[]>([]);
  const [segmentGroup, setSegmentGroup] = useState<string>(TOTAL_GROUP);
  const [segments, setSegments] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRef = useRef<SVGSVGElement>(null);

  // Fas 2: sökningen är helt deterministisk och gör inga API-anrop.
  const search = useMemo(() => {
    if (view.kind === 'selected' || query.trim().length < 2) return null;
    return searchQuestions(year, query, 12);
  }, [year, query, view.kind]);

  const hits = useMemo(() => {
    if (view.kind === 'selected') return [];
    if (search) return toGroups(year, search.map((h) => h.question));
    return topic ? toGroups(year, questionsInTopic(year, topic)) : [];
  }, [year, search, view.kind, topic]);

  /**
   * Ingen av träffarna är egentligen en träff — de är bara det närmaste som
   * fanns. Vanligast när frågan finns i en annan årgång än den valda.
   */
  const weakMatch = Boolean(search?.length) && (search![0].score < CONFIDENT_SCORE);

  const group = view.kind === 'selected' ? allGroups(year).find((g) => g.id === view.groupId) : undefined;

  const answer = useMemo(() => {
    if (!group) return null;
    const question = resolve(group, { base, frequency, object });
    return executeQuery({
      year,
      questionId: question.id,
      optionLabels: options,
      segmentGroup,
      segmentIds: segments,
      question,
    });
  }, [year, group, base, frequency, object, options, segmentGroup, segments]);

  /** Öppnar en fråga och sätter val ur användarens egen text. */
  function select(
    g: QuestionGroup,
    sourceText = query,
    from?: { questionId?: string; options?: string[]; group?: string | null; segments?: string[] },
  ) {
    const sel = from?.questionId ? selectionFor(year, from.questionId) : {};
    const guessObject = sel.object ?? bestObject(g, sourceText) ?? (g.objects[0] ?? null);
    const axes = axesFor(g, { object: guessObject });
    const nextBase = sel.base ?? axes.bases[0];
    const nextFreq = sel.frequency ?? (axes.frequencies[0] ?? null);
    const nextObject = guessObject;
    setBase(nextBase);
    setFrequency(nextFreq);
    setObject(nextObject);

    const question = resolve(g, { base: nextBase, frequency: nextFreq, object: nextObject });

    // Utan uttryckligt val lämnas alternativen tomma, vilket betyder alla.
    // På totalnivå jämförs de då med varandra i stället för att kortet visar
    // en ensam stapel som upprepar det stora talet.
    // Utan uttryckligt val: tom lista på totalnivå (= alla jämförs), annars
    // frågans Netto-rad. Det alternativ som råkar stå först i arket är aldrig
    // ett vettigt förval — "Youtube" som svar på en fråga om sociala medier
    // säger mer om arkets sortering än om vad användaren frågade.
    const guessed = bestOption(question, sourceText, year);

    const sg = from?.group ?? bestSegmentGroup(year, question, sourceText);
    const nextGroup = sg && question.segment_groups.includes(sg) ? sg : TOTAL_GROUP;
    setSegmentGroup(nextGroup);

    if (from?.options?.length) setOptions(from.options);
    else if (guessed) setOptions([guessed]);
    else setOptions(nextGroup === TOTAL_GROUP ? [] : [defaultOption(question)]);

    const wanted = from?.segments ?? [];
    const available = availableSegments(year, question, nextGroup);
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
      const spec = await askModel(year, q);
      // Ingen match eller låg tillförsikt: visa de tre närmaste, gissa aldrig.
      if (spec.no_match || spec.confidence === 'low' || !spec.question_id) {
        setView({ kind: 'no_match', query: q, suggestions: toGroups(year, nearestQuestions(year, q)) });
        return;
      }
      const g = groupOf(year, spec.question_id);
      if (!g) {
        setView({ kind: 'no_match', query: q, suggestions: toGroups(year, nearestQuestions(year, q)) });
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

  /**
   * Årsbyte nollställer urvalet. Ett fråge-id, ett segment och en bas hör
   * till sin årgång — att bära över dem hade tyst kunnat visa fel års siffra.
   */
  function chooseYear(next: number) {
    setYear(next);
    setView({ kind: 'idle' });
    setTopic(null);
    setBase(null); setFrequency(null); setObject(null);
    setOptions([]); setSegmentGroup(TOTAL_GROUP); setSegments([]);
    setNotice(null);
  }

  /**
   * Byte av nedbrytning.
   *
   * På totalnivå jämförs alla svarsalternativ med varandra, och tom lista
   * betyder just det. Med en segmentgrupp går det inte — tjugo alternativ
   * gånger tio segment är tvåhundra staplar — så ett alternativ måste väljas.
   * Då tas frågans Netto-rad, aldrig det som råkar stå först i arket.
   */
  function changeBreakdown(next: string, question: Question) {
    setSegmentGroup(next);
    setSegments([]);
    if (next === TOTAL_GROUP) {
      if (options.length === 1 && options[0] === defaultOption(question)) setOptions([]);
    } else if (options.length === 0) {
      setOptions([defaultOption(question)]);
    }
  }

  function chooseTopic(id: string | null) {
    setTopic(id);
    setQuery('');
    setNotice(null);
    setView({ kind: 'idle' });
  }

  async function download(kind: 'png' | 'svg') {
    if (!cardRef.current || !answer) return;
    const name = exportFilename(`${year}-${answer.question.id}`, answer.selectedOptions.join('-'), answer.segmentGroup);
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
  const segmentOptions = answer ? availableSegments(year, answer.question, answer.segmentGroup) : [];
  // Bas och frekvens beror på vilket objekt i klustret som är valt.
  const axes = group ? axesFor(group, { object }) : null;

  return (
    <main className="page">
      <div className="masthead-row">
        <p className="masthead">Fråga Svenskarna</p>
        <YearPicker years={YEARS} active={year} onSelect={chooseYear} />
      </div>

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
            {allGroups(year).length} frågor ur {datasetFor(year).meta.source}, nedbrutna på{' '}
            {datasetFor(year).segments.length} segment. Skriv en fråga, eller välj ett ämne.
          </p>
          <Topics year={year} active={topic} onSelect={chooseTopic} />

          {/* Rapportens egna avsnittsrubriker. Det är så Internetstiftelsen
              formulerar sig om materialet, och ungefär så en journalist
              skulle söka i det. */}
          <ul className="empty__examples">
            {examplesFor(year, topic, answerable).map((e) => (
              <li key={e.text}>
                <button type="button" className="empty__example" onClick={() => reset(e.text)}>
                  {e.text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.kind !== 'selected' && weakMatch && (
        <p className="weak" role="status">
          Ingen tydlig träff på ”{query.trim()}” i {year}. Det här ligger närmast.
        </p>
      )}

      {view.kind !== 'selected' && (
        <Hits groups={hits} activeId={null} onSelect={(g) => select(g)} label="Frågor i undersökningen" />
      )}

      {view.kind === 'no_match' && (
        <NoMatch query={view.query} suggestions={view.suggestions} onSelect={(g) => select(g, view.query)} />
      )}

      {answer && group && (
        <>
          {/* Svaret först. Väljarna låg tidigare mellan sökfältet och kortet,
              så man fick scrolla förbi fem rader kontroller för att se
              siffran man just bett om. Nu står talet överst och justeringen
              under: läs först, förfina sedan. */}
          <div className="card-wrap">
            {/* Samma nod renderas på skärmen och serialiseras vid export. */}
            <AnswerCard ref={cardRef} answer={answer} year={year} />
            <div className="card-actions">
              <button type="button" className="button" onClick={() => download('png')}>Ladda ner PNG</button>
              <button type="button" className="button" onClick={() => download('svg')}>Ladda ner SVG</button>
            </div>
          </div>

          <section className="controls" aria-label="Justera svaret">
            <p className="controls__head">Justera svaret ovan</p>

            {/* Bas och frekvens pekar ut vilken tabell som slås upp. Basen är
                inte en detalj: samma fråga på olika baser ger olika andelar. */}
            <Pills
              label="Bas"
              items={(axes?.bases ?? group.bases).map((b) => ({ id: b, label: b }))}
              selected={[base ?? (axes?.bases ?? group.bases)[0]]}
              onChange={(next) => setBase(next[0] ?? null)}
              maxVisible={6}
            />
            {group.objects.length > 1 && (
              <Pills
                label={group.objectLabel ?? 'Val'}
                items={group.objects.map((o) => ({ id: o, label: o }))}
                selected={object ? [object] : []}
                onChange={(next) => { setObject(next[0] ?? null); setBase(null); }}
                maxVisible={8}
              />
            )}
            <Pills
              label="Hur ofta"
              items={(axes?.frequencies ?? group.frequencies).map((f) => ({ id: f, label: f }))}
              selected={frequency ? [frequency] : []}
              onChange={(next) => setFrequency(next[0] ?? null)}
            />

            <GroupSelect
              groups={segmentGroups}
              active={answer.segmentGroup}
              onSelect={(g) => changeBreakdown(g, answer.question)}
              totalLabel="Ingen nedbrytning — visa totalt"
            />

            <Pills
              label="Svarsalternativ"
              items={answer.optionLabels.map((l) => ({ id: l, label: l }))}
              selected={answer.selectedOptions}
              onChange={(next) =>
                setOptions(next.length || answer.segmentGroup === TOTAL_GROUP ? next : [defaultOption(answer.question)])
              }
              multi
              /* "Alla" går bara att erbjuda på totalnivå. Med en nedbrytning
                 skulle tjugo alternativ gånger tio segment bli tvåhundra
                 staplar, så där måste minst ett alternativ vara valt. */
              allLabel={answer.segmentGroup === TOTAL_GROUP ? 'Alla svarsalternativ' : undefined}
              maxVisible={8}
            />

            {segmentOptions.length > 0 && (
              <Pills
                label={answer.segmentGroup}
                items={segmentOptions.map((s) => ({ id: s.id, label: s.label }))}
                selected={segments}
                onChange={setSegments}
                multi
                allLabel="Alla"
                maxVisible={10}
              />
            )}
          </section>
        </>
      )}
    </main>
  );
}
