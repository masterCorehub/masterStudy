import { useState } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { motion } from "framer-motion";

export function AddLessonScreen({ onNavigate }) {
  const activeCourseId = useStudyStore(state => state.activeCourseId);
  const activeModuleId = useStudyStore(state => state.activeModuleId);
  
  const courses = useStudyStore(state => state.courses);
  const activeCourse = courses.find(c => c.id === activeCourseId);
  const activeModule = activeCourse?.modules?.find(m => m.id === activeModuleId);
  
  const addLesson = useStudyStore(state => state.addLesson);
  
  const [title, setTitle] = useState("");
  const [videoPath, setVideoPath] = useState(null);
  const [pdfPath, setPdfPath] = useState(null);
  const [audioPath, setAudioPath] = useState(null);
  const [contentMode, setContentMode] = useState("media");
  const [durationMode, setDurationMode] = useState("auto");
  
  const [description, setDescription] = useState("");
  const [durationLabel, setDurationLabel] = useState("");
  const [tags, setTags] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const pickLessonFile = async (kind, setter) => {
    if (window.studyhubDesktop?.selectFile) {
      const filters = kind === "audio"
        ? [{ name: "Áudio", extensions: ["mp3", "wav", "ogg", "m4a"] }]
        : kind === "pdf"
          ? [{ name: "PDF", extensions: ["pdf"] }]
          : [{ name: "Vídeo", extensions: ["mp4", "mov", "webm", "mkv"] }];
      const selectedPath = await window.studyhubDesktop.selectFile({ filters });
      if (selectedPath) setter(selectedPath);
      return;
    }
    alert("A seleção nativa de arquivos só funciona no app Desktop.");
  };

  const handleSave = () => {
    if (!title.trim() || !activeCourseId) return;
    // Allow saving a lesson directly on the course (moduleId may be null)
    addLesson(activeCourseId, activeModuleId || null, {
      title,
      description,
      tags,
      contentMode,
      kindLabel: "Aula",
      durationLabel: durationMode === "manual" && durationLabel.trim() ? durationLabel.trim() : "Auto", 
      durationMode,
      filePath: videoPath, // video maps to filePath for legacy compatibility
      pdfPath: pdfPath,
      audioPath: audioPath,
      youtubeUrl: youtubeUrl,
      externalUrl: externalUrl.trim()
    });
    
    if (onNavigate) onNavigate(SCREEN_IDS.MODULES);
  };

  const renderUploadBox = (title, subtitle, type, state, setState, icon, accept) => (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-[color:var(--on-surface-variant)] ml-2">{title}</label>
      <div className="border-2 border-dashed border-[color:var(--outline-variant)]/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 neo-inset relative overflow-hidden group cursor-pointer hover:border-[color:var(--primary)]/50 transition-colors bg-[color:var(--surface)]">
        <button
          className="absolute inset-0 z-10"
          type="button"
          onClick={() => pickLessonFile(type, setState)}
        />
        <div className={`w-12 h-12 rounded-full bg-[color:var(--surface)] neo-raised flex items-center justify-center ${state ? 'text-green-500' : 'text-[color:var(--primary)]'} mb-1 group-hover:scale-110 transition-transform duration-300`}>
          <Icon className="text-2xl" name={state ? "check_circle" : icon} />
        </div>
        <h3 className="text-sm font-semibold text-[color:var(--on-surface)] text-center">
          {state ? "Arquivo Adicionado" : "Adicionar Arquivo"}
        </h3>
        <p className="text-xs text-[color:var(--on-surface-variant)] text-center max-w-xs break-all">
          {state ? state : subtitle}
        </p>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 overflow-y-auto p-6 md:p-10 pb-32 md:pb-12 bg-[color:var(--background)] custom-scrollbar"
    >
      <div className="max-w-6xl mx-auto flex flex-col h-full">
        {/* Page Header */}
        <header className="mb-10 flex justify-between items-end">
          <div>
            <p className="text-sm font-semibold text-[color:var(--primary)] tracking-wider uppercase mb-2">Edição de Curso</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[color:var(--on-surface)] tracking-tight">{activeModule ? 'Adicionar Aula ao Módulo' : 'Adicionar Aula ao Curso'}</h2>
          </div>
          <button 
            className="flex items-center justify-center px-6 py-3 bg-[color:var(--surface)] rounded-xl neo-raised hover:neo-inset text-[color:var(--on-surface-variant)]"
            onClick={() => onNavigate && onNavigate(SCREEN_IDS.MODULES)}
          >
            Voltar
          </button>
        </header>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
          {/* Left Column: Upload Area */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
            <div className="bg-[color:var(--surface)] rounded-2xl p-6 md:p-8 neo-raised flex flex-col gap-6">
              
              <div className="flex flex-col gap-3">
                <label className="text-sm font-semibold text-[color:var(--on-surface-variant)] ml-2">Título da Aula</label>
                <input 
                  className="w-full bg-[color:var(--surface)] text-[color:var(--on-surface)] placeholder:text-[color:var(--outline)] p-4 rounded-xl neo-inset focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 transition-all border-none" 
                  placeholder="Ex: Aula 1 - Introdução" 
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-sm font-semibold text-[color:var(--on-surface-variant)] ml-2">Descrição (Opcional)</label>
                <textarea 
                  className="w-full bg-[color:var(--surface)] text-[color:var(--on-surface)] placeholder:text-[color:var(--outline)] p-4 rounded-xl neo-inset focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 transition-all border-none resize-none" 
                  placeholder="Sobre o que é esta aula..." 
                  rows="2"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-semibold text-[color:var(--on-surface-variant)] ml-2">Duração (Opcional)</label>
                  <input 
                    className="w-full bg-[color:var(--surface)] text-[color:var(--on-surface)] placeholder:text-[color:var(--outline)] p-4 rounded-xl neo-inset focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 transition-all border-none" 
                    placeholder="Ex: 15m, 1h 30m..." 
                    type="text"
                    value={durationLabel}
                    onChange={e => setDurationLabel(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-semibold text-[color:var(--on-surface-variant)] ml-2">Tags (Opcional)</label>
                  <input 
                    className="w-full bg-[color:var(--surface)] text-[color:var(--on-surface)] placeholder:text-[color:var(--outline)] p-4 rounded-xl neo-inset focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 transition-all border-none" 
                    placeholder="Ex: anatomia, revisão" 
                    type="text"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-sm font-semibold text-[color:var(--on-surface-variant)] ml-2">Link do YouTube (Opcional)</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[color:var(--error)] flex items-center justify-center">
                    <Icon name="smart_display" className="text-xl" />
                  </div>
                  <input 
                    className="w-full bg-[color:var(--surface)] text-[color:var(--on-surface)] placeholder:text-[color:var(--outline)] py-4 pr-4 pl-12 rounded-xl neo-inset focus:outline-none focus:ring-2 focus:ring-[color:var(--error)]/20 transition-all border-none" 
                    placeholder="Ex: https://www.youtube.com/watch?v=..." 
                    type="text"
                    value={youtubeUrl}
                    onChange={e => setYoutubeUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-sm font-semibold text-[color:var(--on-surface-variant)] ml-2">Link externo (Udemy ou outro conteúdo)</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[color:var(--primary)]"><Icon name="link" className="text-xl" /></div>
                  <input className="w-full bg-[color:var(--surface)] text-[color:var(--on-surface)] placeholder:text-[color:var(--outline)] py-4 pr-4 pl-12 rounded-xl neo-inset focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 border-none" placeholder="Ex: https://www.udemy.com/course/..." type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} />
                </div>
                <p className="ml-2 text-xs text-[color:var(--on-surface-variant)]">O StudyHub apenas abre o conteúdo na plataforma original.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                {renderUploadBox(
                  "Vídeo Principal", 
                  "MP4, MOV, WEBM", 
                  "video", 
                  videoPath, 
                  setVideoPath, 
                  "play_circle", 
                  "video/mp4,video/quicktime,video/webm"
                )}
                {renderUploadBox(
                  "PDF Complementar", 
                  "Material de leitura (PDF)", 
                  "pdf", 
                  pdfPath, 
                  setPdfPath, 
                  "picture_as_pdf", 
                  "application/pdf"
                )}
                {renderUploadBox(
                  "Áudio Imersivo", 
                  "Para ouvir e praticar (MP3)", 
                  "audio", 
                  audioPath, 
                  setAudioPath, 
                  "headphones", 
                  "audio/*"
                )} 
              </div>

              <div className="mt-2 rounded-2xl border border-[color:var(--outline-variant)]/35 bg-[color:var(--background)] p-4">
                <h4 className="mb-3 text-sm font-bold text-[color:var(--on-surface)]">Formato da aula</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <button
                    className={`rounded-2xl border p-4 text-left transition-all ${contentMode === "media" ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10" : "border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] hover:border-[color:var(--primary)]/50"}`}
                    type="button"
                    onClick={() => setContentMode("media")}
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="smart_display" className="text-[color:var(--primary)]" />
                      <span className="font-bold text-[color:var(--on-surface)]">Com mídia principal</span>
                    </div>
                    <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">Aula com vídeo, link, PDF ou áudio destacado no topo.</p>
                  </button>
                  <button
                    className={`rounded-2xl border p-4 text-left transition-all ${contentMode === "hub" ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10" : "border-[color:var(--outline-variant)]/45 bg-[color:var(--surface)] hover:border-[color:var(--primary)]/50"}`}
                    type="button"
                    onClick={() => setContentMode("hub")}
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="folder_open" className="text-[color:var(--primary)]" />
                      <span className="font-bold text-[color:var(--on-surface)]">Hub de conteúdo</span>
                    </div>
                    <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">Sem vídeo obrigatório. Ideal para anotações, arquivos e links de estudo.</p>
                  </button>
                </div>
              </div>
            </div>

            <button 
              className="w-full py-5 bg-[color:var(--surface)] text-[color:var(--primary)] font-bold text-lg rounded-2xl neo-raised active:neo-inset transition-all duration-300 flex items-center justify-center gap-3 mt-auto"
              onClick={handleSave}
            >
              <Icon filled name="save" />
              {activeModule ? 'Salvar Aula no Módulo' : 'Salvar Aula no Curso'}
            </button>
          </div>

          {/* Right Column: Recent Uploads */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
            <div className="bg-[color:var(--surface)] rounded-2xl p-6 md:p-8 neo-raised h-full flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[color:var(--on-surface)]">{activeModule ? 'Aulas Atuais no Módulo' : 'Aulas Atuais no Curso'}</h3>
                <Icon className="text-[color:var(--outline)]" name="format_list_bulleted" />
              </div>
              
              <div className="flex flex-col gap-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                {(activeModule ? activeModule?.lessons : activeCourse?.lessons)?.map((lesson, idx) => (
                  <div key={lesson.id} className="bg-[color:var(--surface)] rounded-xl p-4 neo-raised flex items-center gap-4 group">
                    <div className="w-10 h-10 rounded-lg bg-[color:var(--surface)] neo-inset flex flex-col items-center justify-center text-[color:var(--primary)] shrink-0 font-bold text-xs">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-[color:var(--on-surface)] truncate">{lesson.title}</h4>
                      <div className="flex gap-2 mt-1">
                        {(lesson.filePath || lesson.youtubeUrl) && <Icon name="play_circle" className="text-[14px] text-[color:var(--on-surface-variant)]" />}
                        {lesson.pdfPath && <Icon name="picture_as_pdf" className="text-[14px] text-[color:var(--on-surface-variant)]" />}
                        {lesson.audioPath && <Icon name="headphones" className="text-[14px] text-[color:var(--on-surface-variant)]" />}
                      </div>
                    </div>
                  </div>
                ))}
                
                {!activeModule?.lessons?.length && (
                  <div className="text-center text-[color:var(--on-surface-variant)] py-10 text-sm">
                    Nenhuma aula adicionada ainda.
                  </div>
                )}
              </div>
              
              <div className="mt-8 pt-6 border-t border-[color:var(--outline-variant)]/20">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-[color:var(--on-surface-variant)]">Total de Aulas</span>
                  <span className="text-sm font-bold text-[color:var(--primary)]">{(activeModule ? activeModule?.lessons : activeCourse?.lessons)?.length || 0} Aulas</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
