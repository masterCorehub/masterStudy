import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { collaborationCloud, collaborationCloudConfigured } from "../services/collaboration-cloud";

export function SharedWithMeScreen() {
  const [session, setSession] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try { setInvitations(await collaborationCloud.listMyInvitations()); }
    catch (error) { setMessage(error.message || "Não foi possível carregar os convites."); }
    finally { setLoading(false); }
  };
  useEffect(() => { collaborationCloud.getSession().then((value) => { setSession(value); if (value) load(); else setLoading(false); }); }, []);
  const respond = async (id, accept) => {
    try { await collaborationCloud.respondToInvitation({ invitationId: id, accept }); setMessage(accept ? "Compartilhamento aceito." : "Convite recusado."); await load(); }
    catch (error) { setMessage(error.message || "Não foi possível responder ao convite."); }
  };
  return <main className="campus-page flex-1 overflow-y-auto p-6 md:p-10">
    <div className="mx-auto max-w-5xl">
      <span className="campus-eyebrow">COLABORAÇÃO</span>
      <div className="mt-2 flex items-start justify-between gap-4"><div><h1 className="text-4xl font-black">Compartilhado comigo</h1><p className="mt-2 text-[color:var(--on-surface-variant)]">Notas, tarefas e disciplinas que outras pessoas compartilharam com você.</p></div><Icon name="group" className="text-4xl text-[color:var(--primary)]" /></div>
      {!collaborationCloudConfigured ? <div className="mt-8 rounded-2xl border p-5">Configure o Supabase no arquivo <code>.env</code> para receber convites online.</div> : !session ? <div className="mt-8 rounded-2xl border p-5">Faça login pelo menu de compartilhamento para acessar seus convites.</div> : loading ? <p className="mt-8">Carregando...</p> : <div className="mt-8 space-y-3">{invitations.filter((item) => item.status === "pending").map((item) => <article key={item.id} className="rounded-2xl border bg-[color:var(--surface-container-lowest)] p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase text-[color:var(--primary)]">{item.shared_entities?.entity_type || "Conteúdo"}</p><h2 className="mt-1 text-xl font-bold">{item.shared_entities?.title || "Conteúdo compartilhado"}</h2><p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">Permissão: {item.permission === "editor" ? "Editor" : item.permission === "commenter" ? "Comentador" : "Leitor"}</p></div><div className="flex gap-2"><button className="campus-primary-button" onClick={() => respond(item.id, true)}>Aceitar</button><button className="campus-secondary-button" onClick={() => respond(item.id, false)}>Recusar</button></div></div></article>)}{!invitations.filter((item) => item.status === "pending").length ? <div className="rounded-2xl border p-8 text-center text-[color:var(--on-surface-variant)]">Nenhum convite pendente.</div> : null}</div>}
      {message ? <p className="mt-4 text-sm font-semibold text-[color:var(--primary)]">{message}</p> : null}
    </div>
  </main>;
}
