import { useEffect, useMemo, useState } from "react";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { calculateAttendance, getAcademicSemesterData } from "../domain/academic";

const DISMISSED_ALERTS_KEY = "studyhub.dismissed-alerts";
const SYSTEM_ALERTS_KEY = "studyhub.system-alerts-sent";

function getDismissedAlerts() {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISSED_ALERTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function StudyAlerts({ onNavigate }) {
  const tasks = useStudyStore((state) => state.tasks.list);
  const flashcardDecks = useStudyStore((state) => state.flashcardDecks);
  const academicState = useStudyStore((state) => state.academic);
  const appSettings = useStudyStore((state) => state.appSettings || {});
  const academic = useMemo(
    () => getAcademicSemesterData(academicState),
    [academicState],
  );
  const [dismissedAlerts, setDismissedAlerts] = useState(getDismissedAlerts);
  const [referenceTime, setReferenceTime] = useState(Date.now);

  const now = referenceTime;
  const today = new Date(referenceTime);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const overdueTasks = tasks.filter((task) => {
    if (task.status === "completed" || task.completed || !task.dueDate) return false;
    return new Date(`${task.dueDate}T00:00:00`) < today;
  });
  const upcomingTasks = tasks.filter((task) => {
    if (task.status === "completed" || task.completed || !task.dueDate) return false;
    const dueDate = new Date(`${task.dueDate}T00:00:00`);
    return dueDate >= today && dueDate <= tomorrow;
  });
  const cardsToReview = flashcardDecks.reduce(
    (total, deck) =>
      total + (deck.cards || []).filter((card) => !card.dueDate || card.dueDate <= now).length,
    0,
  );
  const imminentExams = academic.exams.filter((exam) => {
    if (!exam.date) return false;
    const date = new Date(`${exam.date}T00:00:00`);
    return date >= today && date <= tomorrow;
  });
  const attendanceRisks = academic.subjects.filter((subject) =>
    calculateAttendance(academic.attendance, subject, academic.classLogs).atRisk,
  );

  const alerts = [
    overdueTasks.length > 0
      ? {
          id: "overdue-tasks",
          icon: "priority_high",
          title: `${overdueTasks.length} tarefa${overdueTasks.length === 1 ? " atrasada" : "s atrasadas"}`,
          message: "Revise seus prazos para manter o plano de estudos em dia.",
          screen: SCREEN_IDS.TASKS,
          tone: "error",
        }
      : null,
    upcomingTasks.length > 0
      ? {
          id: "upcoming-tasks",
          icon: "event",
          title: `${upcomingTasks.length} tarefa${upcomingTasks.length === 1 ? " vence" : "s vencem"} hoje ou amanha`,
          message: "Confira se ha algo que voce quer adiantar.",
          screen: SCREEN_IDS.TASKS,
          tone: "warning",
        }
      : null,
    cardsToReview > 0
      ? {
          id: "flashcards-review",
          icon: "style",
          title: `${cardsToReview} flashcard${cardsToReview === 1 ? " para revisar" : "s para revisar"}`,
          message: "Uma revisao curta agora ajuda a fixar o conteudo.",
          screen: SCREEN_IDS.FLASHCARDS,
          tone: "primary",
        }
      : null,
    imminentExams.length > 0
      ? {
          id: "academic-exams",
          icon: "quiz",
          title: `${imminentExams.length} prova${imminentExams.length === 1 ? " acontece" : "s acontecem"} hoje ou amanhã`,
          message: "Abra o plano de preparação e confira a revisão final.",
          screen: SCREEN_IDS.ACADEMIC,
          tone: "warning",
        }
      : null,
    attendanceRisks.length > 0
      ? {
          id: "attendance-risk",
          icon: "warning",
          title: `${attendanceRisks.length} disciplina${attendanceRisks.length === 1 ? " exige" : "s exigem"} atenção na frequência`,
          message: "Confira suas faltas e o percentual mínimo exigido.",
          screen: SCREEN_IDS.ACADEMIC,
          tone: "error",
        }
      : null,
  ].filter(Boolean);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setReferenceTime(Date.now()),
      60 * 1000,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const cleanupDismissals = () => {
      const activeIds = new Set(alerts.map((alert) => alert.id));
      setDismissedAlerts((current) => current.filter((id) => activeIds.has(id)));
    };

    cleanupDismissals();
  }, [attendanceRisks.length, cardsToReview, imminentExams.length, overdueTasks.length, upcomingTasks.length]);

  useEffect(() => {
    window.localStorage.setItem(
      DISMISSED_ALERTS_KEY,
      JSON.stringify(dismissedAlerts),
    );
  }, [dismissedAlerts]);

  const visibleAlerts = alerts.filter((alert) => !dismissedAlerts.includes(alert.id));

  useEffect(() => {
    const notifications = window.studyhubDesktop?.notifications;
    if (!notifications?.show || appSettings.notificationsEnabled === false) return;

    const todayKey = new Date().toLocaleDateString("en-CA");
    let sent = {};
    try {
      sent = JSON.parse(window.localStorage.getItem(SYSTEM_ALERTS_KEY) || "{}");
    } catch {
      sent = {};
    }

    visibleAlerts.forEach((alert) => {
      if (alert.id === "flashcards-review" && appSettings.flashcardReviewReminders === false) return;
      if (["overdue-tasks", "upcoming-tasks", "academic-exams"].includes(alert.id) && appSettings.taskDueReminders === false) return;
      const deliveryKey = `${todayKey}:${alert.id}`;
      if (sent[deliveryKey]) return;
      sent[deliveryKey] = Date.now();
      void notifications.show({
        title: alert.title,
        subtitle: alert.id === "flashcards-review" ? "CampusFlow • Revisão inteligente" : "CampusFlow • Planejamento acadêmico",
        body: alert.message,
        screen: alert.screen,
        actionLabel: alert.id === "flashcards-review" ? "Revisar agora" : "Ver agora",
        persistent: alert.tone === "error",
        sound: appSettings.soundEnabled !== false,
      }).catch(() => {
        delete sent[deliveryKey];
        window.localStorage.setItem(SYSTEM_ALERTS_KEY, JSON.stringify(sent));
      });
    });

    const recentEntries = Object.fromEntries(
      Object.entries(sent).filter(([, timestamp]) => Date.now() - Number(timestamp) < 8 * 24 * 60 * 60 * 1000),
    );
    window.localStorage.setItem(SYSTEM_ALERTS_KEY, JSON.stringify(recentEntries));
  }, [
    appSettings.flashcardReviewReminders,
    appSettings.notificationsEnabled,
    appSettings.soundEnabled,
    appSettings.taskDueReminders,
    visibleAlerts.map((alert) => alert.id).join("|"),
  ]);

  if (visibleAlerts.length === 0) return null;

  return (
    <aside className="pointer-events-none fixed right-4 top-4 z-[200] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
      {visibleAlerts.map((alert) => {
        const toneClasses = {
          error: "border-[color:var(--error)]/30 text-[color:var(--error)]",
          warning: "border-amber-400/30 text-amber-500",
          primary: "border-[color:var(--primary)]/30 text-[color:var(--primary)]",
        }[alert.tone];

        return (
          <div
            key={alert.id}
            className="pointer-events-auto flex gap-3 rounded-2xl border bg-[color:var(--surface)] p-4 shadow-2xl backdrop-blur-xl"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--background)] ${toneClasses}`}>
              <Icon name={alert.icon} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[color:var(--on-surface)]">{alert.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[color:var(--on-surface-variant)]">{alert.message}</p>
              <button
                className="mt-3 text-xs font-bold text-[color:var(--primary)] hover:underline"
                type="button"
                onClick={() => onNavigate?.(alert.screen)}
              >
                Ver agora
              </button>
            </div>
            <button
              className="h-7 w-7 shrink-0 rounded-full text-[color:var(--on-surface-variant)] transition-colors hover:bg-[color:var(--background)] hover:text-[color:var(--on-surface)]"
              type="button"
              title="Dispensar alerta"
              onClick={() =>
                setDismissedAlerts((current) => [...current, alert.id])
              }
            >
              <Icon className="text-[17px]" name="close" />
            </button>
          </div>
        );
      })}
    </aside>
  );
}
