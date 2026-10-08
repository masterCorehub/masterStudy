import { useEffect, useMemo, useState } from "react";
import { normalizeAcademicStateSnapshot } from "../domain/academic";
import {
  collaborationCloud,
  collaborationCloudConfigured,
  initialAuthRedirect,
} from "../services/collaboration-cloud";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { IncomingSharesPanel } from "../components/IncomingSharesPanel";

const SYNC_LABELS = {
  idle: "Aguardando alterações",
  loading: "Carregando seus conteúdos",
  saving: "Salvando alterações",
  saved: "Tudo sincronizado",
  "conflict-resolved": "Alterações dos dispositivos foram combinadas",
  error: "Falha na sincronização",
};

const formatBackupDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
};

export function AccountScreen({ required = false, recovery = false, onRecoveryComplete }) {
  const initialRecovery =
    recovery || initialAuthRedirect.isRecovery ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("auth") === "recovery");
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState(initialRecovery ? "recovery" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState(initialAuthRedirect.errorMessage);
  const [messageKind, setMessageKind] = useState(initialAuthRedirect.errorMessage ? "error" : "info");
  const [busy, setBusy] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [syncState, setSyncState] = useState({ status: "idle" });
  const [backups, setBackups] = useState([]);
  const [showBackups, setShowBackups] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  const displayName = useMemo(
    () => session?.user?.user_metadata?.display_name || "",
    [session],
  );

  const announce = (text, kind = "info") => {
    setMessage(text);
    setMessageKind(kind);
  };

  const loadBackups = async () => {
    try {
      setBackups(await collaborationCloud.listAccountBackups());
    } catch (error) {
      if (!/does not exist|schema cache/i.test(error.message || "")) {
        announce(error.message || "Não foi possível carregar o histórico.", "error");
      }
    }
  };

  useEffect(() => {
    if (!collaborationCloudConfigured) return undefined;
    let mounted = true;
    collaborationCloud
      .getSession()
      .then((currentSession) => {
        if (!mounted) return;
        setSession(currentSession);
        setName(currentSession?.user?.user_metadata?.display_name || "");
      })
      .catch((error) => {
        if (mounted) announce(error.message || "Não foi possível verificar a conta.", "error");
      });

    const unsubscribeAuth = collaborationCloud.onAuthStateChange(
      (currentSession, event) => {
        if (!mounted) return;
        setSession(currentSession);
        setName(currentSession?.user?.user_metadata?.display_name || "");
        if (event === "PASSWORD_RECOVERY") setMode("recovery");
      },
    );
    const handleCloudStatus = (event) => setSyncState(event.detail || { status: "idle" });
    window.addEventListener("studyhub-cloud-status", handleCloudStatus);
    return () => {
      mounted = false;
      unsubscribeAuth?.();
      window.removeEventListener("studyhub-cloud-status", handleCloudStatus);
    };
  }, []);

  useEffect(() => {
    if (session?.user?.id && showBackups) loadBackups();
  }, [session?.user?.id, showBackups]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        await collaborationCloud.requestPasswordReset(email);
        announce("Enviamos um link de recuperação. Confira também a caixa de spam.", "success");
        return;
      }

      if (mode === "recovery") {
        if (!session || initialAuthRedirect.errorMessage) throw new Error(initialAuthRedirect.errorMessage || "Este link não criou uma sessão de recuperação. Solicite um novo e-mail e abra o link mais recente.");
        if (password !== passwordConfirmation) throw new Error("As senhas não coincidem.");
        await collaborationCloud.updatePassword(password);
        setPassword("");
        setPasswordConfirmation("");
        announce("Senha alterada com segurança.", "success");
        if (onRecoveryComplete) onRecoveryComplete();
        else {
          setMode("signin");
          window.history.replaceState(null, "", window.location.pathname);
        }
        return;
      }

      if (mode === "signup") {
        const result = await collaborationCloud.signUp({ email, password, name });
        setSession(result?.session || null);
        setConfirmationPending(!result?.session);
        announce(
          result?.session
            ? "Conta criada e conectada."
            : "Conta criada. Confirme seu e-mail para concluir o acesso.",
          "success",
        );
        return;
      }

      const result = await collaborationCloud.signIn({ email, password });
      setSession(result?.session || null);
      announce("Você está conectado.", "success");
    } catch (error) {
      announce(error.message || "Não foi possível acessar sua conta.", "error");
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    setBusy(true);
    try {
      await collaborationCloud.resendConfirmation(email);
      announce("E-mail de confirmação reenviado.", "success");
    } catch (error) {
      announce(error.message || "Não foi possível reenviar o e-mail.", "error");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await collaborationCloud.signOut();
      setSession(null);
      announce("Sessão encerrada.", "success");
    } catch (error) {
      announce(error.message || "Não foi possível sair da conta.", "error");
    } finally {
      setBusy(false);
    }
  };

  const updateProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await collaborationCloud.updateProfile({ name });
      const currentSession = await collaborationCloud.getSession();
      setSession(currentSession);
      announce("Perfil atualizado.", "success");
    } catch (error) {
      announce(error.message || "Não foi possível atualizar o perfil.", "error");
    } finally {
      setBusy(false);
    }
  };

  const syncNow = () => {
    setSyncState({ status: "saving" });
    window.dispatchEvent(new Event("studyhub:force-cloud-sync"));
  };

  const restoreBackup = async (revision) => {
    if (!window.confirm("Restaurar esta versão? O estado atual continuará disponível no histórico.")) return;
    setBusy(true);
    try {
      const restored = await collaborationCloud.restoreAccountBackup(revision);
      if (restored?.state) {
        useStudyStore.setState(normalizeAcademicStateSnapshot(restored.state));
      }
      announce(`Versão ${revision} restaurada.`, "success");
      await loadBackups();
    } catch (error) {
      announce(error.message || "Não foi possível restaurar essa versão.", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmation !== "EXCLUIR") return;
    setBusy(true);
    try {
      await collaborationCloud.deleteAccount();
      setSession(null);
      setShowDeleteAccount(false);
      setDeleteConfirmation("");
      announce("Conta e dados remotos excluídos.", "success");
    } catch (error) {
      announce(
        error.message || "Não foi possível excluir a conta. Verifique se a função do Supabase foi publicada.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const messageClasses =
    messageKind === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
      : messageKind === "success"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "border-blue-500/20 bg-blue-500/10 text-[color:var(--primary)]";

  const authTitle =
    mode === "signup"
      ? "Criar conta"
      : mode === "forgot"
        ? "Recuperar senha"
        : mode === "recovery"
          ? "Definir nova senha"
          : "Entrar";

  return (
    <main className={`${required ? "account-auth-shell min-h-screen" : "campus-page flex-1"} overflow-y-auto bg-[color:var(--background)] px-5 py-8 md:p-10`}>
      <div className={`mx-auto ${required ? "account-auth-layout" : "max-w-3xl"}`}>
        {required ? (
          <aside className="account-auth-intro">
            <div className="flex items-center gap-3">
              <div className="account-auth-logo"><img src={`${import.meta.env.BASE_URL}assets/masterstudy-logo.svg`} alt="" className="h-full w-full rounded-[inherit]" /></div>
              <div><strong className="block text-lg tracking-[-0.02em]">masterStudy</strong><p className="text-xs text-white/60">Ambiente de estudos</p></div>
            </div>
            <div className="account-auth-copy">
              <span className="account-auth-kicker">SEU ESPAÇO ACADÊMICO</span>
              <h1>Organize seus estudos.<br />Mantenha o foco.</h1>
              <p>Notas, tarefas, leituras e revisões reunidas em um ambiente calmo, privado e sincronizado.</p>
            </div>
            <div className="account-auth-benefits" aria-label="Benefícios da plataforma">
              <div><Icon name="cloud_done" /><span><strong>Sincronização contínua</strong><small>Continue de onde parou, na web ou no desktop.</small></span></div>
              <div><Icon name="shield_lock" /><span><strong>Seus dados protegidos</strong><small>Conteúdo privado e acesso seguro à sua conta.</small></span></div>
            </div>
            <p className="account-auth-footer">CAMPUSFLOW · DEEP FOCUS</p>
          </aside>
        ) : null}

        {!required ? <><span className="campus-eyebrow">CONTA E SINCRONIZAÇÃO</span><h1 className="mt-2 text-4xl font-black md:text-5xl">Sua conta masterStudy</h1><p className="mt-3 max-w-2xl text-[color:var(--on-surface-variant)]">Seus conteúdos são privados e as alterações são sincronizadas automaticamente entre web e desktop.</p></> : null}

        {!collaborationCloudConfigured ? (
          <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-800 dark:text-amber-200">
            <strong>Servidor ainda não configurado</strong>
            <p className="mt-1 text-sm">Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para habilitar o acesso.</p>
          </div>
        ) : session && mode !== "recovery" ? (
          <div className="mt-8">
            <IncomingSharesPanel
              types={["note", "whiteboard", "resource", "subject", "project", "task", "course", "lesson"]}
              title="Convites recebidos"
              showEmpty
              description="Aceite ou recuse aqui. Ao aceitar, o conteúdo será adicionado automaticamente na seção correspondente."
            />
            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <section className="rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-lowest)] p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-[color:var(--primary)]">
                    <Icon name="account_circle" className="text-4xl" />
                  </span>
                  <div>
                    <h2 className="text-xl font-black">{displayName || "Conta conectada"}</h2>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">{session.user.email}</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300">Conectado</span>
              </div>

              <form className="mt-7" onSubmit={updateProfile}>
                <label className="block text-sm font-bold" htmlFor="account-name">Nome de exibição</label>
                <div className="mt-2 flex gap-2">
                  <input id="account-name" className="min-w-0 flex-1" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
                  <button className="campus-secondary-button" disabled={busy || name.trim() === displayName} type="submit">Salvar</button>
                </div>
              </form>

              <div className="mt-7 rounded-xl bg-[color:var(--surface-container-low)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Icon name={syncState.status === "error" ? "sync_problem" : "cloud_done"} className="text-2xl text-[color:var(--primary)]" />
                    <div>
                      <strong className="text-sm">{SYNC_LABELS[syncState.status] || SYNC_LABELS.idle}</strong>
                      {syncState.updatedAt ? <p className="text-xs text-[color:var(--on-surface-variant)]">Última gravação: {formatBackupDate(syncState.updatedAt)}</p> : null}
                    </div>
                  </div>
                  <button className="campus-secondary-button" onClick={syncNow} disabled={syncState.status === "saving"} type="button">
                    <Icon name="sync" /> Sincronizar agora
                  </button>
                </div>
                {syncState.error ? <p className="mt-3 text-xs font-semibold text-red-600">{syncState.error}</p> : null}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button className="campus-secondary-button" type="button" onClick={() => setShowBackups((current) => !current)}>
                  <Icon name="history" /> {showBackups ? "Ocultar histórico" : "Histórico de versões"}
                </button>
                <button className="campus-secondary-button" type="button" onClick={logout} disabled={busy}>Sair da conta</button>
              </div>

              {showBackups ? (
                <div className="mt-5 border-t border-[color:var(--outline-variant)]/30 pt-5">
                  <h3 className="text-sm font-black">Backups automáticos</h3>
                  <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Até 30 versões anteriores ficam disponíveis no servidor.</p>
                  <div className="mt-3 grid gap-2">
                    {backups.map((backup) => (
                      <div key={backup.revision} className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--outline-variant)]/30 px-4 py-3">
                        <div><strong className="text-sm">Versão {backup.revision}</strong><p className="text-xs text-[color:var(--on-surface-variant)]">{formatBackupDate(backup.archived_at)}</p></div>
                        <button className="campus-secondary-button" type="button" disabled={busy} onClick={() => restoreBackup(backup.revision)}>Restaurar</button>
                      </div>
                    ))}
                    {!backups.length ? <p className="rounded-xl bg-[color:var(--surface-container-low)] p-4 text-sm text-[color:var(--on-surface-variant)]">O histórico aparecerá após as próximas alterações sincronizadas.</p> : null}
                  </div>
                </div>
              ) : null}
            </section>

            <aside className="rounded-2xl border border-[color:var(--outline-variant)]/40 bg-[color:var(--surface-container-lowest)] p-6 shadow-sm">
              <Icon name="verified_user" className="text-3xl text-[color:var(--primary)]" />
              <h2 className="mt-3 text-lg font-black">Privacidade da conta</h2>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--on-surface-variant)]">Arquivos remotos ficam em um bucket privado e só são abertos por links temporários.</p>
              <button className="mt-8 text-sm font-black text-red-600" type="button" onClick={() => setShowDeleteAccount(true)}>Excluir minha conta e dados</button>
            </aside>
            </div>
          </div>
        ) : (
          <form className={`account-auth-form ${required ? "" : "mt-8 max-w-xl"}`} onSubmit={submit}>
            <div className="account-auth-form-heading">
              <span className="campus-eyebrow">{mode === "signup" ? "NOVA CONTA" : mode === "forgot" || mode === "recovery" ? "RECUPERAÇÃO" : "BEM-VINDO DE VOLTA"}</span>
              <h2>{authTitle === "Entrar" ? "Entre na sua conta" : authTitle}</h2>
              <p>{mode === "signup" ? "Crie seu espaço de estudos em poucos segundos." : mode === "forgot" ? "Enviaremos as instruções para o seu e-mail." : mode === "recovery" ? "Escolha uma senha nova e segura." : "Acesse seus estudos e continue de onde parou."}</p>
            </div>

            {mode === "signup" ? (
              <label className="account-auth-field" htmlFor="signup-name"><span>Nome</span><div><Icon name="person" /><input id="signup-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoComplete="name" placeholder="Como devemos chamar você?" required /></div></label>
            ) : null}
            {mode !== "recovery" ? (
              <label className="account-auth-field" htmlFor="account-email"><span>E-mail</span><div><Icon name="mail" /><input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="voce@exemplo.com" required /></div></label>
            ) : null}
            {mode !== "forgot" ? (
              <label className="account-auth-field" htmlFor="account-password"><span>{mode === "recovery" ? "Nova senha" : "Senha"}</span><div><Icon name="lock" /><input id="account-password" aria-label={mode === "recovery" ? "Nova senha" : "Senha"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="Mínimo de 8 caracteres" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}><Icon name={showPassword ? "visibility_off" : "visibility"} /></button></div></label>
            ) : null}
            {mode === "recovery" ? (
              <label className="account-auth-field" htmlFor="account-password-confirmation"><span>Repita a nova senha</span><div><Icon name="lock_reset" /><input id="account-password-confirmation" aria-label="Repita a nova senha" type={showPassword ? "text" : "password"} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={8} autoComplete="new-password" placeholder="Repita a senha" required /></div></label>
            ) : null}
            {mode === "recovery" ? <button type="button" className="account-auth-link mt-3 block" onClick={() => { setMode("forgot"); setMessage(""); }}>Solicitar novo link de recuperação</button> : null}
            {mode === "signin" ? <button type="button" className="account-auth-link ml-auto mt-3 block" onClick={() => { setMode("forgot"); setMessage(""); }}>Esqueci minha senha</button> : null}

            {message ? <p className={`mt-5 rounded-xl border p-3 text-sm font-semibold ${messageClasses}`} aria-live="polite">{message}</p> : null}
            <button className="account-auth-submit" disabled={busy} type="submit">{busy ? <><span className="account-auth-spinner" /> Aguarde...</> : <>{authTitle}<Icon name="arrow_forward" /></>}</button>
            {confirmationPending ? <button className="campus-secondary-button mt-3 w-full justify-center" disabled={busy || !email} type="button" onClick={resendConfirmation}>Reenviar confirmação</button> : null}
            {mode !== "recovery" ? <p className="account-auth-switch">{mode === "signup" ? "Já possui uma conta?" : mode === "forgot" ? "Lembrou sua senha?" : "Ainda não tem uma conta?"} <button type="button" onClick={() => { setMode(mode === "signup" || mode === "forgot" ? "signin" : "signup"); setMessage(""); }}>{mode === "signup" || mode === "forgot" ? "Entrar" : "Criar conta"}</button></p> : null}
            <p className="account-auth-security"><Icon name="lock" /> Conexão segura e dados privados</p>
          </form>
        )}

        {message && session && mode !== "recovery" ? <p className={`mt-5 rounded-xl border p-3 text-sm font-semibold ${messageClasses}`} aria-live="polite">{message}</p> : null}
      </div>

      {showDeleteAccount ? (
        <div className="campus-task-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDeleteAccount(false); }}>
          <section className="w-full max-w-md rounded-2xl bg-[color:var(--surface)] p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-600"><Icon name="delete_forever" /></span>
            <h2 id="delete-account-title" className="mt-4 text-xl font-black">Excluir conta definitivamente?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--on-surface-variant)]">Isso remove o login, o estado sincronizado, compartilhamentos e arquivos do servidor. Digite <strong>EXCLUIR</strong> para confirmar.</p>
            <input className="mt-5 w-full" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="EXCLUIR" autoFocus />
            <div className="mt-6 flex justify-end gap-3">
              <button className="campus-secondary-button" type="button" onClick={() => setShowDeleteAccount(false)}>Cancelar</button>
              <button className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40" type="button" disabled={busy || deleteConfirmation !== "EXCLUIR"} onClick={deleteAccount}>{busy ? "Excluindo..." : "Excluir conta"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
