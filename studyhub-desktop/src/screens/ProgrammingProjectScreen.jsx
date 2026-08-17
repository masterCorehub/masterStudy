import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { ProgrammingProjectPanel } from "../components/ProgrammingProjectPanel";

export function ProgrammingProjectScreen({ onNavigate }) {
  const activeCourseId = useStudyStore((state) => state.activeCourseId);
  const activeModuleId = useStudyStore((state) => state.activeModuleId);
  const activeWorkId = useStudyStore((state) => state.activeWorkId);
  const courses = useStudyStore((state) => state.courses);
  const updateWork = useStudyStore((state) => state.updateWork);
  const course = courses.find((item) => item.id === activeCourseId);
  const module = course?.modules?.find((item) => item.id === activeModuleId);
  const project = module?.works?.find((item) => item.id === activeWorkId);

  if (!course || !module || !project) return <main className="flex flex-1 items-center justify-center bg-[color:var(--background)]"><button onClick={() => onNavigate(SCREEN_IDS.MODULE_DETAILS)} className="rounded-xl px-5 py-3 neo-raised">Voltar ao módulo</button></main>;
  const save = (updates) => updateWork(course.id, module.id, project.id, updates);
  const milestones = project.programming?.milestones || [];
  const completed = milestones.filter((item) => item.completed).length;
  const calculatedProgress = milestones.length ? Math.round((completed / milestones.length) * 100) : project.progress || 0;

  return <main className="flex-1 overflow-y-auto bg-[color:var(--background)] px-6 py-8 md:px-10"><div className="mx-auto max-w-6xl"><button onClick={() => onNavigate(SCREEN_IDS.MODULE_DETAILS)} className="flex items-center gap-2 text-sm font-bold text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"><Icon name="arrow_back" /> Voltar ao módulo</button><header className="mt-6 overflow-hidden rounded-[2rem] neo-raised"><div className="grid lg:grid-cols-[1fr_280px]"><div className="p-7"><div className="flex items-center gap-2"><span className="rounded-full bg-[color:var(--tertiary)]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[color:var(--tertiary)]">Projeto de programação</span><span className="text-xs text-[color:var(--on-surface-variant)]">{course.title} · {module.title}</span></div><input value={project.title} onChange={(event) => save({ title: event.target.value })} className="mt-4 w-full bg-transparent text-3xl font-black outline-none" /><textarea value={project.description || ""} onChange={(event) => save({ description: event.target.value })} className="mt-3 min-h-20 w-full resize-none bg-transparent text-sm leading-6 text-[color:var(--on-surface-variant)] outline-none" placeholder="Problema, público, resultado esperado e critérios de conclusão..." /></div><div className="flex flex-col justify-center bg-[color:var(--tertiary)] p-7 text-white"><p className="text-xs font-black uppercase tracking-[.16em] text-white/65">Progresso técnico</p><p className="mt-2 text-5xl font-black">{calculatedProgress}%</p><p className="mt-2 text-xs text-white/70">{completed} de {milestones.length} milestones concluídos</p><div className="mt-4 h-2 rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${calculatedProgress}%` }} /></div></div></div></header><div className="mt-6"><ProgrammingProjectPanel programming={project.programming || {}} onChange={(programming) => save({ programming, progress: programming.milestones?.length ? Math.round((programming.milestones.filter((item) => item.completed).length / programming.milestones.length) * 100) : project.progress })} /></div></div></main>;
}
