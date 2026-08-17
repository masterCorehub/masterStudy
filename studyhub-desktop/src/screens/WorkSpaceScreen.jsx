import { useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";

const TABS = [
  { id: "overview", label: "Visao geral", icon: "dashboard" },
  { id: "writing", label: "Escrita", icon: "edit_document" },
  { id: "presentation", label: "Apresentacao", icon: "slideshow" },
  { id: "group", label: "Grupo", icon: "forum" },
];

const formatFileName = (path) => path?.split(/[\\/]/).pop() || "Arquivo";

export function WorkSpaceScreen({ onNavigate }) {
  const activeCourseId = useStudyStore((state) => state.activeCourseId);
  const activeModuleId = useStudyStore((state) => state.activeModuleId);
  const activeWorkId = useStudyStore((state) => state.activeWorkId);
  const courses = useStudyStore((state) => state.courses);
  const updateWork = useStudyStore((state) => state.updateWork);
  const [tab, setTab] = useState("overview");
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [workTask, setWorkTask] = useState("");
  const [message, setMessage] = useState("");
  const [decision, setDecision] = useState("");

  const course = courses.find((item) => item.id === activeCourseId);
  const module = course?.modules?.find((item) => item.id === activeModuleId);
  const work = module?.works?.find((item) => item.id === activeWorkId);
  const writing = work?.writing || {};
  const presentation = work?.presentation || {};
  const wordCount = useMemo(
    () => (writing.content || "").trim().split(/\s+/).filter(Boolean).length,
    [writing.content],
  );

  if (!course || !module || !work) {
    return <main className="flex flex-1 items-center justify-center bg-[color:var(--background)]"><button className="rounded-xl p-5 neo-raised" onClick={() => onNavigate(SCREEN_IDS.MODULE_DETAILS)}>Voltar ao modulo</button></main>;
  }

  const save = (updates) => updateWork(course.id, module.id, work.id, updates);
  const saveWriting = (updates) => save({ writing: { ...writing, ...updates } });
  const savePresentation = (updates) => save({ presentation: { ...presentation, ...updates } });
  const append = (key, item) => save({ [key]: [...(work[key] || []), item] });
  const addFile = async () => {
    const path = await window.studyhubDesktop?.selectFile?.({ properties: ["openFile", "multiSelections"] });
    const files = Array.isArray(path) ? path : path ? [path] : [];
    if (!files.length) return;
    save({ files: [...(work.files || []), ...files.map((filePath) => ({ id: `file-${Date.now()}-${filePath}`, name: formatFileName(filePath), path: filePath, version: 1, addedAt: Date.now(), author: "Voce" }))] });
  };

  const overview = (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-[2rem] p-6 neo-raised"><h2 className="font-bold">Planejamento</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Disciplina"><input value={work.subject || ""} onChange={(e) => save({ subject: e.target.value })} placeholder="Ex.: Metodologia cientifica" /></Field>
        <Field label="Professor"><input value={work.teacher || ""} onChange={(e) => save({ teacher: e.target.value })} placeholder="Nome do professor" /></Field>
        <Field label="Tipo"><select value={work.type || "Relatorio"} onChange={(e) => save({ type: e.target.value })}><option>Artigo</option><option>Relatorio</option><option>Seminario</option><option>TCC</option><option>Pesquisa</option><option>Outro</option></select></Field>
        <Field label="Entrega"><input type="date" value={work.dueDate || ""} onChange={(e) => save({ dueDate: e.target.value })} /></Field>
        <Field label="Prioridade"><select value={work.priority || "medium"} onChange={(e) => save({ priority: e.target.value })}><option value="low">Baixa</option><option value="medium">Media</option><option value="high">Alta</option></select></Field>
        <Field label="Status"><select value={work.status || "planning"} onChange={(e) => save({ status: e.target.value })}><option value="planning">Planejamento</option><option value="in_progress">Em andamento</option><option value="review">Revisao</option><option value="completed">Concluido</option></select></Field>
      </div><label className="mt-5 block text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">Informacoes e requisitos<textarea className="mt-2 min-h-28" value={work.description || ""} onChange={(e) => save({ description: e.target.value })} placeholder="Escopo, criterios e observacoes..." /></label></section>
      <section className="rounded-[2rem] p-6 neo-raised"><div className="flex items-center justify-between"><h2 className="font-bold">Progresso</h2><span className="text-2xl font-black text-[color:var(--primary)]">{work.progress || 0}%</span></div><input className="mt-5 w-full accent-[color:var(--primary)]" type="range" min="0" max="100" value={work.progress || 0} onChange={(e) => save({ progress: Number(e.target.value) })} /><div className="mt-6 rounded-2xl bg-[color:var(--background)] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">Tarefas do trabalho</p>{(work.tasks || []).map((task) => <label key={task.id} className="mt-3 flex gap-3 text-sm"><input type="checkbox" checked={task.completed} onChange={() => save({ tasks: work.tasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item) })} />{task.title}</label>)}<div className="mt-4 flex gap-2"><input value={workTask} onChange={(e) => setWorkTask(e.target.value)} placeholder="Nova atividade" /><button className="rounded-xl px-3 neo-inset text-[color:var(--primary)]" onClick={() => { if (!workTask.trim()) return; save({ tasks: [...(work.tasks || []), { id: `task-${Date.now()}`, title: workTask.trim(), completed: false }] }); setWorkTask(""); }}><Icon name="add" /></button></div></div></section>
      <section className="rounded-[2rem] p-6 neo-raised xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-bold">Arquivos e materiais</h2><p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">Documentos, slides, imagens, videos e links da equipe.</p></div><button className="rounded-xl bg-[color:var(--primary)] px-4 py-2 text-sm font-bold text-white" onClick={addFile}>Adicionar arquivo</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(work.files || []).map((file) => <article key={file.id} className="rounded-2xl bg-[color:var(--background)] p-4"><Icon name="attach_file" className="text-[color:var(--primary)]" /><p className="mt-2 truncate text-sm font-bold">{file.name}</p><p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">v{file.version || 1} · {file.author || "Voce"}</p></article>)}{!(work.files || []).length ? <p className="text-sm text-[color:var(--on-surface-variant)]">Nenhum arquivo adicionado ainda.</p> : null}</div></section>
    </div>
  );

  const writingTab = <div className="grid gap-6 xl:grid-cols-[1fr_280px]"><section className="rounded-[2rem] p-6 neo-raised"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Documento do trabalho</h2><div className="text-xs font-bold text-[color:var(--on-surface-variant)]">{wordCount} palavras · {(writing.content || "").length} caracteres</div></div><textarea spellCheck className="mt-5 min-h-[480px] font-serif text-base leading-8" value={writing.content || ""} onChange={(e) => saveWriting({ content: e.target.value })} placeholder="Comece a escrever..." /></section><aside className="space-y-6"><section className="rounded-[2rem] p-5 neo-raised"><h3 className="font-bold">Estrutura sugerida</h3>{(writing.structure || ["Introducao", "Desenvolvimento", "Conclusao"]).map((item) => <div key={item} className="mt-3 rounded-xl bg-[color:var(--background)] px-3 py-2 text-sm">{item}</div>)}</section><section className="rounded-[2rem] p-5 neo-raised"><h3 className="font-bold">Citações e referências</h3><select className="mt-4" value={writing.citationStyle || "ABNT"} onChange={(e) => saveWriting({ citationStyle: e.target.value })}><option>ABNT</option><option>APA</option></select><textarea className="mt-3 min-h-40" value={writing.references || ""} onChange={(e) => saveWriting({ references: e.target.value })} placeholder="Cole aqui suas referencias..." /></section></aside></div>;

  const presentationTab = <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-[2rem] p-6 neo-raised"><h2 className="font-bold">Roteiro de apresentação</h2><textarea className="mt-5 min-h-72" value={presentation.script || ""} onChange={(e) => savePresentation({ script: e.target.value })} placeholder="Abertura, pontos principais, transicoes e encerramento..." /><Field label="Tempo estimado de fala (minutos)"><input type="number" min="0" value={presentation.estimatedMinutes || 0} onChange={(e) => savePresentation({ estimatedMinutes: Number(e.target.value) })} /></Field></section><section className="rounded-[2rem] p-6 neo-raised"><h2 className="font-bold">Checklist e apresentadores</h2><p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">Organize os participantes e anexe os slides pela aba Visão geral.</p><div className="mt-5 space-y-2">{(work.members || []).map((member, index) => <div key={member.id} className="flex items-center gap-3 rounded-xl bg-[color:var(--background)] p-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--primary)]/10 text-xs font-bold text-[color:var(--primary)]">{index + 1}</span><span className="text-sm font-bold">{member.name}</span></div>)}</div></section></div>;

  const groupTab = <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-[2rem] p-6 neo-raised"><h2 className="font-bold">Integrantes</h2><div className="mt-5 space-y-2">{(work.members || []).map((member) => <div key={member.id} className="rounded-xl bg-[color:var(--background)] p-3"><p className="text-sm font-bold">{member.name}</p><p className="text-xs text-[color:var(--on-surface-variant)]">{member.email || "Convite local"} · {member.role}</p></div>)}</div><input className="mt-4" value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Nome do integrante" /><input className="mt-2" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="E-mail para convite futuro" /><button className="mt-2 rounded-xl px-4 py-2 text-sm font-bold text-[color:var(--primary)] neo-inset" onClick={() => { if (!memberName.trim()) return; append("members", { id: `member-${Date.now()}`, name: memberName.trim(), email: memberEmail.trim(), role: "member", status: "local" }); setMemberName(""); setMemberEmail(""); }}>Adicionar integrante</button></section><section className="rounded-[2rem] p-6 neo-raised"><h2 className="font-bold">Chat e decisões</h2><div className="mt-4 max-h-44 space-y-2 overflow-y-auto">{(work.messages || []).map((item) => <div key={item.id} className="rounded-xl bg-[color:var(--background)] p-3 text-sm"><b>{item.author}</b><p className="mt-1">{item.text}</p></div>)}</div><div className="mt-4 flex gap-2"><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem local para o grupo" /><button className="rounded-xl px-3 neo-inset" onClick={() => { if (!message.trim()) return; append("messages", { id: `message-${Date.now()}`, author: "Voce", text: message.trim(), createdAt: Date.now() }); setMessage(""); }}><Icon name="send" /></button></div><textarea className="mt-5 min-h-20" value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Registrar uma decisão importante..." /><button className="mt-2 rounded-xl px-4 py-2 text-sm font-bold text-[color:var(--primary)] neo-inset" onClick={() => { if (!decision.trim()) return; append("decisions", { id: `decision-${Date.now()}`, text: decision.trim(), author: "Voce", createdAt: Date.now() }); setDecision(""); }}>Registrar decisão</button></section></div>;

  return <main className="work-space flex-1 overflow-y-auto bg-[color:var(--background)] px-6 py-8 md:px-10"><div className="mx-auto max-w-6xl"><button className="flex items-center gap-1 text-sm font-semibold text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]" onClick={() => onNavigate(SCREEN_IDS.MODULE_DETAILS)}><Icon name="arrow_back" /> Voltar ao modulo</button><header className="mt-6 rounded-[2rem] p-7 neo-raised"><div className="flex flex-col justify-between gap-5 md:flex-row"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[color:var(--primary)]">Trabalho · {course.title}</p><input className="mt-2 w-full bg-transparent text-3xl font-black text-[color:var(--on-surface)] outline-none" value={work.title} onChange={(e) => save({ title: e.target.value })} /></div><div className="flex items-center gap-4"><span className="text-3xl font-black text-[color:var(--primary)]">{work.progress || 0}%</span><Icon className="text-4xl text-[color:var(--primary)]" name="group_work" /></div></div></header><nav className="mt-6 flex gap-2 overflow-x-auto pb-1">{TABS.map((item) => <button key={item.id} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === item.id ? "bg-[color:var(--primary)] text-white" : "neo-raised text-[color:var(--on-surface-variant)]"}`} onClick={() => setTab(item.id)}><Icon name={item.icon} />{item.label}</button>)}</nav><div className="mt-6">{tab === "overview" ? overview : tab === "writing" ? writingTab : tab === "presentation" ? presentationTab : groupTab}</div></div></main>;
}

function Field({ label, children }) { return <label className="block text-xs font-bold uppercase tracking-wide text-[color:var(--on-surface-variant)]">{label}<div className="mt-2 [&_input]:w-full [&_input]:rounded-xl [&_input]:bg-[color:var(--background)] [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm [&_select]:w-full [&_select]:rounded-xl [&_select]:bg-[color:var(--background)] [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-sm">{children}</div></label>; }
