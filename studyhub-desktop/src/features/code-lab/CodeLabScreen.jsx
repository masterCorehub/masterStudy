import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Icon } from "../../ui/Icon";
import { getCodeLabStreak, useCodeLabStore } from "../../store/useCodeLabStore";
import { useStudyStore } from "../../store/useStore";

const api = () => window.studyhubDesktop?.codeLab;
const emptyCatalog = { modules: [], challenges: [] };

export function CodeLabScreen() {
  const lab = useCodeLabStore();
  const addDeck = useStudyStore((state) => state.addFlashcardDeck);
  const addCard = useStudyStore((state) => state.addFlashcard);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [environment, setEnvironment] = useState({ available: false, reason: "Verificando .NET..." });
  const [ollama, setOllama] = useState({ available: false });
  const [selectedId, setSelectedId] = useState(null);
  const [files, setFiles] = useState({});
  const [activeFile, setActiveFile] = useState("Program.cs");
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(0);
  const [panel, setPanel] = useState("lesson");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const service = api();
    Promise.all([
      service?.getCatalog?.() || Promise.resolve(emptyCatalog),
      service?.getEnvironment?.() || Promise.resolve({ available: false, reason: "Disponível no aplicativo desktop." }),
      service?.getOllamaStatus?.() || Promise.resolve({ available: false }),
    ]).then(([nextCatalog, nextEnvironment, nextOllama]) => {
      setCatalog(nextCatalog || emptyCatalog);
      setEnvironment(nextEnvironment);
      setOllama(nextOllama);
      if (nextCatalog?.challenges?.length) openChallenge(nextCatalog.challenges[0].id, nextCatalog);
    });
  }, []);

  const challenges = catalog.challenges || [];
  const selected = challenges.find((item) => item.id === selectedId) || null;
  const passedCount = challenges.filter((item) => lab.progressByChallenge[item.id]?.status === "passed").length;
  const streak = getCodeLabStreak(lab.studyDates);
  const progressPercent = challenges.length ? Math.round((passedCount / challenges.length) * 100) : 0;
  const currentIndex = Math.max(0, challenges.findIndex((item) => item.id === selectedId));
  const nextChallenge = challenges.find((item) => lab.progressByChallenge[item.id]?.status !== "passed") || challenges[0];
  const dueCount = Object.values(lab.progressByChallenge).filter((item) => item.status === "passed" && item.nextReviewAt && item.nextReviewAt <= Date.now()).length;
  const activeModule = selected?.moduleId;

  function locked(challenge) {
    // A trilha serve também como material de consulta: o aluno pode visitar
    // qualquer etapa e escolher sua própria ordem de estudo.
    return false;
  }

  async function openChallenge(id, sourceCatalog = catalog) {
    const challenge = sourceCatalog.challenges?.find((item) => item.id === id);
    if (!challenge) return;
    setSelectedId(id); setPanel("lesson"); setResult(null); setHint(0);
    const loaded = await api()?.loadWorkspace?.(id);
    setFiles(loaded || challenge.starterFiles || {}); setActiveFile("Program.cs");
    lab.markChallengeStarted(id);
  }

  async function execute(mode) {
    if (!selected || !api()?.[mode]) return;
    if (!lab.consentAt) { setPanel("consent"); return; }
    setLoading(true); setResult(null);
    const requestId = `csharp-${Date.now()}`;
    await api().saveWorkspace(selected.id, files);
    const response = await api()[mode]({ challengeId: selected.id, files, input, requestId });
    setResult(response); setLoading(false);
    lab.recordRun(selected.id, { ...response, mode });
    if (mode === "submit" && response.status === "passed") lab.recordPass(selected.id, "good");
  }

  async function askTutor() {
    if (!question.trim()) return;
    setAiLoading(true); setAnswer("");
    const messages = [
      { role: "system", content: "Você é um tutor paciente de C# para iniciantes. Responda em português, explique o raciocínio e dê uma dica por vez. Não entregue a solução completa sem pedido explícito." },
      { role: "user", content: `Desafio: ${selected?.title}\nObjetivo: ${selected?.objective}\nCódigo:\n${Object.entries(files).map(([name, code]) => `// ${name}\n${code}`).join("\n")}\nResultado: ${result?.stderr || result?.message || "sem execução"}\nPergunta: ${question}` },
    ];
    const response = await api()?.askTutor?.({ model: lab.aiSettings.model, messages });
    setAnswer(response?.message || "O tutor offline recomenda revisar a linha indicada pelo compilador e executar novamente com uma entrada pequena.");
    setAiLoading(false);
  }

  function createFlashcard() {
    if (!selected) return;
    const deckId = "deck-csharp-review";
    if (!(useStudyStore.getState().flashcardDecks || []).some((deck) => deck.id === deckId)) {
      addDeck({ id: deckId, title: "C# — Revisão", description: "Conceitos e erros da trilha C#", cards: [] });
    }
    addCard(deckId, { front: result?.diagnostics?.[0]?.code || selected.title, back: result?.diagnostics?.[0]?.explanation || selected.objective, sourceType: "csharp-lab", challengeId: selected.id });
  }

  return (
    <main className="code-lab flex-1 overflow-y-auto bg-[color:var(--background)] px-5 py-7 md:px-9">
      <div className="mx-auto max-w-[1540px]">
        <LabHeader passed={passedCount} total={challenges.length} progress={progressPercent} streak={streak} due={dueCount} environment={environment} ollama={ollama} />

        <section className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <article className="relative overflow-hidden rounded-[2rem] bg-[color:var(--primary)] p-7 text-white shadow-xl">
            <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[22px] border-white/10" />
            <p className="text-xs font-black uppercase tracking-[.2em] text-white/65">Plano de hoje · 60 minutos</p>
            <h2 className="mt-3 max-w-xl text-3xl font-black">Aprenda fazendo, uma ideia de cada vez.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Siga a microaula, escreva uma solução, teste com entradas diferentes e registre o que aprendeu.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3"><button onClick={() => nextChallenge && openChallenge(nextChallenge.id)} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-[color:var(--primary)]">Continuar trilha <Icon name="arrow_forward" /></button><span className="rounded-full border border-white/20 px-3 py-2 text-xs font-bold">{passedCount} concluídos</span></div>
            <div className="mt-7 grid max-w-xl grid-cols-4 gap-2 text-[10px] font-bold uppercase tracking-wide text-white/70"><PlanStep icon="menu_book" label="Microaula" active={currentIndex % 4 === 0} /><PlanStep icon="code" label="Prática" active={currentIndex % 4 === 1} /><PlanStep icon="bug_report" label="Correção" active={currentIndex % 4 === 2} /><PlanStep icon="style" label="Revisão" active={currentIndex % 4 === 3} /></div>
          </article>
          <article className="rounded-[2rem] p-6 neo-raised"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--on-surface-variant)]">Seu momento</p><h2 className="mt-2 text-xl font-black">{streak ? `${streak} dias em sequência` : "Comece sua sequência"}</h2></div><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500"><Icon name="local_fire_department" className="text-3xl" /></div></div><div className="mt-6 grid grid-cols-2 gap-3"><Metric label="Revisões hoje" value={dueCount} icon="update" /><Metric label="Próximo desafio" value={nextChallenge ? `#${nextChallenge.order}` : "—"} icon="flag" /></div><div className="mt-5 rounded-2xl bg-[color:var(--background)] p-4"><div className="flex items-center justify-between text-xs font-bold"><span>Domínio da trilha</span><span className="text-[color:var(--primary)]">{progressPercent}%</span></div><div className="mt-3 h-2 rounded-full neo-inset"><div className="h-full rounded-full bg-[color:var(--tertiary)]" style={{ width: `${progressPercent}%` }} /></div><p className="mt-3 text-xs text-[color:var(--on-surface-variant)]">A consistência importa mais do que acertar de primeira.</p></div></article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[300px_1fr]">
          <Roadmap catalog={catalog} selectedId={selectedId} activeModule={activeModule} progress={lab.progressByChallenge} onOpen={openChallenge} locked={locked} />
          {selected ? <ChallengeWorkspace selected={selected} files={files} activeFile={activeFile} setActiveFile={setActiveFile} updateCode={(value) => setFiles((current) => ({ ...current, [activeFile]: value }))} input={input} setInput={setInput} panel={panel} setPanel={setPanel} result={result} loading={loading} hint={hint} setHint={setHint} execute={execute} createFlashcard={createFlashcard} lab={lab} environment={environment} ollama={ollama} setOllama={setOllama} question={question} setQuestion={setQuestion} answer={answer} aiLoading={aiLoading} askTutor={askTutor} /> : <EmptyState onOpen={() => nextChallenge && openChallenge(nextChallenge.id)} />}
        </section>
      </div>
    </main>
  );
}

function LabHeader({ passed, total, progress, streak, due, environment, ollama }) { return <header className="rounded-[2rem] p-7 neo-raised"><div className="flex flex-wrap items-start justify-between gap-6"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[color:var(--primary)]">StudyHub · laboratório de prática</p><h1 className="mt-2 text-3xl font-black text-[color:var(--on-surface)]">C# Lab</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)]">Uma trilha guiada para aprender lógica, C# e orientação a objetos construindo soluções reais.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Progresso" value={`${progress}%`} /><Stat label="Concluídos" value={`${passed}/${total || 27}`} /><Stat label="Sequência" value={`${streak}d`} /><Stat label="Revisões" value={due} /></div></div><div className="mt-6 flex flex-wrap gap-2 text-xs font-bold"><Status ok={environment.available} text={environment.available ? `.NET ${environment.version}` : environment.reason} /><Status ok={ollama.available} text={ollama.available ? "Tutor Ollama conectado" : "Tutor offline disponível"} /></div></header>; }
function Roadmap({ catalog, selectedId, activeModule, progress, onOpen, locked }) { return <aside className="rounded-[2rem] p-4 neo-raised"><div className="flex items-center justify-between px-3"><div><h2 className="text-sm font-black">Roadmap</h2><p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Do console a objetos</p></div><Icon name="route" className="text-[color:var(--primary)]" /></div>{(catalog.modules || []).map((module, index) => { const moduleChallenges = (catalog.challenges || []).filter((item) => item.moduleId === module.id); const done = moduleChallenges.filter((item) => progress[item.id]?.status === "passed").length; return <div key={module.id} className={`mt-5 rounded-2xl p-2 ${activeModule === module.id ? "bg-[color:var(--primary)]/8" : ""}`}><div className="flex items-center gap-3 px-2"><span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black ${done === moduleChallenges.length ? "bg-green-500/15 text-green-600" : "neo-inset text-[color:var(--primary)]"}`}>{done === moduleChallenges.length ? "✓" : index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{module.title}</p><p className="mt-1 text-[10px] text-[color:var(--on-surface-variant)]">{done}/{moduleChallenges.length} desafios</p></div></div><div className="mt-2 h-1 rounded-full bg-[color:var(--background)]"><div className="h-full rounded-full bg-[color:var(--primary)]" style={{ width: `${moduleChallenges.length ? (done / moduleChallenges.length) * 100 : 0}%` }} /></div>{moduleChallenges.map((challenge) => { const isLocked = locked(challenge); const passed = progress[challenge.id]?.status === "passed"; return <button key={challenge.id} disabled={isLocked} onClick={() => onOpen(challenge.id)} className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] ${selectedId === challenge.id ? "bg-[color:var(--primary)] text-white" : "text-[color:var(--on-surface-variant)] hover:neo-inset"} ${isLocked ? "cursor-not-allowed opacity-35" : ""}`}><Icon name={passed ? "check_circle" : isLocked ? "lock" : "radio_button_unchecked"} className="text-[14px]" /><span className="truncate">{challenge.order}. {challenge.title}</span></button>; })}</div>; })}</aside>; }
function ChallengeWorkspace({ selected, files, activeFile, setActiveFile, updateCode, input, setInput, panel, setPanel, result, loading, hint, setHint, execute, createFlashcard, lab, environment, ollama, setOllama, question, setQuestion, answer, aiLoading, askTutor }) { return <div className="min-w-0 space-y-5"><div className="rounded-[2rem] p-6 neo-raised"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--primary)]">Desafio {selected.order}</span>{selected.isProject ? <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-orange-600">Projeto</span> : null}<span className="rounded-full px-2.5 py-1 text-[10px] font-bold neo-inset">{selected.estimatedMinutes} min</span></div><h2 className="mt-2 text-2xl font-black text-[color:var(--on-surface)]">{selected.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--on-surface-variant)]">{selected.objective}</p></div><div className="flex gap-2"><button onClick={() => setPanel("lesson")} className={`rounded-xl px-3 py-2 text-xs font-black ${panel === "lesson" ? "bg-[color:var(--primary)] text-white" : "neo-raised"}`}><Icon name="menu_book" /> Aula</button><button onClick={() => setPanel("tutor")} className={`rounded-xl px-3 py-2 text-xs font-black ${panel === "tutor" ? "bg-[color:var(--primary)] text-white" : "neo-raised"}`}><Icon name="psychology" /> Tutor</button><button onClick={() => setPanel("errors")} className={`rounded-xl px-3 py-2 text-xs font-black ${panel === "errors" ? "bg-[color:var(--primary)] text-white" : "neo-raised"}`}><Icon name="bug_report" /> Erros</button></div></div>{panel === "lesson" ? <LessonPanel selected={selected} hint={hint} setHint={setHint} lab={lab} /> : null}{panel === "tutor" ? <TutorPanel ollama={ollama} setOllama={setOllama} question={question} setQuestion={setQuestion} answer={answer} aiLoading={aiLoading} askTutor={askTutor} /> : null}{panel === "errors" ? <ErrorPanel errors={lab.errorJournal} /> : null}</div><EditorPanel selected={selected} files={files} activeFile={activeFile} setActiveFile={setActiveFile} updateCode={updateCode} input={input} setInput={setInput} result={result} loading={loading} execute={execute} createFlashcard={createFlashcard} environment={environment} /></div>; }
function LessonPanel({ selected, hint, setHint, lab }) { return <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_310px]"><div className="rounded-2xl bg-[color:var(--background)] p-5"><p className="text-xs font-black uppercase tracking-wide text-[color:var(--primary)]">Microaula antes do código</p><p className="mt-3 whitespace-pre-line text-sm leading-7 text-[color:var(--on-surface)]">{selected.theory}</p>{selected.projectSteps?.length ? <div className="mt-4 rounded-xl bg-orange-500/8 p-4"><p className="text-xs font-black uppercase text-orange-600">Etapas do projeto</p>{selected.projectSteps.map((step, index) => <p key={step} className="mt-2 text-xs text-[color:var(--on-surface-variant)]"><b>{index + 1}.</b> {step}</p>)}</div> : null}</div><div className="rounded-2xl p-5 neo-inset"><p className="text-xs font-black uppercase tracking-wide">Dicas progressivas</p>{selected.hints?.slice(0, hint).map((item, index) => <p key={item} className="mt-3 text-xs leading-5"><b>{index + 1}.</b> {item}</p>)}{hint < (selected.hints || []).length ? <button onClick={() => { setHint((value) => value + 1); lab.recordHint(selected.id); }} className="mt-4 text-xs font-black text-[color:var(--primary)]">Mostrar próxima dica <Icon name="arrow_forward" /></button> : <p className="mt-4 text-xs text-[color:var(--on-surface-variant)]">Você viu todas as dicas.</p>}</div></div>; }
function EditorPanel({ selected, files, activeFile, setActiveFile, updateCode, input, setInput, result, loading, execute, createFlashcard, environment }) { return <div className="overflow-hidden rounded-[2rem] neo-raised"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--outline-variant)]/20 px-5 py-3"><div className="flex gap-2">{Object.keys(files).map((name) => <button key={name} onClick={() => setActiveFile(name)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${activeFile === name ? "bg-[color:var(--primary)] text-white" : "neo-inset"}`}>{name}</button>)}</div><span className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">Ctrl+Enter para executar</span></div><Editor height="500px" language="csharp" theme={document.documentElement.classList.contains("dark") ? "vs-dark" : "vs"} value={files[activeFile] || ""} onChange={updateCode} options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 18 }, wordWrap: "on", tabSize: 4 }} /><div className="grid gap-4 border-t border-[color:var(--outline-variant)]/20 p-5 lg:grid-cols-[1fr_auto] lg:items-end"><label className="text-xs font-black uppercase tracking-wide text-[color:var(--on-surface-variant)]">Entrada do programa<textarea value={input} onChange={(event) => setInput(event.target.value)} className="mt-2 min-h-16 w-full font-mono text-sm" placeholder="Valores para Console.ReadLine()" /></label><div className="flex flex-wrap gap-2"><button disabled={loading || !environment.available} onClick={() => execute("run")} className="rounded-xl px-4 py-3 text-sm font-black neo-inset disabled:opacity-40"><Icon name="play_arrow" /> Executar</button><button disabled={loading || !environment.available} onClick={() => execute("submit")} className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white disabled:opacity-40">{loading ? "Testando..." : "Entregar"}</button>{result ? <button onClick={createFlashcard} className="rounded-xl px-4 py-3 text-sm font-black neo-inset"><Icon name="style" /> Revisar</button> : null}</div></div>{result ? <ResultBox result={result} /> : null}</div>; }
function TutorPanel({ ollama, setOllama, question, setQuestion, answer, aiLoading, askTutor }) { return <div className="mt-6 rounded-2xl bg-[color:var(--background)] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-[color:var(--primary)]">Tutor de C#</p><p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">Pergunte sobre o conceito ou cole o erro que apareceu.</p></div><Status ok={ollama.available} text={ollama.available ? "Ollama online" : "offline"} /></div><textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="mt-4 min-h-28 w-full" placeholder="Ex.: por que esse valor precisa de int.Parse()?" /><div className="mt-3 flex flex-wrap gap-3"><button onClick={askTutor} className="rounded-xl bg-[color:var(--primary)] px-4 py-3 text-sm font-black text-white">{aiLoading ? "Pensando..." : "Explicar passo a passo"}</button>{!ollama.available ? <button onClick={async () => setOllama(await api()?.startOllama?.())} className="rounded-xl px-4 py-3 text-xs font-black neo-inset">Iniciar Ollama</button> : null}</div>{answer ? <div className="mt-4 whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 neo-inset">{answer}</div> : null}</div>; }
function ErrorPanel({ errors }) { return <div className="mt-6 grid gap-3 sm:grid-cols-2">{errors.slice(0, 8).map((item) => <div key={item.id} className="rounded-2xl bg-[color:var(--background)] p-4"><div className="flex items-center justify-between"><b className="text-sm">{item.code || "Erro registrado"}</b><span className="text-[10px] text-[color:var(--on-surface-variant)]">{new Date(item.createdAt).toLocaleDateString()}</span></div><p className="mt-2 text-xs leading-5 text-[color:var(--on-surface-variant)]">{item.explanation || item.message}</p></div>)}{!errors.length ? <p className="rounded-2xl bg-[color:var(--background)] p-5 text-sm text-[color:var(--on-surface-variant)]">Seus erros importantes aparecerão aqui para revisão.</p> : null}</div>; }
function ResultBox({ result }) { return <div className={`border-t p-5 text-sm ${result.status === "passed" ? "border-green-500/20 bg-green-500/8 text-green-700" : "border-red-500/20 bg-red-500/8 text-red-700"}`}><p className="font-black">{result.status === "passed" ? "Desafio concluído — próximo passo liberado." : result.status === "compile_error" ? "O compilador encontrou algo para corrigir." : result.status === "timeout" ? "O programa excedeu o tempo limite." : "A solução ainda não passou."}</p>{result.diagnostics?.map((item) => <p key={`${item.code}-${item.line}`} className="mt-2 font-mono text-xs">{item.file}:{item.line}:{item.column} · {item.code} — {item.explanation || item.message}</p>)}{result.tests?.map((test) => <p key={test.name} className="mt-2 text-xs">{test.passed ? "✓" : "✗"} {test.name}{!test.passed ? ` · esperado: ${test.expected} · obtido: ${test.actual}` : ""}</p>)}{!result.diagnostics?.length && (result.stderr || result.stdout) ? <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap text-xs">{result.stderr || result.stdout}</pre> : null}</div>; }
function EmptyState({ onOpen }) { return <div className="rounded-[2rem] p-10 neo-raised"><Icon name="school" className="text-4xl text-[color:var(--primary)]" /><h2 className="mt-4 text-2xl font-black">Comece sua primeira sessão</h2><p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">Escolha um desafio no roadmap para começar.</p><button onClick={onOpen} className="mt-5 rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-black text-white">Começar agora</button></div>; }
function PlanStep({ icon, label, active }) { return <div className={`flex flex-col items-center gap-2 rounded-xl px-2 py-2 ${active ? "bg-white/15 text-white" : "text-white/50"}`}><Icon name={icon} /><span>{label}</span></div>; }
function Stat({ label, value }) { return <div className="min-w-[76px] rounded-2xl px-3 py-3 text-center neo-inset"><p className="text-[10px] font-black uppercase text-[color:var(--on-surface-variant)]">{label}</p><p className="mt-1 text-lg font-black text-[color:var(--primary)]">{value}</p></div>; }
function Metric({ label, value, icon }) { return <div className="flex items-center gap-3 rounded-xl bg-[color:var(--background)] p-3"><Icon name={icon} className="text-[color:var(--primary)]" /><div><p className="text-[10px] font-bold uppercase text-[color:var(--on-surface-variant)]">{label}</p><p className="mt-0.5 text-sm font-black">{value}</p></div></div>; }
function Status({ ok, text }) { return <span className={`rounded-full px-3 py-1 ${ok ? "bg-green-500/10 text-green-600" : "bg-[color:var(--background)] text-[color:var(--on-surface-variant)]"}`}><Icon name={ok ? "check_circle" : "info"} className="mr-1 align-middle text-[14px]" />{text}</span>; }
