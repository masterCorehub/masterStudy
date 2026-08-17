import { useState } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";

function parseFolder(rootName, dirPath, filesList) {
  const modulesMap = {};
  filesList.forEach((file) => {
    const absolutePath = file.path.replace(/\\/g, "/");
    const rootPath = (dirPath || "").replace(/\\/g, "/");
    let relativePath = absolutePath.startsWith(rootPath) ? absolutePath.slice(rootPath.length).replace(/^\//, "") : absolutePath;
    const segments = relativePath.split("/");
    let moduleName = segments.length > 1 ? segments[0] : "Úteis";
    const ext = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "";
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const mvMatch = baseName.match(/^M(\d+)V(\d+)\s*(.*)$/i);
    const patternMatch = baseName.match(/^\[(.*?)\]\s*-?\s*(.*)$/);
    let title = baseName;
    let index = null;
    if (mvMatch) { moduleName = `Módulo ${mvMatch[1]}`; index = Number(mvMatch[2]); title = mvMatch[3].trim() || baseName; }
    else if (patternMatch) { moduleName = patternMatch[1].trim(); title = patternMatch[2].trim() || baseName; }
    const media = ["mp4", "mkv", "avi", "mov", "webm", "mp3"].includes(ext);
    const pdf = ext === "pdf";
    const image = ["png", "jpg", "jpeg", "webp"].includes(ext);
    if (!media && !pdf && !image) return;
    modulesMap[moduleName] ||= { title: moduleName, lessonsMap: {} };
    modulesMap[moduleName].lessonsMap[title] ||= { title, index: index || Object.keys(modulesMap[moduleName].lessonsMap).length + 1, kindLabel: media ? (ext === "mp3" ? "Áudio" : "Vídeo") : pdf ? "Leitura" : "Imagem" };
    const lesson = modulesMap[moduleName].lessonsMap[title];
    if (media) { lesson.filePath = file.path; lesson.audioPath = ext === "mp3" ? file.path : undefined; lesson.kindLabel = ext === "mp3" ? "Áudio" : "Vídeo"; }
    if (pdf) lesson.pdfPath = file.path;
    if (image) lesson.coverPath = file.path;
  });
  return { courseTitle: rootName || "Novo Curso", modules: Object.values(modulesMap).map((module) => ({ ...module, lessons: Object.values(module.lessonsMap).sort((a, b) => (a.index || 0) - (b.index || 0) || a.title.localeCompare(b.title)) })).filter((module) => module.lessons.length) };
}

export function SmartImporter({ className = "", targetCourseTitle = null, buttonLabel = "Importar pasta" }) {
  const syncImportCourse = useStudyStore((state) => state.syncImportCourse);
  const addImportTransaction = useStudyStore((state) => state.addImportTransaction);
  const courses = useStudyStore((state) => state.courses);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  const handleFolderSelect = async () => {
    if (!window.studyhubDesktop?.selectDirectory) { setError("A importação de pastas requer o aplicativo Desktop."); return; }
    try {
      const result = await window.studyhubDesktop.selectDirectory();
      if (!result?.filesList) return;
      const parsed = parseFolder(result.rootName, result.dirPath, result.filesList);
      if (!parsed.modules.length) { setError("Nenhum vídeo, áudio, PDF ou imagem encontrado."); return; }
      setError("");
      setPreview({ ...parsed, courseTitle: targetCourseTitle || parsed.courseTitle, filesCount: result.filesList.length });
    } catch (importError) {
      console.error("Erro ao importar pasta:", importError);
      setError("Não foi possível analisar a pasta selecionada.");
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    const beforeCourses = JSON.parse(JSON.stringify(courses));
    syncImportCourse(preview.courseTitle, preview.modules);
    addImportTransaction({ beforeCourses, courseTitle: preview.courseTitle, modules: preview.modules, filesCount: preview.filesCount });
    setPreview(null);
  };

  return <>
    <button type="button" onClick={handleFolderSelect} className={`px-6 py-3 bg-[color:var(--surface)] text-[color:var(--primary)] font-bold rounded-xl neo-raised hover:neo-inset transition-all flex items-center gap-2 ${className}`}><Icon name="folder_open" />{buttonLabel}</button>
    {error ? <p className="mt-2 text-xs font-bold text-[color:var(--error)]">{error}</p> : null}
    {preview ? <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Prévia da importação">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-[color:var(--surface)] p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[color:var(--primary)]">Prévia da importação</p><h2 className="mt-2 text-2xl font-black">{preview.courseTitle}</h2><p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">{preview.modules.length} módulos · {preview.modules.reduce((sum, module) => sum + module.lessons.length, 0)} itens detectados</p></div><button type="button" aria-label="Fechar prévia" onClick={() => setPreview(null)} className="rounded-full p-2 neo-raised"><Icon name="close" /></button></div>
        <div className="mt-6 space-y-3">{preview.modules.map((module) => <div key={module.title} className="rounded-2xl p-4 neo-inset"><div className="flex items-center justify-between"><h3 className="font-black">{module.title}</h3><span className="text-xs text-[color:var(--on-surface-variant)]">{module.lessons.length} aulas</span></div><div className="mt-3 space-y-1">{module.lessons.map((lesson) => <p key={lesson.title} className="flex items-center gap-2 text-sm text-[color:var(--on-surface-variant)]"><Icon name={lesson.kindLabel === "Leitura" ? "picture_as_pdf" : lesson.kindLabel === "Áudio" ? "headphones" : "play_circle"} className="text-[color:var(--primary)]" />{lesson.title}<span className="ml-auto text-[10px] uppercase">{lesson.kindLabel}</span></p>)}</div></div>)}</div>
        <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setPreview(null)} className="rounded-xl px-4 py-3 font-bold neo-raised">Cancelar</button><button type="button" onClick={confirmImport} className="rounded-xl bg-[color:var(--primary)] px-5 py-3 font-bold text-white">Confirmar importação</button></div>
      </div>
    </div> : null}
  </>;
}

