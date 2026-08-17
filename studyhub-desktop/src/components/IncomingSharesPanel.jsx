import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collaborationCloud,
  collaborationCloudConfigured,
} from "../services/collaboration-cloud";
import {
  hasImportedSharedEntity,
  importSharedInvitation,
  sharedInvitationTitle,
  sharedInvitationType,
} from "../services/shared-content";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";

const TYPE_LABELS = {
  note: "Nota",
  whiteboard: "Desenho",
  resource: "Arquivo",
  subject: "Disciplina",
  project: "Projeto",
  task: "Tarefa",
  course: "Curso",
  lesson: "Aula",
};

const PERMISSION_LABELS = {
  viewer: "leitura",
  commenter: "comentários",
  editor: "edição",
};

export function IncomingSharesPanel({
  types = [],
  description = "",
  title = "Compartilhados com você",
  showEmpty = false,
}) {
  const studyItems = useStudyStore((state) => state.studyItems);
  const courses = useStudyStore((state) => state.courses);
  const tasks = useStudyStore((state) => state.tasks?.list);
  const academic = useStudyStore((state) => state.academic);
  const decks = useStudyStore((state) => state.flashcardDecks);
  const updateSharedPermission = useStudyStore(
    (state) => state.updateSharedPermission,
  );
  const [invitations, setInvitations] = useState([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const typeKey = useMemo(() => [...types].sort().join("|"), [types]);

  const load = useCallback(async () => {
    if (!collaborationCloudConfigured) return;
    try {
      const session = await collaborationCloud.getSession();
      if (!session?.user) {
        setInvitations([]);
        return;
      }
      const result = await collaborationCloud.listMyInvitations();
      const allowed = new Set(typeKey.split("|").filter(Boolean));
      const allInvitations = (result || []).filter(
          (invite) =>
            allowed.has(sharedInvitationType(invite)) &&
            ["pending", "accepted", "revoked"].includes(invite.status),
        );
      const nextInvitations = allInvitations.filter((invite) =>
        ["pending", "accepted"].includes(invite.status),
      );
      setInvitations(nextInvitations);
      allInvitations
        .filter((invite) => ["accepted", "revoked"].includes(invite.status))
        .forEach((invite) => {
          const entityId = invite.shared_entities?.id;
          if (entityId) {
            updateSharedPermission(entityId, invite.permission, invite.status);
          }
        });
    } catch (error) {
      setMessage(error.message || "Não foi possível carregar os compartilhamentos.");
    }
  }, [typeKey, updateSharedPermission]);

  useEffect(() => {
    let unsubscribeInvitations = () => {};
    let active = true;
    const connect = async () => {
      await load();
      if (!active || !collaborationCloudConfigured) return;
      const session = await collaborationCloud.getSession().catch(() => null);
      if (!active || !session?.user?.email) return;
      unsubscribeInvitations();
      unsubscribeInvitations = collaborationCloud.subscribeMyInvitations(
        session.user.email,
        () => load(),
      );
    };
    connect();
    const unsubscribeAuth = collaborationCloud.onAuthStateChange(() => connect());
    window.addEventListener("focus", load);
    return () => {
      active = false;
      unsubscribeInvitations();
      unsubscribeAuth();
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const localState = useMemo(
    () => ({ studyItems, courses, tasks: { list: tasks }, academic, flashcardDecks: decks }),
    [academic, courses, decks, studyItems, tasks],
  );
  const visible = invitations.filter((invite) => {
    const entityId = invite.shared_entities?.id;
    return entityId && !hasImportedSharedEntity(localState, entityId);
  });

  const respond = async (invite, accept) => {
    setBusyId(invite.id);
    setMessage("");
    try {
      if (invite.status === "pending") {
        await collaborationCloud.respondToInvitation({
          invitationId: invite.id,
          accept,
        });
      }
      if (accept) {
        importSharedInvitation(
          { ...invite, status: "accepted", accepted_at: invite.accepted_at || new Date().toISOString() },
          useStudyStore,
        );
        setMessage("Conteúdo adicionado nesta seção e marcado como compartilhado.");
      } else {
        setMessage("Convite recusado.");
      }
      await load();
    } catch (error) {
      setMessage(error.message || "Não foi possível responder ao convite.");
    } finally {
      setBusyId("");
    }
  };

  if (
    !collaborationCloudConfigured ||
    (!showEmpty && !visible.length && !message)
  ) return null;

  return (
    <section className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5" aria-label="Conteúdos compartilhados recebidos">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Icon name="group_add" />
        </span>
        <div>
          <h2 className="text-sm font-black text-[color:var(--on-surface)]">{title}</h2>
          <p className="text-xs text-[color:var(--on-surface-variant)]">{description || "Aceite para adicionar o conteúdo nesta seção."}</p>
        </div>
      </div>

      {visible.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {visible.map((invite) => {
            const type = sharedInvitationType(invite);
            const accepted = invite.status === "accepted";
            return (
              <article key={invite.id} className="rounded-xl border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)] p-4">
                <span className="text-[9px] font-black uppercase tracking-wide text-blue-600">{TYPE_LABELS[type] || "Conteúdo"}</span>
                <h3 className="mt-1 font-black text-[color:var(--on-surface)]">{sharedInvitationTitle(invite)}</h3>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Permissão de {PERMISSION_LABELS[invite.permission] || "leitura"}.</p>
                <div className="mt-4 flex gap-2">
                  <button className="rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-black text-white disabled:opacity-50" type="button" disabled={busyId === invite.id} onClick={() => respond(invite, true)}>
                    {busyId === invite.id ? "Aguarde..." : accepted ? "Adicionar" : "Aceitar"}
                  </button>
                  {!accepted ? (
                    <button className="rounded-lg border border-[color:var(--outline-variant)] px-3 py-2 text-xs font-black text-[color:var(--on-surface-variant)] disabled:opacity-50" type="button" disabled={busyId === invite.id} onClick={() => respond(invite, false)}>Recusar</button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {showEmpty && !visible.length && !message ? (
        <p className="mt-4 rounded-xl bg-[color:var(--surface)] px-4 py-3 text-xs font-semibold text-[color:var(--on-surface-variant)]">
          Nenhum convite pendente no momento.
        </p>
      ) : null}
      {message ? <p className="mt-4 rounded-xl bg-[color:var(--surface)] px-4 py-3 text-xs font-bold text-[color:var(--primary)]" role="status">{message}</p> : null}
    </section>
  );
}
