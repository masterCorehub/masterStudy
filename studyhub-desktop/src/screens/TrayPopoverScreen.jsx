import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";
import { selectTodayTasks } from "../domain/taskDates";
import { normalizeAcademicStateSnapshot } from "../domain/academic";
import { getLocalDateKey } from "../utils/dateUtils";
import { useCurrentDate } from "../utils/useCurrentDate";
import "./TrayPopoverScreen.css";

export function TrayPopoverScreen() {
  const tasks = useStudyStore((state) => state.tasks?.list || []);
  const addTask = useStudyStore((state) => state.addTask);
  const updateTask = useStudyStore((state) => state.updateTask);
  const currentDate = useCurrentDate();
  const todayKey = getLocalDateKey(currentDate);
  const todayTasks = selectTodayTasks(tasks, todayKey);
  const pendingCount = todayTasks.filter(
    (task) => task.status !== "completed",
  ).length;
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const runAction = (action) =>
    window.studyhubDesktop?.trayPopover?.action?.(action);

  useEffect(() => {
    const close = (event) => {
      if (event.key === "Escape") runAction("close");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    const refresh = async () => {
      try {
        const snapshot = await window.studyhubDesktop?.studyDatabase?.load?.();
        if (snapshot?.state)
          useStudyStore.setState(
            normalizeAcademicStateSnapshot(snapshot.state),
          );
      } catch {
        setError(
          "Não foi possível atualizar as tarefas. Abra o app para verificar.",
        );
      }
    };
    // O painel é reutilizado pelo macOS; abrir de novo deve consultar os dados atuais.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const persist = async () => {
    try {
      const result = await window.studyhubDesktop?.studyDatabase?.save?.(
        useStudyStore.getState(),
      );
      if (result?.ok === false) throw new Error("save-failed");
      window.studyhubDesktop?.notifyStudyDataChanged?.();
      setError("");
    } catch {
      setError(
        "Não foi possível sincronizar a alteração. Abra o app para verificar.",
      );
    }
  };
  const createTask = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      status: "pending",
      dueDate: todayKey,
      type: "task",
      priority: "medium",
    });
    setTitle("");
    await persist();
  };
  const toggleTask = async (task) => {
    // O store registra a data de conclusão em todas as janelas.
    updateTask(task.id, {
      status: task.status === "completed" ? "pending" : "completed",
    });
    await persist();
  };

  return (
    <main className="study-tray-root" aria-label="Menu rápido masterStudy">
      <div className="study-tray-panel">
        <header className="study-tray-header">
          <span className="study-tray-logo">
            <Icon name="school" filled />
          </span>
          <div>
            <h1>masterStudy</h1>
            <p>
              {currentDate.toLocaleDateString("pt-BR", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>
          <details
            className="study-tray-more"
            onClick={(event) => {
              if (event.target.closest("button"))
                event.currentTarget.removeAttribute("open");
            }}
          >
            <summary aria-label="Mais ações" title="Mais ações">
              <Icon name="more_horiz" />
            </summary>
            <div>
              <button type="button" onClick={() => runAction("settings")}>
                <Icon name="settings" />
                Configurações
              </button>
              <button type="button" onClick={() => runAction("translate-text")}>
                <Icon name="translate" />
                Traduzir texto
              </button>
              <button type="button" onClick={() => runAction("translate-area")}>
                <Icon name="screenshot_region" />
                Extrair texto de imagem
              </button>
              <button type="button" onClick={() => runAction("quit")}>
                <Icon name="logout" />
                Sair do app
              </button>
            </div>
          </details>
        </header>
        <section className="study-tray-tasks" aria-label="Tarefas de hoje">
          <header>
            <h2>Hoje</h2>
            <span>
              {pendingCount
                ? `${pendingCount} pendente${pendingCount > 1 ? "s" : ""}`
                : todayTasks.length
                  ? "Tudo concluído"
                  : "Sem tarefas"}
            </span>
          </header>
          <form className="study-tray-add" onSubmit={createTask}>
            <input
              autoFocus
              aria-label="Nova tarefa para hoje"
              placeholder="Adicionar tarefa para hoje…"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <button
              aria-label="Adicionar tarefa"
              type="submit"
              disabled={!title.trim()}
            >
              <Icon name="add" />
            </button>
          </form>
          <div className="study-tray-task-list">
            {todayTasks.map((task) => {
              const done = task.status === "completed";
              return (
                <div
                  key={task.id}
                  className={`study-tray-task${done ? " is-done" : ""}`}
                >
                  <button
                    type="button"
                    className="study-tray-check"
                    aria-label={`${done ? "Reabrir" : "Concluir"} tarefa ${task.title}`}
                    aria-pressed={done}
                    onClick={() => toggleTask(task)}
                  >
                    <Icon
                      name={done ? "check_circle" : "radio_button_unchecked"}
                    />
                  </button>
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {done
                        ? "Concluída"
                        : task.dueTime
                          ? task.dueTime
                          : "Para hoje"}
                    </small>
                  </div>
                </div>
              );
            })}
            {!todayTasks.length ? (
              <p className="study-tray-empty">
                <Icon name="task_alt" />
                Seu dia está livre por aqui.
              </p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="study-tray-error">
              {error}
            </p>
          ) : null}
        </section>
        <nav className="study-tray-shortcuts" aria-label="Ações rápidas">
          <button type="button" onClick={() => runAction("quick-note")}>
            <Icon name="edit_note" />
            <span>Nota rápida</span>
          </button>
          <button type="button" onClick={() => runAction("search")}>
            <Icon name="search" />
            <span>Buscar no app</span>
          </button>
        </nav>
        <footer>
          <button
            type="button"
            className="study-tray-open"
            onClick={() => runAction("open-app")}
          >
            Abrir masterStudy
            <Icon name="arrow_forward" />
          </button>
          <button
            type="button"
            className="study-tray-all-tasks"
            onClick={() => runAction("tasks")}
          >
            Todas as tarefas
          </button>
        </footer>
      </div>
    </main>
  );
}
