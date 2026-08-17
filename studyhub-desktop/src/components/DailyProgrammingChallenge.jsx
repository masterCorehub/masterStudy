import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "../ui/Icon";
import { getDailyProgrammingChallenge, getProgrammingDayKey, useProgrammingStore } from "../store/useProgrammingStore";
import { useStudyStore } from "../store/useStore";

export function DailyProgrammingChallenge({ onNavigate }) {
  const challenge = getDailyProgrammingChallenge();
  const store = useProgrammingStore();
  const addTask = useStudyStore((state) => state.addTask);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const completed = store.completions[getProgrammingDayKey()]?.challengeId === challenge.id;
  const draft = store.drafts[challenge.id] || "";

  const createPracticeTask = () => {
    addTask({ title: `Desafio: ${challenge.title}`, description: challenge.prompt, type: "programming", category: "Programação", priority: "medium", estimatedPomodoros: 1 });
    onNavigate?.("tasks");
  };

  return <>
    <section className="mb-12 overflow-hidden rounded-[30px] neo-raised">
      <div className="grid md:grid-cols-[1fr_260px]">
        <div className="p-7"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[color:var(--primary)]">Desafio diário</span><span className="rounded-full bg-[color:var(--background)] px-3 py-1 text-[10px] font-bold text-[color:var(--on-surface-variant)]">{challenge.language} · {challenge.level}</span>{completed ? <span className="rounded-full bg-green-500/10 px-3 py-1 text-[10px] font-black text-green-600">Concluído hoje</span> : null}</div><h3 className="mt-4 text-2xl font-black text-[color:var(--on-surface)]">{challenge.title}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)]">{challenge.prompt}</p><div className="mt-5 flex flex-wrap gap-3"><button onClick={() => setOpen(true)} className="rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-black text-white"><Icon name="code" /> {completed ? "Rever solução" : "Resolver agora"}</button><button onClick={createPracticeTask} className="rounded-xl px-5 py-3 text-sm font-black text-[color:var(--primary)] neo-inset"><Icon name="add_task" /> Levar para tarefas</button></div></div>
        <div className="flex flex-col justify-center bg-[color:var(--primary)] p-7 text-white"><Icon name="lightbulb" className="text-4xl text-white/80" /><p className="mt-4 text-xs font-black uppercase tracking-[.18em] text-white/60">Conceito de hoje</p><p className="mt-2 text-xl font-black">{challenge.concept}</p><p className="mt-3 text-xs leading-5 text-white/70">Pratique por 20–30 minutos. Registre o raciocínio, não apenas o código final.</p></div>
      </div>
    </section>
    <AnimatePresence>{open ? <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"><motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-[color:var(--surface)] p-7 neo-raised"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--primary)]">{challenge.language} · desafio diário</p><h2 className="mt-2 text-2xl font-black">{challenge.title}</h2></div><button onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full neo-inset"><Icon name="close" /></button></div><p className="mt-5 rounded-2xl bg-[color:var(--background)] p-5 text-sm leading-7">{challenge.prompt}</p><div className="mt-4 rounded-2xl p-4 neo-inset"><p className="text-xs font-black uppercase text-[color:var(--on-surface-variant)]">Exemplo</p><p className="mt-2 font-mono text-sm">{challenge.example}</p></div><button onClick={() => setHint((value) => !value)} className="mt-4 text-sm font-black text-[color:var(--primary)]"><Icon name="tips_and_updates" /> {hint ? "Ocultar dica" : "Ver uma dica"}</button>{hint ? <p className="mt-3 rounded-xl bg-yellow-500/10 p-4 text-sm leading-6">{challenge.hint}</p> : null}<label className="mt-6 block text-xs font-black uppercase tracking-wide text-[color:var(--on-surface-variant)]">Sua solução e raciocínio<textarea value={draft} onChange={(event) => store.saveDraft(challenge.id, event.target.value)} className="mt-2 min-h-60 w-full rounded-2xl bg-[color:var(--background)] p-4 font-mono text-sm outline-none neo-inset" placeholder="Escreva código, pseudocódigo ou explique sua estratégia..." /></label><div className="mt-5 flex justify-end gap-3"><button onClick={() => setOpen(false)} className="rounded-xl px-5 py-3 text-sm font-bold neo-inset">Salvar rascunho</button><button onClick={() => { store.completeChallenge(challenge.id, draft); setOpen(false); }} className="rounded-xl bg-green-600 px-5 py-3 text-sm font-black text-white"><Icon name="check_circle" /> Marcar como concluído</button></div></motion.div></div> : null}</AnimatePresence>
  </>;
}
