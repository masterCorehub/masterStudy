import { useCallback, useEffect, useState } from "react";
import {
  collaborationCloud,
  collaborationCloudConfigured,
} from "../services/collaboration-cloud";
import { Icon } from "../ui/Icon";

const permissionLabels = {
  owner: "Proprietário",
  viewer: "Somente leitura",
  commenter: "Pode comentar",
  editor: "Pode editar",
};

export function SharedNoteCollaborationPanel({ note }) {
  const sharedEntityId = note?.sharedEntityId;
  const permission = note?.sharingRole === "owner"
    ? "owner"
    : note?.sharingPermission || "viewer";
  const canComment = ["owner", "commenter", "editor"].includes(permission);
  const [comments, setComments] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!collaborationCloudConfigured || !sharedEntityId || note?.sharingRevoked) return;
    try {
      const [session, result] = await Promise.all([
        collaborationCloud.getSession(),
        collaborationCloud.listSharedComments(sharedEntityId),
      ]);
      setCurrentUserId(session?.user?.id || "");
      setComments(result || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Não foi possível carregar os comentários.");
    }
  }, [note?.sharingRevoked, sharedEntityId]);

  useEffect(() => {
    if (note?.sharingRevoked) return undefined;
    load();
    const unsubscribe = collaborationCloud.subscribeSharedComments(
      sharedEntityId,
      () => load(),
    );
    return unsubscribe;
  }, [load, note?.sharingRevoked, sharedEntityId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!body.trim() || !canComment) return;
    setBusy(true);
    setMessage("");
    try {
      await collaborationCloud.addSharedComment({ sharedEntityId, body });
      setBody("");
      await load();
    } catch (error) {
      setMessage(error.message || "Não foi possível enviar o comentário.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (commentId) => {
    setBusy(true);
    try {
      await collaborationCloud.deleteSharedComment(commentId);
      await load();
    } catch (error) {
      setMessage(error.message || "Não foi possível excluir o comentário.");
    } finally {
      setBusy(false);
    }
  };

  if (!collaborationCloudConfigured || !sharedEntityId) return null;

  if (note?.sharingRevoked) {
    return (
      <section className="campus-note-side-card border border-red-500/20 bg-red-500/5">
        <h4 className="flex items-center gap-2 text-[color:var(--error)]">
          <Icon name="lock" /> Acesso revogado
        </h4>
        <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
          Você não pode mais editar nem comentar esta nota.
        </p>
      </section>
    );
  }

  return (
    <section className="campus-note-side-card border border-blue-500/20 bg-blue-500/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="campus-note-card-label">Colaboração</p>
          <h4 className="mt-1 flex items-center gap-2">
            <Icon name="forum" /> Comentários
          </h4>
        </div>
        <span className="rounded-full bg-blue-600 px-2 py-1 text-[9px] font-black text-white">
          {permissionLabels[permission] || permissionLabels.viewer}
        </span>
      </div>

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
        {comments.map((comment) => (
          <article key={comment.id} className="rounded-xl bg-[color:var(--surface)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <strong className="block truncate text-xs">
                  {comment.author_name || "Participante"}
                </strong>
                <time className="text-[9px] text-[color:var(--on-surface-variant)]">
                  {new Date(comment.created_at).toLocaleString("pt-BR")}
                </time>
              </div>
              {comment.user_id === currentUserId ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(comment.id)}
                  aria-label="Excluir comentário"
                  className="text-[color:var(--error)] disabled:opacity-50"
                >
                  <Icon name="delete" className="text-[15px]" />
                </button>
              ) : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[color:var(--on-surface-variant)]">
              {comment.body}
            </p>
          </article>
        ))}
        {!comments.length ? (
          <p className="rounded-xl bg-[color:var(--surface)] p-3 text-xs text-[color:var(--on-surface-variant)]">
            Nenhum comentário ainda.
          </p>
        ) : null}
      </div>

      {canComment ? (
        <form className="mt-3" onSubmit={submit}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={10_000}
            rows={3}
            placeholder="Escreva um comentário..."
            className="w-full resize-none rounded-xl border border-[color:var(--outline-variant)]/30 bg-[color:var(--surface)] p-3 text-xs outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="mt-2 w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {busy ? "Enviando..." : "Comentar"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-[10px] font-bold text-[color:var(--on-surface-variant)]">
          Sua permissão permite visualizar a nota, mas não comentar.
        </p>
      )}
      {message ? <p className="mt-2 text-[10px] font-bold text-[color:var(--error)]">{message}</p> : null}
    </section>
  );
}
