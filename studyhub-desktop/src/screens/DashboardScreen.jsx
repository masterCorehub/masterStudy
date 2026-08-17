import { useState } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { motion, AnimatePresence } from "framer-motion";
import { SmartImporter } from "../components/SmartImporter";
import { DailyProgrammingChallenge } from "../components/DailyProgrammingChallenge";

export function DashboardScreen({ onNavigate }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dashboardData = useStudyStore(state => state.dashboard);
  const courses = useStudyStore(state => state.courses);
  const tasksList = useStudyStore(state => state.tasks?.list) || [];
  const deleteCourse = useStudyStore(state => state.deleteCourse);
  const setActiveCourse = useStudyStore(state => state.setActiveCourse);
  const setActiveTask = useStudyStore(state => state.setActiveTask);
  const dashboardQuickNote = useStudyStore(state => state.dashboardQuickNote);
  const setDashboardQuickNote = useStudyStore(state => state.setDashboardQuickNote);

  const upcomingTasks = tasksList
    .filter(t => t.status !== 'completed' && t.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 4);

  const getTaskTypeConfig = (type) => {
    switch(type) {
      case "exam": return { label: "Prova", icon: "school", color: "text-[color:var(--error)]", bg: "bg-[color:var(--error)]" };
      case "assignment": return { label: "Trabalho", icon: "assignment", color: "text-[color:var(--tertiary)]", bg: "bg-[color:var(--tertiary)]" };
      case "presentation": return { label: "Apresent.", icon: "co_present", color: "text-[color:var(--secondary)]", bg: "bg-[color:var(--secondary)]" };
      default: return { label: "Tarefa", icon: "task_alt", color: "text-[color:var(--primary)]", bg: "bg-[color:var(--primary)]" };
    }
  };

  const calculateDays = (dateStr) => {
    const due = new Date(dateStr + "T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { text: "Atrasado!", urgent: true };
    if (diff === 0) return { text: "Hoje", urgent: true };
    if (diff === 1) return { text: "Amanhã", urgent: true };
    if (diff <= 5) return { text: `Faltam ${diff} dias`, urgent: true };
    return { text: dateStr.split("-").reverse().join("/"), urgent: false };
  };

  const activeCourseId = useStudyStore(state => state.activeCourseId);
  const activeModuleId = useStudyStore(state => state.activeModuleId);
  const activeLessonId = useStudyStore(state => state.activeLessonId);

  const activeCourse = courses.find(c => c.id === activeCourseId);
  const activeModule = activeCourse?.modules?.find(m => m.id === activeModuleId);
  const activeLesson = (activeModule?.lessons || activeCourse?.lessons || []).find(l => l.id === activeLessonId);
  const canContinue = activeCourse && activeLesson;

  return (
    <div className="screen-fade-in flex-1 overflow-y-auto px-10 py-10 xl:px-14 xl:py-12">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-12 flex flex-col justify-between gap-8 xl:flex-row xl:items-center">
          <div className="flex flex-col items-start">
            <h2 className="text-balance text-[34px] font-semibold tracking-tight text-[color:var(--on-surface)]">
              Bem-vindo de volta!
            </h2>
            <p className="mt-3 text-[17px] font-medium text-[color:var(--on-surface-variant)]">
              Pronto para continuar aprendendo?
            </p>
            {canContinue && (
              <button 
                onClick={() => onNavigate && onNavigate(SCREEN_IDS.LESSON)}
                className="mt-6 flex items-center gap-4 px-6 py-3 rounded-2xl bg-[color:var(--primary)] text-white hover:bg-[color:var(--primary-container)] hover:text-white transition-all shadow-[6px_6px_12px_rgba(99,102,241,0.2),-6px_-6px_12px_rgba(255,255,255,0.6)] active:scale-95"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20">
                  <Icon name="play_arrow" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-white/80">Continuar de onde parou</span>
                  <span className="font-semibold text-sm truncate max-w-[200px]">{activeCourse.title} - {activeLesson.title}</span>
                </div>
              </button>
            )}
          </div>

          <div className="neo-inset flex w-fit items-center gap-4 rounded-full px-7 py-4 h-fit">
            <div className="neo-inset h-[10px] w-36 overflow-hidden rounded-full">
              <div className="h-full rounded-full bg-[color:var(--primary)]" style={{ width: `${dashboardData.progress}%` }} />
            </div>
            <span className="text-[15px] font-bold text-[color:var(--primary)]">{dashboardData.progress}%</span>
          </div>
        </div>

        <DailyProgrammingChallenge onNavigate={onNavigate} />

        {/* Quick Note (Sticky Note) Section */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[color:var(--primary)]/15 flex items-center justify-center text-[color:var(--primary)] neo-inset">
              <Icon name="edit_note" />
            </div>
            <h3 className="text-[22px] font-bold tracking-tight text-[color:var(--on-surface)]">Anotação Rápida</h3>
          </div>
          
          <div className="neo-raised p-6 rounded-[2rem] bg-[color:var(--surface-container-low)] border border-[color:var(--outline-variant)]/50 shadow-md relative overflow-hidden transition-all focus-within:shadow-xl focus-within:border-[color:var(--primary)]/50">
            <div className="absolute top-0 left-0 w-full h-8 bg-[color:var(--surface-container)] flex items-center justify-center border-b border-[color:var(--outline-variant)]/30">
               <div className="w-12 h-1.5 rounded-full bg-[color:var(--outline)]/30"></div>
            </div>
            <textarea
              className="w-full mt-6 bg-transparent outline-none resize-none min-h-[100px] text-[color:var(--on-surface)] text-[15px] font-medium placeholder:text-[color:var(--on-surface-variant)]/50 focus:ring-0"
              placeholder="Digite suas anotações rápidas aqui... (Ficam salvas automaticamente!)"
              value={dashboardQuickNote || ""}
              onChange={(e) => setDashboardQuickNote(e.target.value)}
            />
          </div>
        </section>

        {upcomingTasks.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[color:var(--error-container)] flex items-center justify-center text-[color:var(--error)] neo-inset">
                <Icon name="notification_important" />
              </div>
              <h3 className="text-[22px] font-bold tracking-tight text-[color:var(--on-surface)]">Próximos Prazos</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {upcomingTasks.map(task => {
                const config = getTaskTypeConfig(task.type);
                const daysInfo = calculateDays(task.dueDate);
                const courseName = courses.find(c => c.id === task.courseId)?.title;
                
                return (
                  <div key={task.id} onClick={() => { setActiveTask(task.id); onNavigate && onNavigate(SCREEN_IDS.TASK_DETAILS); }} className={`neo-raised p-5 rounded-3xl flex flex-col gap-3 cursor-pointer transition-transform hover:-translate-y-1 ${task.type === 'exam' || daysInfo.urgent ? 'border border-[color:var(--error)]/30' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md ${config.color} ${config.bg}/10 border border-[color:var(--outline-variant)]/20`}>
                        <Icon name={config.icon} className="text-[12px] inline-block mr-1 align-text-bottom" />
                        {config.label}
                      </span>
                      {daysInfo.urgent && (
                        <span className="text-[10px] font-bold text-white bg-[color:var(--error)] px-2 py-1 rounded-full shadow-[0_0_10px_rgba(255,0,0,0.5)] animate-pulse">
                          {daysInfo.text}
                        </span>
                      )}
                    </div>
                    
                    <h4 className="font-bold text-[color:var(--on-surface)] text-sm mt-1 line-clamp-2">{task.title}</h4>
                    
                    <div className="mt-auto flex items-center gap-2 text-xs text-[color:var(--on-surface-variant)] pt-2 border-t border-[color:var(--outline-variant)]/20">
                      {!daysInfo.urgent && <span className="font-medium">{daysInfo.text}</span>}
                      {courseName && <span className="text-[10px] font-bold text-[color:var(--primary)] uppercase truncate bg-[color:var(--primary)]/10 px-2 py-0.5 rounded ml-auto">{courseName}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex flex-col gap-9">
          <section>
            <div className="mb-7 flex items-center justify-between">
              <h3 className="text-[24px] font-semibold tracking-tight text-[color:var(--on-surface)]">Meus Cursos</h3>
              <button 
                className="px-4 py-2 rounded-xl text-[14px] font-semibold bg-[color:var(--primary)] text-[color:var(--on-primary)] transition-all neo-raised hover:neo-inset flex items-center gap-2" 
                type="button" 
                onClick={() => setShowCreateModal(true)}
              >
                <Icon name="add" className="text-[18px]" />
                Criar Curso
              </button>
            </div>

            <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
              {courses.length === 0 ? (
                <div className="col-span-full neo-inset p-10 flex flex-col items-center justify-center rounded-[32px] text-center min-h-[300px]">
                  <Icon className="text-5xl text-[color:var(--outline)] mb-4" name="library_add" />
                  <h4 className="text-xl font-bold text-[color:var(--on-surface)] mb-2">Nenhum curso adicionado</h4>
                  <p className="text-[color:var(--on-surface-variant)] mb-6">Crie seu primeiro curso para começar a estudar.</p>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="px-6 py-3 rounded-xl font-bold bg-[color:var(--primary)] text-[color:var(--on-primary)] transition-all neo-raised hover:neo-inset flex items-center gap-2"
                  >
                    <Icon name="add" /> Criar Curso
                  </button>
                </div>
              ) : (
                courses.map((course, index) => (
                  <motion.article
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    key={course.id}
                    className="neo-raised flex min-h-[315px] flex-col rounded-[32px] p-8 transition-transform duration-300 hover:-translate-y-1 cursor-pointer relative"
                    onClick={() => {
                      setActiveCourse(course.id);
                      if (onNavigate) onNavigate(SCREEN_IDS.MODULES);
                    }}
                  >
                    <button 
                      className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:text-red-700 bg-[color:var(--background)] neo-raised active:scale-95 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Tem certeza que deseja excluir o curso "${course.title}" e todos os seus módulos e aulas?`)) {
                          deleteCourse(course.id);
                        }
                      }}
                      title="Excluir Curso"
                    >
                      <Icon name="delete" />
                    </button>
                    <div
                      className="neo-inset mb-8 flex h-16 w-16 items-center justify-center rounded-[22px] text-[color:var(--primary)]"
                    >
                      <Icon className="text-[30px]" name="school" />
                    </div>
                    <h4 className="text-[19px] font-semibold tracking-tight text-[color:var(--on-surface)]">{course.title}</h4>
                    <p className="mt-2 text-[15px] text-[color:var(--on-surface-variant)]">{course.modules.length} {course.modules.length === 1 ? 'Módulo' : 'Módulos'}</p>
                    <div className="mt-auto flex items-center justify-between pt-8">
                      <div className="mr-4 flex flex-1 items-center gap-4">
                        <div className="neo-inset h-[9px] flex-1 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-[color:var(--tertiary)]"
                            style={{ width: `${course.progress}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-[color:var(--tertiary)]">{course.progress}%</span>
                      </div>
                      <button className="neo-button flex h-12 w-12 items-center justify-center rounded-full text-[color:var(--primary)]" type="button">
                        <Icon name="arrow_forward" />
                      </button>
                    </div>
                  </motion.article>
                ))
              )}
            </div>
          </section>


        </div>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="neo-raised p-8 rounded-[2rem] w-full max-w-2xl bg-[color:var(--surface)]">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-bold text-[color:var(--on-surface)] flex items-center gap-2"><Icon name="library_add" /> Como você quer criar o curso?</h3>
                <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 neo-raised rounded-full flex items-center justify-center text-[color:var(--on-surface-variant)] hover:text-[color:var(--error)]"><Icon name="close" /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Option 1: Manual */}
                <div className="neo-inset p-6 rounded-[2rem] flex flex-col h-full items-start text-left">
                  <div className="w-12 h-12 neo-raised rounded-2xl flex items-center justify-center text-[color:var(--primary)] mb-4 shrink-0">
                    <Icon name="edit" className="text-2xl" />
                  </div>
                  <h4 className="text-xl font-bold mb-2">Criar Manualmente</h4>
                  <p className="text-sm text-[color:var(--on-surface-variant)] mb-8 flex-1">
                    Crie o curso do zero. Você adicionará os módulos e fará o upload dos vídeos, PDFs e materiais um por um na plataforma.
                  </p>
                  <button 
                    onClick={() => { setShowCreateModal(false); onNavigate && onNavigate(SCREEN_IDS.CREATE_COURSE); }}
                    className="w-full py-4 rounded-xl neo-raised text-[color:var(--primary)] font-bold flex justify-center items-center gap-2 hover:neo-inset"
                  >
                    <Icon name="add" /> Criar Manualmente
                  </button>
                </div>

                {/* Option 2: Automatic */}
                <div className="neo-inset p-6 rounded-[2rem] flex flex-col h-full items-start text-left">
                  <div className="w-12 h-12 neo-raised rounded-2xl flex items-center justify-center text-[color:var(--tertiary)] mb-4 shrink-0">
                    <Icon name="auto_awesome" className="text-2xl" />
                  </div>
                  <h4 className="text-xl font-bold mb-2">Sincronizar Pasta (Auto)</h4>
                  <p className="text-sm text-[color:var(--on-surface-variant)] mb-8 flex-1">
                    Selecione a pasta do curso no seu PC. A inteligência do app vai ler a pasta e criar os módulos e aulas automaticamente. 
                    <br/><br/>
                    <span className="text-[11px] font-bold text-[color:var(--primary)]">Dica:</span><span className="text-[11px]"> subpastas viram Módulos. Você também pode nomear arquivos como "[Nome do Módulo] - Título da Aula.mp4".</span>
                  </p>
                  <div onClick={() => setShowCreateModal(false)} className="w-full">
                    <SmartImporter 
                      buttonLabel="Selecionar Pasta" 
                      className="w-full justify-center !py-4 !text-base bg-[color:var(--surface)] text-[color:var(--tertiary)]" 
                    />
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
