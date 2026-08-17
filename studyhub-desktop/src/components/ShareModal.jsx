import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import {
  collaborationCloud,
  collaborationCloudConfigured,
} from "../services/collaboration-cloud";

const permissionLabels = {
  viewer: "Leitor",
  commenter: "Comentador",
  editor: "Editor",
};

export function ShareModal({
  entityType,
  entityId,
  title,
  payload = {},
  onShared,
  onClose,
}) {
  const collaboration = useStudyStore((state) => state.collaboration || {});
  const createShareInvitation = useStudyStore(
    (state) => state.createShareInvitation,
  );
  const revokeShareInvitation = useStudyStore(
    (state) => state.revokeShareInvitation,
  );
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("viewer");
  const [message, setMessage] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [remoteInvitations, setRemoteInvitations] = useState(null);
  const onSharedRef = useRef(onShared);

  useEffect(() => {
    onSharedRef.current = onShared;
  }, [onShared]);

  const loadRemoteInvitations = useCallback(async () => {
    if (!collaborationCloudConfigured) return;
    const currentSession = await collaborationCloud.getSession();
    if (!currentSession) return;
    const result = await collaborationCloud.listSentInvitations({
      entityType,
      entityId,
    });
    setRemoteInvitations(result.invitations || []);
    if (result.entity) onSharedRef.current?.(result.entity);
  }, [entityId, entityType]);

  useEffect(() => {
    let mounted = true;
    if (collaborationCloudConfigured) {
      collaborationCloud.getSession().then((current) => {
        if (mounted) {
          setSession(current);
          if (current) loadRemoteInvitations().catch(() => {});
        }
      }).catch(() => {});
    }
    return () => { mounted = false; };
  }, [loadRemoteInvitations]);

  const localInvitations = useMemo(
    () => (collaboration.invitations || []).filter(
        (item) => item.entityType === entityType && item.entityId === entityId,
      ),
    [collaboration.invitations, entityId, entityType],
  );
  const invitations = remoteInvitations ?? localInvitations;

  const authenticate = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = authMode === "signin"
        ? await collaborationCloud.signIn({ email: authEmail, password: authPassword })
        : await collaborationCloud.signUp({ email: authEmail, password: authPassword, name: authName });
      setSession(result?.session || null);
      if (result?.session) await loadRemoteInvitations();
      setMessage(authMode === "signin"
        ? "Login realizado."
        : result?.session
          ? "Conta criada e conectada."
          : "Conta criada. Confirme o e-mail para entrar.");
    } catch (error) {
      setMessage(error.message || "Não foi possível autenticar.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      setMessage("Informe o e-mail da pessoa convidada.");
      return;
    }
    const input = {
      entityType,
      entityId,
      title,
      permission,
      email,
    };
    setBusy(true);
    try {
      if (collaborationCloudConfigured && session) {
        const created = await collaborationCloud.createInvitation({ ...input, payload });
        if (created?.shared_entities) onSharedRef.current?.(created.shared_entities);
        await loadRemoteInvitations();
        setMessage("Convite enviado para o servidor online.");
      } else {
        setMessage("Convite salvo localmente. Configure o servidor para enviá-lo online.");
      }
      createShareInvitation(input);
      setEmail("");
    } catch (error) {
      setMessage(error.message || "Não foi possível criar o convite online.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invite) => {
    setBusy(true);
    setMessage("");
    try {
      if (collaborationCloudConfigured && session && remoteInvitations) {
        await collaborationCloud.revokeInvitation(invite.id);
        await loadRemoteInvitations();
      }
      const localInvite = localInvitations.find(
        (item) => item.email === invite.email && item.status !== "revoked",
      );
      if (localInvite) revokeShareInvitation(localInvite.id);
      setMessage("Acesso revogado.");
    } catch (error) {
      setMessage(error.message || "Não foi possível revogar o acesso.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="campus-task-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <form className="max-w-lg" onSubmit={submit}>
        <header>
          <div>
            <span className="campus-eyebrow">Compartilhamento</span>
            <h2 id="share-title">Compartilhar conteúdo</h2>
            <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">{title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </header>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[color:var(--primary)]/20 bg-[color:var(--primary)]/5 p-4 text-sm">
          <Icon name={collaborationCloudConfigured && session ? "cloud_done" : "cloud_off"} className="mt-0.5 text-[color:var(--primary)]" />
          <p>{collaborationCloudConfigured && session ? "Servidor online conectado. Os convites serão sincronizados." : "O convite fica preparado no dispositivo. Configure o servidor e faça login para enviar online."}</p>
        </div>

        {collaborationCloudConfigured && !session ? (
          <section className="mt-5 rounded-2xl bg-[color:var(--background)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">Acesso online</h3>
              <button type="button" className="text-xs font-bold text-[color:var(--primary)]" onClick={() => setAuthMode((mode) => mode === "signin" ? "signup" : "signin")}>
                {authMode === "signin" ? "Criar conta" : "Já tenho conta"}
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {authMode === "signup" ? <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Seu nome" /> : null}
              <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Seu e-mail" />
              <input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Senha" />
              <button className="campus-primary-button" type="button" disabled={busy} onClick={authenticate}>{busy ? "Aguarde..." : authMode === "signin" ? "Entrar" : "Criar conta"}</button>
            </div>
          </section>
        ) : null}

        <div className="campus-task-form-grid mt-5">
          <label>
            <span>E-mail</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colega@exemplo.com" />
          </label>
          <label>
            <span>Permissão</span>
            <select value={permission} onChange={(event) => setPermission(event.target.value)}>
              {Object.entries(permissionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {message ? <p className="mt-3 text-sm font-semibold text-[color:var(--primary)]">{message}</p> : null}

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Convites deste conteúdo</h3>
            <span className="text-xs text-[color:var(--on-surface-variant)]">{invitations.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {invitations.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl bg-[color:var(--background)] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{invite.email}</p>
                  <p className="text-xs text-[color:var(--on-surface-variant)]">{permissionLabels[invite.permission]} · {invite.status === "accepted" ? "Aceito" : invite.status === "declined" ? "Recusado" : invite.status === "revoked" ? "Revogado" : "Pendente"}</p>
                </div>
                {!["revoked", "declined", "expired"].includes(invite.status) ? <button type="button" disabled={busy} className="text-xs font-bold text-[color:var(--error)] disabled:opacity-50" onClick={() => revoke(invite)}>Revogar</button> : null}
              </div>
            ))}
            {!invitations.length ? <p className="text-sm text-[color:var(--on-surface-variant)]">Nenhum convite criado.</p> : null}
          </div>
        </section>

        <footer>
          <button type="button" onClick={onClose}>Fechar</button>
          <button className="campus-primary-button" type="submit" disabled={busy || (collaborationCloudConfigured && !session)}><Icon name="send" /> Criar convite</button>
        </footer>
      </form>
    </div>
  );
}
