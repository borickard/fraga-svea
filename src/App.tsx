import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from './types';
import { datasetFor, DEFAULT_YEAR, TOTAL_GROUP, YEARS } from './lib/dataset';
import { answerable, bestOption, bestSegmentGroup, CONFIDENT_SCORE, nearestQuestions, searchQuestions } from './lib/search';
import { availableSegments, defaultOption, executeQuery } from './lib/query';
import { askModel, AskUnavailable } from './lib/ask';
import { exportFilename, exportPng, exportSvg } from './lib/export';
import { allGroups, axesFor, bestObject, groupOf, resolve, selectionFor, type QuestionGroup } from './lib/groups';
import { examplesFor, questionsInTopic } from './lib/labels';
import { axesOf, axisOf, genderOf, groupFor } from './lib/segments';
import { fromSearch, toSearch, type UrlState } from './lib/url';
import { resolveModule, type Module } from './lib/dashboard';
import { decodeModules, encodeModules, loadModules, newId, saveModules } from './lib/dashboardStore';
import { DashboardGrid } from './components/DashboardGrid';
import { YearPicker } from './components/YearPicker';
import { SearchField } from './components/SearchField';
import { Hits, type Hit } from './components/Hits';
import { Pills } from './components/Pills';
import { Dropdown } from './components/Dropdown';
import { NoMatch } from './components/NoMatch';
import { AnswerCard } from './components/AnswerCard';
import { Topics } from './components/Topics';

type View =
  | { kind: 'idle' }
  | { kind: 'selected'; groupId: string }
  | { kind: 'no_match'; query: string; suggestions: Hit[] };

/**
 * Träffar är frågor, inte tabeller. Flera tabeller i samma grupp blir en rad.
 *
 * Varje träff bär den fråga som sökningen fastnade på, inte bara gruppen.
 * Utan den visade en sökning på "tiktok" klustrets första medlem — "YouTube"
 * — under rubriken, och öppnade sedan Tiktok.
 */
function toHits(year: number, questions: Question[], matched: boolean): Hit[] {
  const out: Hit[] = [];
  const seen = new Set<string>();
  for (const question of questions) {
    const group = groupOf(year, question.id);
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    out.push({ group, question, matched });
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

  // Sätts när ett tillstånd just lästs ur adressfältet, så att effekten
  // nedan inte skriver tillbaka det och skapar en ändlös loop.
  const skipPush = useRef(false);
  // Dashboarden. Arbetskopian ligger i localStorage; delning går via länk.
  const [mode, setMode] = useState<'fraga' | 'dashboard'>('fraga');
  const [modules, setModules] = useState<Module[]>(() => loadModules());
  const [editingGrid, setEditingGrid] = useState(false);
  /** Satt när frågevyn används för att ändra en befintlig modul. */
  const [editingModule, setEditingModule] = useState<string | null>(null);

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
    if (search) return toHits(year, search.map((h) => h.question), true);
    return topic ? toHits(year, questionsInTopic(year, topic), false) : [];
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
        setView({ kind: 'no_match', query: q, suggestions: toHits(year, nearestQuestions(year, q), true) });
        return;
      }
      const g = groupOf(year, spec.question_id);
      if (!g) {
        setView({ kind: 'no_match', query: q, suggestions: toHits(year, nearestQuestions(year, q), true) });
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

  /**
   * Läser ett tillstånd ur adressfältet och sätter appen i det.
   *
   * Används både vid sidladdning — så att en delad länk öppnar rätt svar —
   * och när användaren går bakåt eller framåt i webbläsaren.
   */
  const applyUrl = useCallback((state: UrlState) => {
    setNotice(null);
    if (state.year && YEARS.includes(state.year)) setYear(state.year);
    const y = state.year && YEARS.includes(state.year) ? state.year : year;

    if (state.questionId) {
      const g = groupOf(y, state.questionId);
      if (g) {
        const sel = selectionFor(y, state.questionId);
        const question = resolve(g, sel);
        setBase(sel.base ?? null);
        setFrequency(sel.frequency ?? null);
        setObject(sel.object ?? null);
        const group = state.segmentGroup && question.segment_groups.includes(state.segmentGroup)
          ? state.segmentGroup
          : TOTAL_GROUP;
        setSegmentGroup(group);
        // Bara det som faktiskt finns i frågan. En länk kan vara gammal,
        // handredigerad eller peka på en annan årgångs etiketter.
        setOptions((state.options ?? []).filter((l) => question.options.some((o) => o.label === l)));
        const available = availableSegments(y, question, group);
        setSegments((state.segments ?? []).filter((id) => available.some((s) => s.id === id)));
        setQuery('');
        setTopic(null);
        setView({ kind: 'selected', groupId: g.id });
        return;
      }
    }
    setQuery(state.query ?? '');
    setTopic(state.topic ?? null);
    setView({ kind: 'idle' });
  }, [year]);

  useEffect(() => { saveModules(modules); }, [modules]);

  // Sidladdning: en delad länk ska öppna sitt svar, inte startsidan.
  useEffect(() => {
    const delad = new URLSearchParams(window.location.search).get('d');
    if (delad) {
      // En delad dashboard ersätter arbetskopian. Att smälta samman två
      // uppsättningar hade gett en tredje som ingen bett om.
      const inkomna = decodeModules(delad);
      if (inkomna.length) { setModules(inkomna); setMode('dashboard'); return; }
    }
    if (window.location.search) applyUrl(fromSearch(window.location.search));
    // Avsiktligt bara vid montering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPop = () => {
      skipPush.current = true;
      applyUrl(fromSearch(window.location.search));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [applyUrl]);

  /**
   * Skriver tillståndet till adressfältet.
   *
   * Sökfältet ersätter i stället för att lägga till: varje tecken hade annars
   * blivit ett eget steg i historiken, och bakåtknappen hade raderat
   * bokstav för bokstav. Allt annat är ett steg man ska kunna gå tillbaka
   * från.
   */
  useEffect(() => {
    if (skipPush.current) { skipPush.current = false; return; }
    const next = toSearch(
      view.kind === 'selected' && answer
        ? {
            year, questionId: answer.question.id, segmentGroup: answer.segmentGroup,
            options: answer.selectedOptions, segments,
          }
        : { year, query, topic },
      YEARS.length > 1,
    );
    const url = `${window.location.pathname}${next}`;
    if (url === `${window.location.pathname}${window.location.search}`) return;
    const typing = view.kind !== 'selected';
    window.history[typing ? 'replaceState' : 'pushState'](null, '', url);
  });

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

  /** Byte av segmentaxel. Könet följer med om den nya axeln har det. */
  function chooseAxis(axis: string, question: Question) {
    if (axis === TOTAL_GROUP) return changeBreakdown(TOTAL_GROUP, question);
    const next = groupFor(segmentGroups, axis, activeGender) ?? groupFor(segmentGroups, axis, 'Alla');
    if (next) changeBreakdown(next, question);
  }

  /**
   * Byte av kön inom samma axel.
   *
   * Valda segment följer med via sin etikett. Id:na skiljer sig mellan
   * könen — aldersgrupper_16_25_ar mot aldersgrupper_man_16_25_ar — men det
   * är samma åldersband, och att jämföra samma band mellan könen är precis
   * vad väljaren finns för. Utan överföringen nollställdes urvalet vid varje
   * byte och man fick peka ut bandet på nytt.
   */
  function chooseGender(gender: string, question: Question) {
    const next = groupFor(segmentGroups, activeAxis, gender);
    if (!next) return;
    const before = availableSegments(year, question, answer!.segmentGroup);
    const kept = segments
      .map((id) => before.find((s) => s.id === id)?.label)
      .filter((l): l is string => Boolean(l));
    setSegmentGroup(next);
    setSegments(availableSegments(year, question, next).filter((s) => kept.includes(s.label)).map((s) => s.id));
  }

  /** Bygger en modul av det urval frågevyn visar just nu. */
  function moduleFromAnswer(id: string): Module | null {
    if (!answer) return null;
    const labels = segments
      .map((sid) => segmentOptions.find((s) => s.id === sid)?.label)
      .filter((l): l is string => Boolean(l));
    return {
      id,
      questionId: answer.question.id,
      options: answer.selectedOptions,
      axis: activeAxis,
      // "Alla" är axeln utan könssuffix och lagras som tom lista.
      genders: activeGender === 'Alla' ? [] : [activeGender],
      segments: labels,
      chart: 'bar',
      span: 1,
    };
  }

  function addToDashboard() {
    const m = moduleFromAnswer(newId());
    if (!m) return;
    setModules((xs) => [...xs, m]);
    setNotice('Lagt till i dashboarden.');
  }

  function saveEdit() {
    if (!editingModule) return;
    const m = moduleFromAnswer(editingModule);
    if (!m) return;
    setModules((xs) => xs.map((x) => (x.id === editingModule
      // Form, bredd, rubrik och könsurval hör till modulen, inte till
      // frågevyn — de ska överleva att urvalet ändras.
      ? { ...m, chart: x.chart, span: x.span, title: x.title, genders: x.genders }
      : x)));
    setEditingModule(null);
    setMode('dashboard');
  }

  /** Öppnar en modul i frågevyn för att ändra dess urval. */
  function editModule(m: Module) {
    const g = groupOf(year, m.questionId);
    if (!g) return;
    setEditingModule(m.id);
    setMode('fraga');
    const groups = [TOTAL_GROUP, ...(getQuestionGroups(m) ?? [])];
    applyUrl({
      questionId: m.questionId,
      segmentGroup: groupFor(groups, m.axis, m.genders[0] ?? 'Alla') ?? TOTAL_GROUP,
      options: m.options,
      segments: [],
    });
  }

  function getQuestionGroups(m: Module): string[] | null {
    const g = groupOf(year, m.questionId);
    if (!g) return null;
    return resolve(g, selectionFor(year, m.questionId)).segment_groups;
  }

  async function copyShareLink() {
    const url = `${window.location.origin}${window.location.pathname}?d=${encodeModules(modules)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Delningslänk kopierad.');
    } catch {
      setNotice(url);
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
  // Kön ligger i bilagan som suffix på gruppnamnet. Uppdelat blir det en
  // axelväljare med 21 poster i stället för 38, och kön som eget val.
  const segmentAxes = axesOf(segmentGroups);
  const activeAxis = answer ? axisOf(answer.segmentGroup) : TOTAL_GROUP;
  const activeGender = answer ? genderOf(answer.segmentGroup) : 'Alla';
  const genders = segmentAxes.find((a) => a.axis === activeAxis)?.genders ?? [];
  // Bas och frekvens beror på vilket objekt i klustret som är valt.
  const axes = group ? axesFor(group, { object }) : null;
  // Panelen heter "Justera svaret ovan". Finns inget att justera ska den inte
  // stå där och påstå motsatsen.
  const adjustable =
    (axes?.bases.length ?? 0) > 1 ||
    (group?.objects.length ?? 0) > 1 ||
    (axes?.frequencies.length ?? 0) > 1 ||
    segmentAxes.length > 0 ||
    (answer?.optionLabels.length ?? 0) > 1;

  return (
    <main className="page">
      <div className="masthead-row">
        <p className="masthead">Fråga Svenskarna</p>
        <div className="modes">
          <button type="button" className="pill" aria-pressed={mode === 'fraga'}
            onClick={() => setMode('fraga')}>Fråga</button>
          <button type="button" className="pill" aria-pressed={mode === 'dashboard'}
            onClick={() => { setMode('dashboard'); setEditingModule(null); }}>
            Dashboard {modules.length > 0 && <span className="pill__count">{modules.length}</span>}
          </button>
          {/* Visas av sig själv igen så fort datasetet har mer än en årgång. */}
          {YEARS.length > 1 && <YearPicker years={YEARS} active={year} onSelect={chooseYear} />}
        </div>
      </div>

      {mode === 'dashboard' ? (
        <section className="dash">
          <div className="dash__bar">
            <p className="dash__count label">
              {modules.length === 0 ? 'Inga moduler än' : `${modules.length} moduler`}
            </p>
            <div className="dash__actions">
              <button type="button" className="pill" aria-pressed={editingGrid}
                onClick={() => setEditingGrid((e) => !e)}>
                {editingGrid ? 'Klar' : 'Redigera'}
              </button>
              <button type="button" className="pill" disabled={!modules.length} onClick={copyShareLink}>
                Kopiera delningslänk
              </button>
            </div>
          </div>

          {modules.length === 0 ? (
            <p className="dash__empty">
              Sök fram ett svar under Fråga och tryck <strong>Lägg till i dashboard</strong>.
              Varje modul slås upp på nytt ur datasetet varje gång den ritas — en delad
              dashboard kan inte innehålla ett tal som inte finns i bilagan.
            </p>
          ) : (
            <DashboardGrid
              modules={modules}
              resolve={(m) => resolveModule(year, m)}
              year={year}
              editing={editingGrid}
              onReorder={setModules}
              onChange={(next) => setModules((xs) => xs.map((x) => (x.id === next.id ? next : x)))}
              onRemove={(id) => setModules((xs) => xs.filter((x) => x.id !== id))}
              onEdit={editModule}
            />
          )}
        </section>
      ) : (
        <>
        {editingModule && (
          <p className="dash__editing" role="status">
            Ändrar en modul i dashboarden. Välj om urvalet och spara.
          </p>
        )}
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
          <Hits
            hits={hits}
            activeId={null}
            /* Fråge-id:t följer med, så att den variant raden visade är den som
               öppnas. Ett gissat objekt ur söktexten kunde peka åt annat håll. */
            onSelect={(h) => select(h.group, query, h.matched ? { questionId: h.question.id } : undefined)}
            label="Frågor i undersökningen"
          />
        )}

        {view.kind === 'no_match' && (
          <NoMatch
            query={view.query}
            suggestions={view.suggestions}
            onSelect={(h) => select(h.group, view.query, { questionId: h.question.id })}
          />
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
                {editingModule ? (
                  <>
                    <button type="button" className="button button--primary" onClick={saveEdit}>Spara modulen</button>
                    <button type="button" className="button"
                      onClick={() => { setEditingModule(null); setMode('dashboard'); }}>Avbryt</button>
                  </>
                ) : (
                  <button type="button" className="button button--primary" onClick={addToDashboard}>
                    Lägg till i dashboard
                  </button>
                )}
                <button type="button" className="button" onClick={() => download('png')}>Ladda ner PNG</button>
                <button type="button" className="button" onClick={() => download('svg')}>Ladda ner SVG</button>
              </div>
            </div>

            {adjustable && (
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

              <Dropdown
                label="Visa per"
                options={[
                  { id: TOTAL_GROUP, label: 'Ingen nedbrytning — visa totalt' },
                  ...segmentAxes.map((a) => ({ id: a.axis, label: a.axis })),
                ]}
                value={activeAxis}
                onChange={(axis) => chooseAxis(axis, answer.question)}
              />

              {/* Bara för de åtta axlar bilagan faktiskt korsar med kön. Att
                  erbjuda valet där det inte finns vore att lova data som inte
                  går att slå upp. */}
              {genders.length > 1 && (
                <Pills
                  label="Kön"
                  items={genders.map((g) => ({ id: g, label: g }))}
                  selected={[activeGender]}
                  onChange={(next) => next[0] && chooseGender(next[0], answer.question)}
                />
              )}

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
                  /* Axeln, inte hela gruppnamnet: "ÅLDERSGRUPPER - KVINNOR"
                     upprepar könsväljaren två rader upp. Kortet behåller det
                     fullständiga namnet — det måste stå för sig självt i en
                     exporterad bild. */
                  label={axisOf(answer.segmentGroup)}
                  items={segmentOptions.map((s) => ({ id: s.id, label: s.label }))}
                  selected={segments}
                  onChange={setSegments}
                  multi
                  allLabel="Alla"
                  maxVisible={10}
                />
              )}
            </section>
            )}
          </>
        )}
        </>
      )}
    </main>
  );
}
