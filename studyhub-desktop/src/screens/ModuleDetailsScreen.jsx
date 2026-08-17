import { useEffect, useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { calculateModuleDuration } from "../utils/timeUtils";
import { AnimatePresence, motion } from "framer-motion";

export function ModuleDetailsScreen({ onNavigate }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const activeCourseId = useStudyStore((state) => state.activeCourseId);
  const activeModuleId = useStudyStore((state) => state.activeModuleId);
  const courses = useStudyStore((state) => state.courses);

  const courseData =
    courses.find((c) => c.id === activeCourseId) ||
    courses.find((course) =>
      (course.modules || []).some((module) => module.id === activeModuleId),
    ) ||
    courses[0];
  const moduleData =
    courseData?.modules?.find((m) => m.id === activeModuleId) ||
    courseData?.modules?.[0];
  const resolvedLocation = useMemo(() => {
    if (courseData?.id && moduleData?.id) {
      return {
        courseId: courseData.id,
        moduleId: moduleData.id,
      };
    }

    for (const course of courses) {
      const module = (course.modules || []).find(
        (item) => item.id === activeModuleId,
      );
      if (module) {
        return {
          courseId: course.id,
          moduleId: module.id,
        };
      }
    }

    return null;
  }, [activeModuleId, courseData?.id, courses, moduleData?.id]);

  useEffect(() => {
    if (!resolvedLocation) return;

    const store = useStudyStore.getState();
    if (activeCourseId !== resolvedLocation.courseId) {
      store.setActiveCourse(resolvedLocation.courseId);
    }
    if (activeModuleId !== resolvedLocation.moduleId) {
      store.setActiveModule(resolvedLocation.moduleId);
    }
  }, [activeCourseId, activeModuleId, resolvedLocation]);

  if (!courseData || !moduleData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[color:var(--background)]">
        <div className="text-[color:var(--on-surface-variant)] text-center neo-inset p-8 rounded-3xl">
          <Icon className="text-5xl mb-4 text-[color:var(--primary)] opacity-50" name="error_outline" />
          <p className="text-lg">Módulo não encontrado.</p>
          <button 
            className="mt-6 px-6 py-2 bg-[color:var(--surface)] text-[color:var(--primary)] rounded-xl font-medium neo-raised active:neo-inset"
            onClick={() => onNavigate(SCREEN_IDS.MODULES)}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const renderLessonStatus = (status, duration, type) => {
    switch (status) {
      case "completed":
        return <p className="text-xs text-[color:var(--on-surface-variant)] mt-1">{type} • {duration || "Tempo Indefinido"} • Concluído</p>;
      case "current":
        return <p className="text-xs text-[color:var(--primary)] font-semibold mt-1">{type} • {duration || "Tempo Indefinido"}</p>;
      case "locked":
        return <p className="text-xs text-[color:var(--outline)] mt-1 flex items-center gap-1"><Icon className="text-[14px]" name="lock" /> Bloqueado</p>;
      default:
        return <p className="text-xs text-[color:var(--on-surface-variant)] mt-1">{type} • {duration || "Tempo Indefinido"}</p>;
    }
  };

  const renderLessonIcon = (status, type, lessonId, moduleId) => {
    let iconName = "article";
    if (type === "Vídeo") iconName = "play_circle";
    else if (type === "Áudio") iconName = "headphones";
    else if (type === "Exercício") iconName = "quiz";

    const toggleStatus = (e) => {
      e.stopPropagation();
      useStudyStore.getState().toggleLessonComplete(courseData.id, moduleId, lessonId);
    };

    if (status === "completed") {
      return (
        <div 
           className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 neo-pressed bg-[color:var(--surface)] cursor-pointer hover:bg-[color:var(--background)] transition-colors"
           onClick={toggleStatus}
           title="Desmarcar Aula"
        >
          <Icon className="text-lg text-[color:var(--primary)]" name="check_circle" />
        </div>
      );
    }
    
    return (
      <div 
         className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
           status === "current" ? "neo-raised text-[color:var(--primary)] bg-[color:var(--surface)]" : "neo-pressed bg-[color:var(--background)] text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] hover:neo-raised"
         }`}
         onClick={toggleStatus}
         title="Marcar como Concluída"
      >
        <Icon className="text-lg" name={iconName} />
      </div>
    );
  };

  const completedLessons = (moduleData.lessons || []).filter(l => l.status === "completed").length;
  const totalLessons = (moduleData.lessons || []).length;
  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <main className="flex-1 overflow-y-auto p-6 md:p-8 scroll-smooth screen-fade-in bg-[color:var(--background)]">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <button className="flex items-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] text-sm font-medium transition-colors group" type="button" onClick={() => onNavigate && onNavigate(SCREEN_IDS.MODULES)}>
            <Icon className="text-lg mr-1 group-hover:-translate-x-1 transition-transform" name="arrow_back" />
            Voltar para o Curso
          </button>
          
          <div className="flex items-center gap-3">
             <button
               className="px-4 py-2 bg-[color:var(--primary)] text-white text-sm font-semibold rounded-lg shadow-lg shadow-[color:var(--primary)]/20 transition-opacity hover:opacity-90 flex items-center gap-2"
               onClick={() => {
                 const store = useStudyStore.getState();
                 const workId = `work-${Date.now()}`;
                 store.setActiveCourse(courseData.id);
                 store.setActiveModule(moduleData.id);
                 store.addWork(courseData.id, moduleData.id, { id: workId });
                 store.setActiveWork(workId);
                 onNavigate?.(SCREEN_IDS.WORKSPACE);
               }}
             >
               <Icon name="group_work" className="text-base" /> Novo trabalho
             </button>
             <button
               className="px-4 py-2 bg-[color:var(--tertiary)] text-white text-sm font-semibold rounded-lg shadow-lg shadow-[color:var(--tertiary)]/20 transition-opacity hover:opacity-90 flex items-center gap-2"
               onClick={() => {
                 const store = useStudyStore.getState();
                 const workId = `work-${Date.now()}`;
                 store.setActiveCourse(courseData.id);
                 store.setActiveModule(moduleData.id);
                 store.addWork(courseData.id, moduleData.id, {
                   id: workId,
                   title: "Novo projeto de programação",
                   type: "Projeto de Programação",
                   projectKind: "programming",
                   description: "Defina o problema, o resultado esperado e os critérios de conclusão.",
                   programming: {
                     language: "C#",
                     framework: ".NET",
                     repositoryPath: "",
                     runCommand: "dotnet run",
                     testCommand: "dotnet test",
                     architectureNotes: "",
                     milestones: [
                       { id: `milestone-${Date.now()}-1`, title: "Planejar estrutura", completed: false },
                       { id: `milestone-${Date.now()}-2`, title: "Criar primeira versão funcional", completed: false },
                       { id: `milestone-${Date.now()}-3`, title: "Adicionar testes e documentação", completed: false },
                     ],
                     bugs: [],
                   },
                 });
                 store.setActiveWork(workId);
                 onNavigate?.(SCREEN_IDS.PROGRAMMING_PROJECT);
               }}
             >
               <Icon name="terminal" className="text-base" /> Projeto dev
             </button>
             <button 
               className="px-4 py-2 bg-[color:var(--surface)] text-[color:var(--primary)] text-sm font-semibold rounded-lg neo-raised hover:neo-inset transition-all flex items-center gap-2"
               onClick={() => {
                 if (onNavigate) {
                   onNavigate(SCREEN_IDS.ADD_LESSON);
                 }
               }}
             >
               <Icon name="add" className="text-base" /> Adicionar Aula
             </button>
          </div>
        </div>

        <div className="neo-raised p-8 rounded-[1.5rem] relative overflow-hidden bg-[color:var(--surface)]">
          <div className="absolute right-0 top-0 w-64 h-64 bg-[color:var(--primary)]/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="flex flex-col md:flex-row gap-6 items-start relative z-10">
            <div className="w-20 h-20 shrink-0 rounded-2xl neo-pressed p-4 flex items-center justify-center text-[color:var(--primary)]">
              <Icon className="text-[3rem]" name="folder_open" />
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-center space-x-3 mb-2">
                <span className="px-3 py-1 rounded-full neo-raised-sm text-xs font-semibold text-[color:var(--on-surface-variant)] uppercase tracking-wide">{courseData.title}</span>
                <span className="px-3 py-1 rounded-full neo-inset text-xs font-semibold text-[color:var(--primary)] uppercase tracking-wide flex items-center gap-1">
                  <Icon name="schedule" className="text-[14px]" />
                  {calculateModuleDuration(moduleData.lessons)}
                </span>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <h2 className="text-3xl font-bold text-[color:var(--on-surface)] tracking-tight">{moduleData.title}</h2>
                <button 
                  onClick={() => { setEditTitle(moduleData.title); setEditDesc(moduleData.description || ""); setShowEditModal(true); }}
                  className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center neo-pressed text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] transition-colors"
                >
                  <Icon name="edit" className="text-[18px]" />
                </button>
              </div>
              {moduleData.description && <p className="text-[color:var(--on-surface-variant)] mb-4 leading-relaxed">{moduleData.description}</p>}
              
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex-1 w-full">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-semibold text-[color:var(--on-surface)]">Progresso do Módulo ({completedLessons}/{totalLessons})</span>
                    <span className="text-lg font-bold text-[color:var(--primary)]">{progress}%</span>
                  </div>
                  <div className="h-4 w-full rounded-full neo-pressed overflow-hidden p-[2px]">
                    <div className="h-full bg-[color:var(--primary)] rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {(moduleData.works || []).length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xl font-bold text-[color:var(--on-surface)]">Trabalhos</h3>
                <span className="rounded-full bg-[color:var(--primary)]/10 px-3 py-1 text-xs font-bold text-[color:var(--primary)]">{moduleData.works.length}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {moduleData.works.map((work) => (
                  <button key={work.id} className="rounded-[1.5rem] p-5 text-left neo-raised transition-transform hover:-translate-y-0.5" onClick={() => { useStudyStore.getState().setActiveWork(work.id); onNavigate?.(work.projectKind === "programming" ? SCREEN_IDS.PROGRAMMING_PROJECT : SCREEN_IDS.WORKSPACE); }}>
                    <div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--primary)]/10 text-[color:var(--primary)]"><Icon name="group_work" /></span><span className="text-xs font-bold text-[color:var(--on-surface-variant)]">{work.dueDate || "Sem prazo"}</span></div>
                    <p className="mt-4 truncate font-bold text-[color:var(--on-surface)]">{work.title}</p>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">{(work.members || []).length} integrantes · {(work.tasks || []).filter((task) => task.completed).length}/{(work.tasks || []).length} atividades</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <h3 className="text-xl font-bold text-[color:var(--on-surface)] px-2">Conteúdo do Módulo</h3>
          
          {(() => {
            const moduleDecks = useStudyStore.getState().flashcardDecks.filter(d => d.sourceModuleId === activeModuleId);
            const totalCards = moduleDecks.reduce((acc, deck) => acc + (deck.cards ? deck.cards.length : 0), 0);
            
            if (moduleDecks.length > 0) {
              return (
                <div className="neo-raised p-6 rounded-[1.5rem] bg-gradient-to-r from-[color:var(--primary)]/10 to-transparent flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl neo-inset bg-[color:var(--surface)] text-[color:var(--tertiary)] flex items-center justify-center shrink-0">
                      <Icon className="text-3xl" name="style" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg text-[color:var(--on-surface)]">Flashcards do Módulo</h4>
                      <p className="text-sm text-[color:var(--on-surface-variant)]">{moduleDecks.length} {moduleDecks.length === 1 ? 'baralho' : 'baralhos'} • {totalCards} {totalCards === 1 ? 'cartão' : 'cartões'}</p>
                    </div>
                  </div>
                  <button 
                    className="px-6 py-3 neo-raised-sm bg-[color:var(--surface)] text-[color:var(--primary)] font-semibold text-sm rounded-xl hover:neo-inset transition-all"
                    type="button" 
                    onClick={() => {
                      if (moduleDecks.length === 1) {
                         useStudyStore.getState().setActiveDeck(moduleDecks[0].id);
                         onNavigate(SCREEN_IDS.FLASHCARDS);
                      } else {
                         // If there are multiple, just go to flashcards screen to see them all
                         onNavigate(SCREEN_IDS.FLASHCARDS);
                      }
                    }}
                  >
                    Revisar Agora
                  </button>
                </div>
              );
            }
            return null;
          })()}
          
          <div className="neo-raised p-2 rounded-[1.5rem] bg-[color:var(--surface)]">
            {!moduleData.lessons || moduleData.lessons.length === 0 ? (
              <div className="text-center text-[color:var(--on-surface-variant)] py-8 text-sm neo-inset rounded-2xl m-4">
                Nenhuma aula adicionada a este módulo ainda.
              </div>
            ) : (
              moduleData.lessons.map((lesson) => {
                const isCurrent = lesson.status === "current";
                const isPendingOrLocked = lesson.status === "pending" || lesson.status === "locked";
                
                const itemContent = (
                  <div 
                    className={`p-4 rounded-2xl flex items-center gap-4 transition-transform cursor-pointer group/lesson ${
                      isCurrent ? "bg-[color:var(--background)] relative overflow-hidden" : 
                      isPendingOrLocked ? "opacity-75 hover:opacity-100" : "hover:-translate-y-1"
                    } ${!isCurrent ? "hover:bg-[color:var(--background)] transition-colors" : ""}`}
                    onClick={() => {
                      if (onNavigate && (isCurrent || lesson.status === "completed" || lesson.status === "pending")) {
                        useStudyStore.getState().setActiveLesson(lesson.id);
                        onNavigate(SCREEN_IDS.LESSON);
                      }
                    }}
                  >
                    {isCurrent && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[color:var(--primary)] rounded-l-xl"></div>}
                    
                    {renderLessonIcon(lesson.status, lesson.kindLabel, lesson.id, moduleData.id)}
                    
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-base ${isCurrent ? "font-semibold text-[color:var(--primary)]" : "font-medium text-[color:var(--on-surface)]"} truncate`}>
                        {lesson.title}
                      </h4>
                      {renderLessonStatus(lesson.status, lesson.durationLabel, lesson.kindLabel)}
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                         className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:text-red-700 opacity-0 group-hover/lesson:opacity-100 transition-opacity shrink-0 bg-[color:var(--surface)] neo-pressed"
                         onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Tem certeza que deseja excluir a aula "${lesson.title}"?`)) {
                              useStudyStore.getState().deleteLesson(courseData.id, moduleData.id, lesson.id);
                            }
                         }}
                         title="Excluir Aula"
                      >
                         <Icon name="delete" />
                      </button>
                      {isCurrent && (
                        <button className="hidden sm:flex w-10 h-10 rounded-full neo-raised-sm items-center justify-center text-[color:var(--primary)] hover:text-[color:var(--tertiary)] shrink-0" type="button">
                          <Icon name="arrow_forward" />
                        </button>
                      )}
                    </div>
                  </div>
                );

                if (isCurrent) {
                  return (
                    <div key={lesson.id} className="neo-inset p-1 rounded-2xl m-2 bg-gradient-to-r from-[color:var(--primary)]/10 to-transparent">
                      {itemContent}
                    </div>
                  );
                }

                return <div key={lesson.id} className="m-2">{itemContent}</div>;
              })
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="neo-raised p-8 rounded-[2rem] w-full max-w-md bg-[color:var(--surface)]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[color:var(--on-surface)] flex items-center gap-2">
                  <Icon name="edit" className="text-[color:var(--primary)]" /> Editar Módulo
                </h3>
                <button onClick={() => setShowEditModal(false)} className="w-10 h-10 rounded-full neo-inset flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-red-500 transition-colors">
                  <Icon name="close" />
                </button>
              </div>
              
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2 block">Título do Módulo</label>
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full neo-inset p-4 rounded-xl bg-transparent outline-none text-[color:var(--on-surface)]" autoFocus />
                </div>
                <div>
                  <label className="text-xs font-bold text-[color:var(--on-surface-variant)] uppercase tracking-wider mb-2 block">Descrição (Opcional)</label>
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows="3" className="w-full neo-inset p-4 rounded-xl bg-transparent outline-none text-[color:var(--on-surface)] resize-none" placeholder="Adicione detalhes sobre o que será aprendido..."></textarea>
                </div>
                
                <button 
                  onClick={() => {
                    useStudyStore.getState().updateModule(activeCourseId, activeModuleId, { title: editTitle || "Módulo Sem Título", description: editDesc });
                    setShowEditModal(false);
                  }}
                  className="mt-4 py-4 rounded-xl neo-raised text-[color:var(--primary)] font-bold flex items-center justify-center gap-2 hover:neo-inset transition-all"
                >
                  <Icon name="save" /> Salvar Alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
