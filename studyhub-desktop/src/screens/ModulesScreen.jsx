import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { motion } from "framer-motion";
import { useState } from "react";
import { SmartImporter } from "../components/SmartImporter";
import { calculateModuleDuration } from "../utils/timeUtils";
import { ShareModal } from "../components/ShareModal";

export function ModulesScreen({ onNavigate }) {
  const activeCourseId = useStudyStore(state => state.activeCourseId);
  const courses = useStudyStore(state => state.courses);
  const setActiveModule = useStudyStore(state => state.setActiveModule);
  const collaboration = useStudyStore(state => state.collaboration || {});
  const [showPeople, setShowPeople] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  const courseData = courses.find(c => c.id === activeCourseId) || courses[0];
  
  if (!courseData) {
    return (
      <main className="flex-1 overflow-y-auto p-6 md:p-8 flex items-center justify-center screen-fade-in bg-[color:var(--background)]">
        <div className="neo-inset p-10 flex flex-col items-center justify-center rounded-[32px] text-center max-w-md w-full">
          <Icon className="text-5xl text-[color:var(--outline)] mb-4" name="view_module" />
          <h4 className="text-xl font-bold text-[color:var(--on-surface)] mb-2">Nenhum curso selecionado</h4>
          <p className="text-[color:var(--on-surface-variant)] mb-6">Volte ao Dashboard e selecione um curso para começar.</p>
          <button 
            className="px-6 py-3 bg-[color:var(--surface)] text-[color:var(--primary)] font-bold rounded-xl neo-raised hover:neo-inset transition-all"
            onClick={() => onNavigate && onNavigate(SCREEN_IDS.DASHBOARD)}
          >
            Voltar ao Dashboard
          </button>
        </div>
      </main>
    );
  }

  const { tutor, stats, tools } = courseData;
  const courseInvitations = (collaboration.invitations || []).filter(
    (invite) =>
      invite.entityType === "course" &&
      String(invite.entityId) === String(courseData.id),
  );

  const toggleLessonComplete = useStudyStore(state => state.toggleLessonComplete);

  const renderLessonStatus = (status, duration, kindLabel) => {
    const timeDisplay = duration || "Tempo Indefinido";
    switch (status) {
      case "completed":
        return (
          <div className="flex items-center text-xs text-[color:var(--on-surface-variant)] mt-1 space-x-3">
            <span className="flex items-center"><Icon className="text-[14px] mr-1" name={kindLabel === "Vídeo" ? "smart_display" : "description"} /> {kindLabel} • {timeDisplay}</span>
            <span className="flex items-center text-[color:var(--primary)] font-medium"><Icon className="text-[14px] mr-1" name="done" /> Concluído</span>
          </div>
        );
      case "current":
        return (
          <div className="flex items-center text-xs text-[color:var(--on-surface-variant)] mt-1 space-x-3">
            <span className="flex items-center"><Icon className="text-[14px] mr-1" name={kindLabel === "Vídeo" ? "smart_display" : "description"} /> {kindLabel} • {timeDisplay}</span>
            <span className="flex items-center text-[color:var(--tertiary)] font-medium">Em andamento</span>
          </div>
        );
      case "pending":
        return (
          <div className="flex items-center text-xs text-[color:var(--on-surface-variant)] mt-1 space-x-3">
            <span className="flex items-center"><Icon className="text-[14px] mr-1" name={kindLabel === "Vídeo" ? "smart_display" : "description"} /> {kindLabel} • {timeDisplay}</span>
            <span className="flex items-center">Pendente</span>
          </div>
        );
      case "locked":
        return (
          <div className="flex items-center text-xs text-[color:var(--on-surface-variant)] mt-1 space-x-3">
            <span className="flex items-center"><Icon className="text-[14px] mr-1" name={kindLabel === "Vídeo" ? "smart_display" : "description"} /> {kindLabel} • {timeDisplay}</span>
            <span className="flex items-center">Bloqueado</span>
          </div>
        );
      default:
        return null;
    }
  };

  const renderLessonIcon = (status, kindLabel, lessonId, moduleId) => {
    const handleToggle = (e) => {
      e.stopPropagation();
      toggleLessonComplete(activeCourseId, moduleId, lessonId);
    };

    switch (status) {
      case "completed":
        return (
          <button 
            className="w-12 h-12 rounded-xl neo-pressed flex items-center justify-center text-[color:var(--primary)] shrink-0 hover:text-red-500 hover:scale-105 transition-all"
            onClick={handleToggle}
            title="Desmarcar como concluída"
          >
            <Icon className="text-[24px]" filled name="check_circle" />
          </button>
        );
      case "current":
        return (
          <button 
            className="w-12 h-12 rounded-xl neo-pressed flex items-center justify-center text-[color:var(--primary)] shrink-0 ml-2 hover:text-green-500 hover:scale-105 transition-all"
            onClick={handleToggle}
            title="Marcar como concluída"
          >
            <Icon className="text-[24px]" name="play_arrow" />
          </button>
        );
      case "pending":
        return (
          <button 
            className="w-12 h-12 rounded-xl neo-pressed flex items-center justify-center text-[color:var(--on-surface-variant)] shrink-0 hover:text-green-500 hover:scale-105 transition-all"
            onClick={handleToggle}
            title="Marcar como concluída"
          >
            <Icon className="text-[24px]" name={kindLabel === "Vídeo" ? "smart_display" : "picture_as_pdf"} />
          </button>
        );
      case "locked":
        return (
          <div className="w-12 h-12 rounded-xl neo-pressed flex items-center justify-center text-[color:var(--on-surface-variant)] shrink-0">
            <Icon className="text-[24px]" name="lock" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-6 md:p-8 scroll-smooth screen-fade-in bg-[color:var(--background)]">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <button className="flex items-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)] text-sm font-medium transition-colors group" type="button" onClick={() => onNavigate && onNavigate(SCREEN_IDS.DASHBOARD)}>
            <Icon className="text-lg mr-1 group-hover:-translate-x-1 transition-transform" name="arrow_back" />
            Voltar para Meus Cursos
          </button>
          
          <div className="flex items-center gap-3">
             <button
               className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
                 showPeople
                   ? "bg-[color:var(--primary)] text-white shadow-md"
                   : "bg-[color:var(--surface)] text-[color:var(--primary)] neo-raised hover:neo-inset"
               }`}
               type="button"
               onClick={() => setShowPeople((value) => !value)}
             >
               <Icon name="group" className="text-base" />
               Pessoas
               {courseInvitations.length ? <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px]">{courseInvitations.length}</span> : null}
             </button>
             <button 
               className="px-4 py-2 bg-[color:var(--surface)] text-[color:var(--primary)] text-sm font-semibold rounded-lg neo-raised hover:neo-inset transition-all flex items-center gap-2"
               onClick={() => {
                 if (onNavigate) {
                   onNavigate(SCREEN_IDS.CREATE_MODULE);
                 }
               }}
             >
               <Icon name="add" className="text-base" /> Módulo Manual
             </button>
             <SmartImporter 
                buttonLabel="Importar Módulo (Auto)" 
                className="!text-sm !py-2 !px-4" 
                targetCourseTitle={courseData.title} 
             />
          </div>
        </div>

        {showPeople ? (
          <section className="rounded-[1.5rem] border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)] p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--primary)]">Colaboração do curso</p>
                <h3 className="mt-1 text-xl font-black text-[color:var(--on-surface)]">Pessoas com acesso</h3>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Compartilhe módulos, aulas e a estrutura atual do curso.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[color:var(--primary)] px-4 text-xs font-black text-white shadow-md"
              >
                <Icon name="person_add" />
                Convidar pessoa
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <article className="flex items-center gap-3 rounded-2xl border border-[color:var(--primary)]/20 bg-[color:var(--primary)]/5 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--primary)] font-black text-white">V</span>
                <span className="min-w-0"><strong className="block text-sm text-[color:var(--on-surface)]">Você</strong><small className="text-xs text-[color:var(--on-surface-variant)]">Proprietário</small></span>
              </article>
              {courseInvitations.map((invite) => (
                <article key={invite.id} className={`flex items-center gap-3 rounded-2xl border border-[color:var(--outline-variant)]/30 p-4 ${invite.status === "revoked" ? "opacity-50" : ""}`}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--surface-container-high)] font-black text-[color:var(--primary)]">{String(invite.email || "?")[0].toUpperCase()}</span>
                  <span className="min-w-0"><strong className="block truncate text-sm text-[color:var(--on-surface)]">{invite.email}</strong><small className="text-xs text-[color:var(--on-surface-variant)]">{invite.permission === "editor" ? "Editor" : invite.permission === "commenter" ? "Comentador" : "Leitor"} · {invite.status === "revoked" ? "Revogado" : "Pendente"}</small></span>
                </article>
              ))}
              {!courseInvitations.length ? <div className="flex items-center justify-center rounded-2xl border border-dashed border-[color:var(--outline-variant)] p-4 text-xs text-[color:var(--on-surface-variant)]">Nenhuma pessoa convidada ainda.</div> : null}
            </div>
          </section>
        ) : null}

        <div className="mb-8 w-full">
          <div className="w-full neo-raised p-8 flex flex-col justify-between relative overflow-hidden rounded-[1.5rem]">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-[color:var(--primary)]/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="flex flex-col md:flex-row gap-6 items-start relative z-10">
              <div className="w-24 h-24 shrink-0 rounded-2xl neo-pressed p-4 flex items-center justify-center text-[color:var(--primary)]">
                <Icon className="text-[3rem]" name="school" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="px-3 py-1 rounded-full neo-raised-sm text-xs font-semibold text-[color:var(--tertiary)] uppercase tracking-wide">Curso Completo</span>
                </div>
                <h2 className="text-3xl font-bold text-[color:var(--on-surface)] mb-3 tracking-tight">{courseData.title}</h2>
                <p className="text-[color:var(--on-surface-variant)] leading-relaxed text-sm max-w-2xl">
                  {courseData.subtitle || "Aprimore seus conhecimentos e acompanhe seu progresso aula a aula."}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
              <div className="flex-1 w-full">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-semibold text-[color:var(--on-surface)]">Progresso do Curso</span>
                  <span className="text-lg font-bold text-[color:var(--primary)]">{courseData.progress}%</span>
                </div>
                <div className="h-4 w-full rounded-full neo-pressed overflow-hidden p-[2px]">
                  <div className="h-full bg-[color:var(--primary)] rounded-full" style={{ width: `${courseData.progress}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
          <div className="lg:col-span-2 space-y-8">
            
            {!courseData.modules || courseData.modules.length === 0 ? (
              <div className="text-center text-[color:var(--on-surface-variant)] py-8 text-sm neo-inset rounded-2xl">
                Nenhum módulo adicionado a este curso ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {courseData.modules.map((moduleData) => {
                  const completedLessons = (moduleData.lessons || []).filter(l => l.status === "completed").length;
                  const totalLessons = (moduleData.lessons || []).length;
                  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
                  
                  return (
                    <div 
                      key={moduleData.id} 
                      className="bg-[color:var(--surface)] neo-raised p-6 rounded-2xl cursor-pointer hover:-translate-y-1 transition-transform group flex flex-col h-full"
                      onClick={() => {
                        useStudyStore.getState().setActiveModule(moduleData.id);
                        if (onNavigate) onNavigate(SCREEN_IDS.MODULE_DETAILS);
                      }}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 rounded-xl bg-[color:var(--background)] neo-inset flex items-center justify-center text-[color:var(--primary)]">
                          <Icon name="folder_open" className="text-2xl" />
                        </div>
                        <button 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:text-red-700 bg-[color:var(--background)] opacity-0 group-hover:opacity-100 neo-pressed active:scale-95 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Tem certeza que deseja excluir o módulo "${moduleData.title}" e todas as suas aulas?`)) {
                              useStudyStore.getState().deleteModule(courseData.id, moduleData.id);
                            }
                          }}
                          title="Excluir Módulo"
                        >
                           <Icon name="delete" />
                        </button>
                      </div>
                      <div className="flex-1 flex flex-col">
                        <h3 className="text-xl font-bold text-[color:var(--on-surface)] tracking-tight mb-1">{moduleData.title}</h3>
                        {moduleData.description && <p className="text-sm text-[color:var(--on-surface-variant)] line-clamp-2 mb-2">{moduleData.description}</p>}
                      </div>
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-1 text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium text-[color:var(--on-surface-variant)]">{completedLessons} de {totalLessons} aulas</span>
                            <span className="text-xs text-[color:var(--outline)] mt-0.5 flex items-center gap-1">
                              <Icon name="schedule" className="text-[12px]" /> 
                              {calculateModuleDuration(moduleData.lessons)}
                            </span>
                          </div>
                          <span className="font-bold text-[color:var(--primary)]">{progress}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[color:var(--background)] overflow-hidden neo-inset p-[1px]">
                          <div className="h-full bg-[color:var(--primary)] rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-bold text-[color:var(--on-surface)] px-2">Ferramentas do Curso</h3>
            
            {(() => {
              const courseDecks = useStudyStore.getState().flashcardDecks.filter(d => d.sourceCourseId === activeCourseId);
              const totalCards = courseDecks.reduce((acc, deck) => acc + (deck.cards ? deck.cards.length : 0), 0);
              
              const now = Date.now();
              const cardsToReview = courseDecks.reduce((acc, deck) => {
                if (!deck.cards) return acc;
                return acc + deck.cards.filter(c => !c.dueDate || c.dueDate <= now).length;
              }, 0);

              if (courseDecks.length > 0) {
                return (
                  <div className="neo-raised p-6 rounded-[1.5rem] bg-gradient-to-br from-[color:var(--primary)]/10 to-transparent flex flex-col h-auto">
                    <div className="flex items-center space-x-3 mb-4 text-[color:var(--primary)]">
                      <Icon className="text-2xl" name="style" />
                      <h4 className="font-bold text-lg text-[color:var(--on-surface)]">Flashcards do Curso</h4>
                    </div>
                    <p className="text-sm text-[color:var(--on-surface-variant)] mb-4 flex-1">
                      Você tem {courseDecks.length} {courseDecks.length === 1 ? 'baralho' : 'baralhos'} com um total de {totalCards} {totalCards === 1 ? 'cartão' : 'cartões'}.
                    </p>
                    <div className={`w-full ${cardsToReview > 0 ? 'neo-pressed cursor-pointer' : 'neo-inset opacity-70'} h-32 rounded-xl mb-4 relative overflow-hidden flex flex-col items-center justify-center group`} onClick={() => cardsToReview > 0 && onNavigate && onNavigate(SCREEN_IDS.FLASHCARDS)}>
                      {cardsToReview > 0 && <div className="absolute inset-0 bg-[color:var(--primary)]/5 group-hover:bg-[color:var(--primary)]/10 transition-colors"></div>}
                      <Icon className={`text-4xl ${cardsToReview > 0 ? 'text-[color:var(--primary)]/60 group-hover:scale-110' : 'text-[color:var(--outline)]'} transition-transform mb-2`} name={cardsToReview > 0 ? "flip" : "done_all"} />
                      <span className={`font-bold ${cardsToReview > 0 ? 'text-[color:var(--primary)]' : 'text-[color:var(--outline)]'} text-sm z-10`}>
                        {cardsToReview > 0 ? `${cardsToReview} para revisar hoje` : 'Tudo revisado!'}
                      </span>
                    </div>
                    {cardsToReview > 0 && (
                      <button 
                        className="w-full py-3 neo-raised-sm bg-[color:var(--surface)] text-[color:var(--primary)] font-semibold text-sm rounded-xl hover:neo-inset transition-all" 
                        type="button" 
                        onClick={() => onNavigate && onNavigate(SCREEN_IDS.FLASHCARDS)}
                      >
                        Iniciar Revisão Geral
                      </button>
                    )}
                  </div>
                );
              } else {
                return (
                  <div className="neo-raised p-6 rounded-[1.5rem] flex flex-col h-auto opacity-70">
                    <div className="flex items-center space-x-3 mb-4 text-[color:var(--outline)]">
                      <Icon className="text-2xl" name="style" />
                      <h4 className="font-bold text-lg text-[color:var(--on-surface-variant)]">Flashcards do Curso</h4>
                    </div>
                    <p className="text-sm text-[color:var(--outline)] mb-4 flex-1">
                      Nenhum flashcard criado neste curso ainda. Crie cartões dentro das aulas para vê-los aqui!
                    </p>
                    <button 
                      className="w-full py-3 neo-inset text-[color:var(--outline)] font-semibold text-sm rounded-xl cursor-not-allowed" 
                      type="button" 
                    >
                      Iniciar Revisão
                    </button>
                  </div>
                );
              }
            })()}



            {(() => {
              const courseTasks = useStudyStore.getState().tasks?.list?.filter(t => t.courseId === activeCourseId && t.status !== 'completed') || [];
              return (
                 <div className="neo-raised p-6 rounded-[1.5rem] flex flex-col">
                   <div className="flex items-center space-x-3 mb-4 text-[color:var(--primary)]">
                     <Icon className="text-2xl" name="task_alt" />
                     <h4 className="font-bold text-lg text-[color:var(--on-surface)]">Tarefas do Curso</h4>
                   </div>
                   {courseTasks.length > 0 ? (
                     <div className="flex flex-col gap-2 mb-4">
                       {courseTasks.slice(0,3).map(task => (
                          <div key={task.id} className="neo-inset p-3 rounded-xl flex items-center gap-3">
                             <div className={`w-2 h-2 rounded-full ${task.status === 'in_progress' ? 'bg-[color:var(--primary)]' : 'bg-[color:var(--outline)]'}`}></div>
                             <span className="text-sm font-bold text-[color:var(--on-surface)] line-clamp-1 flex-1">{task.title}</span>
                          </div>
                       ))}
                       {courseTasks.length > 3 && <span className="text-xs text-[color:var(--primary)] font-bold pl-2">+{courseTasks.length - 3} outras pendentes</span>}
                     </div>
                   ) : (
                     <div className="neo-pressed p-4 rounded-xl mb-4 text-sm text-[color:var(--on-surface-variant)] text-center">
                       Nenhuma tarefa pendente neste curso.
                     </div>
                   )}
                   <button onClick={() => onNavigate && onNavigate(SCREEN_IDS.TASKS)} className="w-full py-3 neo-raised-sm text-[color:var(--on-surface)] font-semibold text-sm rounded-xl hover:text-[color:var(--primary)] flex justify-center items-center gap-2" type="button">
                     Abrir Gerenciador de Tarefas
                   </button>
                 </div>
              );
            })()}

          </div>
        </div>
      </div>
      {showShareModal ? (
        <ShareModal
          entityType="course"
          entityId={courseData.id}
          title={courseData.title}
          payload={courseData}
          onClose={() => setShowShareModal(false)}
        />
      ) : null}
    </main>
  );
}
