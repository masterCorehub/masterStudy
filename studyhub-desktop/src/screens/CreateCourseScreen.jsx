import { useState } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { motion } from "framer-motion";

export function CreateCourseScreen({ onNavigate }) {
  const addCourse = useStudyStore(state => state.addCourse);
  const setActiveCourse = useStudyStore(state => state.setActiveCourse);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Geral");

  const handleSave = () => {
    if (!title.trim()) return;
    
    // Note: addCourse in useStore needs courseData. 
    // It creates an ID automatically.
    addCourse({
      title,
      description,
      category,
      progress: 0,
      modules: []
    });
    
    // setActiveCourse to the newly created course (the last one)
    setTimeout(() => {
      const courses = useStudyStore.getState().courses;
      if (courses.length > 0) {
        setActiveCourse(courses[courses.length - 1].id);
        if (onNavigate) onNavigate(SCREEN_IDS.DASHBOARD);
      }
    }, 50);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-1 overflow-y-auto p-6 md:p-10 pb-32 md:pb-12 bg-[color:var(--background)]"
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold text-[color:var(--on-surface)] mb-2">Criar Novo Curso</h2>
            <p className="text-[color:var(--on-surface-variant)]">Organize seus estudos em uma nova trilha de aprendizado.</p>
          </div>
          <div className="flex gap-4">
            <button 
              className="px-6 py-2.5 rounded-xl text-[color:var(--on-surface-variant)] font-medium neo-raised active:neo-inset transition-all"
              onClick={() => onNavigate && onNavigate(SCREEN_IDS.DASHBOARD)}
            >
              Cancelar
            </button>
            <button 
              className="px-6 py-2.5 rounded-xl text-[color:var(--primary)] font-semibold neo-raised active:neo-inset transition-all flex items-center gap-2"
              onClick={handleSave}
            >
              <Icon name="save" />
              Salvar Curso
            </button>
          </div>
        </div>

        {/* Bento Grid Layout for Form */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Course Details */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-[color:var(--background)] rounded-2xl p-6 md:p-8 neo-raised">
              <h3 className="text-lg font-semibold text-[color:var(--on-surface)] mb-6 flex items-center gap-2">
                <Icon className="text-[color:var(--tertiary)]" name="school" />
                Detalhes do Curso
              </h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--on-surface-variant)] mb-2 ml-1">Título do Curso</label>
                  <input 
                    className="w-full bg-[color:var(--background)] border-none rounded-xl py-3 px-4 text-[color:var(--on-surface)] placeholder:text-[color:var(--outline-variant)] neo-inset focus:ring-0" 
                    placeholder="Ex: Medicina - Ciclo Básico" 
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[color:var(--on-surface-variant)] mb-2 ml-1">Descrição</label>
                  <textarea 
                    className="w-full bg-[color:var(--background)] border-none rounded-xl py-3 px-4 text-[color:var(--on-surface)] placeholder:text-[color:var(--outline-variant)] neo-inset focus:ring-0 resize-none" 
                    placeholder="Descreva o foco deste curso..." 
                    rows="4"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[color:var(--on-surface-variant)] mb-2 ml-1">Categoria / Área</label>
                  <input 
                    className="w-full bg-[color:var(--background)] border-none rounded-xl py-3 px-4 text-[color:var(--on-surface)] placeholder:text-[color:var(--outline-variant)] neo-inset focus:ring-0" 
                    placeholder="Ex: Exatas, Saúde, Programação..." 
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Visuals */}
          <div className="space-y-8">
            <div className="bg-[color:var(--background)] rounded-2xl p-6 neo-raised flex flex-col h-full min-h-[300px]">
              <h3 className="text-lg font-semibold text-[color:var(--on-surface)] mb-4 flex items-center gap-2">
                <Icon className="text-[color:var(--tertiary)]" name="image" />
                Capa do Curso
              </h3>
              <div className="flex-1 w-full bg-[color:var(--background)] rounded-xl neo-inset flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:text-[color:var(--primary)] transition-colors group aspect-video">
                <Icon className="text-4xl text-[color:var(--outline-variant)] mb-2 group-hover:text-[color:var(--primary)] transition-colors" name="cloud_upload" />
                <p className="text-sm font-medium text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)]">Upload de Imagem</p>
                <p className="text-xs text-[color:var(--outline)] mt-1">PNG, JPG até 5MB</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
