import { useState } from "react";
import { Icon } from "../ui/Icon";
import { sanitizeUserHtml } from "../utils/sanitizeHtml";
import { useStudyStore } from "../store/useStore";

export function NotesPanel() {
  const notesList = useStudyStore((state) => state.notes.list);
  const addNote = useStudyStore((state) => state.addNote);
  const deleteNote = useStudyStore((state) => state.deleteNote);
  const immersionMediaTime = useStudyStore((state) => state.immersionMediaTime);
  const requestImmersionSeek = useStudyStore((state) => state.requestImmersionSeek);

  const [text, setText] = useState("");
  const activeCourseId = useStudyStore((state) => state.activeCourseId);
  const activeModuleId = useStudyStore((state) => state.activeModuleId);
  const activeLessonId = useStudyStore((state) => state.activeLessonId);

  const filteredNotes = notesList.filter((note) => {
    if (activeLessonId) return note.sourceLessonId === activeLessonId;
    if (activeModuleId) return note.sourceModuleId === activeModuleId;
    if (activeCourseId) return note.sourceCourseId === activeCourseId;
    return true;
  });

  const formatTimestampLabel = (timeInSeconds) => {
    const totalSeconds = Math.max(0, Math.floor(timeInSeconds || 0));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const handleSend = () => {
    if (!text.trim()) return;

    const hasPlaybackTime = Number.isFinite(immersionMediaTime) && immersionMediaTime > 0;

    addNote({
      content: text,
      title: "Insight de Imersao",
      module: "Imersao Ativa",
      time: hasPlaybackTime ? formatTimestampLabel(immersionMediaTime) : "Agora",
      timestamp: hasPlaybackTime ? immersionMediaTime : null,
      sourceCourseId: activeCourseId,
      sourceModuleId: activeModuleId,
      sourceLessonId: activeLessonId,
    });

    setText("");
  };

  return (
    <aside className="hidden h-full w-[360px] shrink-0 border-l border-[color:var(--outline-variant)]/20 bg-[color:var(--surface)] shadow-[-6px_0_12px_rgba(0,0,0,0.05)] xl:flex xl:flex-col z-50">
      <div className="flex items-center justify-between border-b border-[color:var(--outline-variant)]/20 px-8 py-6">
        <h3 className="flex items-center gap-3 text-[18px] font-semibold text-[color:var(--on-surface)]">
          <Icon className="text-[24px] text-[color:var(--primary)]" name="edit_note" />
          Anotacoes Rapidas
        </h3>
        <button className="text-[color:var(--on-surface-variant)] transition-colors hover:text-[color:var(--primary)]" type="button">
          <Icon name="close_fullscreen" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-7 custom-scrollbar">
        <div className="neo-inset flex h-48 flex-col rounded-[28px] p-5">
          <textarea
            className="h-full resize-none bg-transparent text-base text-[color:var(--on-surface)] outline-none placeholder:text-[color:var(--outline)]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite seus insights enquanto ouve..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="mt-4 flex items-center justify-between border-t border-[color:var(--outline-variant)]/20 pt-3">
            <div className="flex gap-3 text-[color:var(--outline)]">
              <button type="button">
                <Icon className="text-[18px]" name="format_bold" />
              </button>
              <button type="button">
                <Icon className="text-[18px]" name="format_list_bulleted" />
              </button>
            </div>
            <button
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${text.trim() ? "neo-raised text-[color:var(--primary)] hover:text-[color:var(--tertiary)]" : "neo-raised-soft text-[color:var(--outline)]"}`}
              type="button"
              onClick={handleSend}
            >
              <Icon className="text-[18px]" name="send" />
            </button>
          </div>
        </div>

        <div className="relative mt-8 space-y-7 before:absolute before:left-[10px] before:top-2 before:h-[calc(100%-8px)] before:w-[2px] before:bg-gradient-to-b before:from-transparent before:via-[color:var(--outline-variant)]/30 before:to-transparent">
          {filteredNotes.map((note) => {
            const accentColorClass = note.accent === "primary"
              ? "border-[color:var(--primary)] text-[color:var(--primary)]"
              : note.accent === "tertiary"
                ? "border-[color:var(--tertiary)] text-[color:var(--tertiary)]"
                : note.accent === "error"
                  ? "border-[color:var(--error)] text-[color:var(--error)]"
                  : "border-[color:var(--secondary)] text-[color:var(--secondary)]";

            return (
              <div key={note.id} className="group relative flex items-start">
                <div className={`neo-raised absolute left-0 top-1 z-10 h-5 w-5 rounded-full border-2 ${accentColorClass.split(" ")[0]}`} />
                <div className="neo-raised ml-10 w-full rounded-[26px] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      className={`text-xs font-semibold ${accentColorClass.split(" ")[1]} ${note.timestamp !== null && note.timestamp !== undefined ? "underline underline-offset-2" : ""}`}
                      type="button"
                      onClick={() => {
                        if (note.timestamp !== null && note.timestamp !== undefined) {
                          requestImmersionSeek(note.timestamp);
                        }
                      }}
                    >
                      {note.time}
                    </button>
                    <button
                      className="opacity-0 text-[color:var(--outline)] transition-colors hover:text-[color:var(--error)] group-hover:opacity-100"
                      type="button"
                      onClick={() => deleteNote(note.id)}
                    >
                      <Icon className="text-[18px]" name="delete" />
                    </button>
                  </div>
                  {typeof note.content === "string" && note.content.includes("<") ? (
                    <div
                      className="text-[15px] leading-8 text-[color:var(--on-surface-variant)]"
                      dangerouslySetInnerHTML={{ __html: sanitizeUserHtml(note.content) }}
                    />
                  ) : (
                    <p className="text-[15px] leading-8 text-[color:var(--on-surface-variant)]">{note.content}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
