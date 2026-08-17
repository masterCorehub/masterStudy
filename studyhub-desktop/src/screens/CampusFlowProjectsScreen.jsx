import { useMemo, useState, useEffect } from "react";
import { SCREEN_IDS } from "../app/screenIds";
import { getAcademicSemesterData, getProjectProgress } from "../domain/academic";
import { useStudyStore } from "../store/useStore";
import { Icon } from "../ui/Icon";
import { ShareModal } from "../components/ShareModal";
import { ProgrammingProjectPanel } from "../components/ProgrammingProjectPanel";
import { IncomingSharesPanel } from "../components/IncomingSharesPanel";

const emptyProject = {
  title: "",
  description: "",
  subjectId: "",
  date: "",
  progress: 0,
  status: "in_progress",
  projectKind: "academic",
  collaborationMode: "individual",
  repositoryUrl: "",
  stack: "",
  teamText: "",
  milestones: [],
  resources: [],
  team: [],
  files: [],
};

const projectKindLabels = {
  academic: "Trabalho acadêmico",
  programming: "Projeto de programação",
};

const statusLabels = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  review: "Em revisão",
  completed: "Concluído",
};

const projectKindOf = (project) =>
  project.projectKind || (project.programming ? "programming" : "academic");

const projectTeam = (project) =>
  project.team?.length ? project.team : project.members || [];

const parseTeam = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const match = entry.match(/^(.+?)\s*<([^>]+)>$/);
      return {
        id: `member-${Date.now()}-${index}`,
        name: (match?.[1] || entry).trim(),
        email: (match?.[2] || "").trim(),
        role: "Integrante",
      };
    });

const dueLabel = (date) =>
  date
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`))
    : "Sem prazo";

export function CampusFlowProjectsScreen({ onNavigate }) {
  const academicState = useStudyStore((state) => state.academic);
  const addAcademicEntity = useStudyStore((state) => state.addAcademicEntity);
  const deleteAcademicEntity = useStudyStore((state) => state.deleteAcademicEntity);
  const setActiveProject = useStudyStore((state) => state.setActiveProject);
  const collaboration = useStudyStore((state) => state.collaboration);
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyProject);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const handleOpenAddProject = (e) => {
      const isProg = e?.detail?.programming;
      setForm({
        ...emptyProject,
        projectKind: isProg ? "programming" : "academic",
      });
      setShowForm(true);
    };
    window.addEventListener("studyhub-open-add-project", handleOpenAddProject);
    return () => window.removeEventListener("studyhub-open-add-project", handleOpenAddProject);
  }, []);
  const subjectMap = new Map(academic.subjects.map((subject) => [subject.id, subject]));
  const sharedProjectIds = useMemo(
    () =>
      new Set(
        (collaboration?.shares || [])
          .filter((share) => share.entityType === "project" && share.status !== "revoked")
          .map((share) => String(share.entityId)),
      ),
    [collaboration?.shares],
  );
  const projects = academic.projects.filter((project) => {
    const matchesSearch = `${project.title} ${project.description || ""} ${project.stack || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR"));
    if (!matchesSearch) return false;
    if (filter === "all") return true;
    if (filter === "group") return project.collaborationMode === "group" || projectTeam(project).length > 0;
    if (filter === "shared") return sharedProjectIds.has(String(project.id)) || project.sharedWithMe;
    return projectKindOf(project) === filter;
  });
  const counts = {
    all: academic.projects.length,
    programming: academic.projects.filter((project) => projectKindOf(project) === "programming").length,
    group: academic.projects.filter((project) => project.collaborationMode === "group" || projectTeam(project).length > 0).length,
    due: academic.projects.filter((project) => project.status !== "completed" && (project.date || project.dueDate)).length,
  };

  const open = (project) => {
    setActiveProject(project.id);
    onNavigate?.(SCREEN_IDS.PROJECT_DETAILS);
  };

  const save = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    const team = parseTeam(form.teamText);
    addAcademicEntity("projects", {
      ...form,
      teamText: undefined,
      team,
      semesterId: academic.activeSemesterId,
      programming:
        form.projectKind === "programming"
          ? {
              language: form.stack,
              milestones: [],
              bugs: [],
              architectureNotes: "",
            }
          : undefined,
      createdAt: Date.now(),
    });
    setForm(emptyProject);
    setShowForm(false);
  };

  const removeProject = (project, event) => {
    event.stopPropagation();
    if (!window.confirm(`Excluir “${project.title}”?\n\nEsta ação remove o trabalho ou projeto desta conta.`)) return;
    deleteAcademicEntity("projects", project.id);
  };

  return (
    <main className="campus-projects-page">
      <div className="campus-projects-inner">
        <header>
          <div><span className="campus-eyebrow">COLABORAÇÃO E ENTREGA</span><h1>Trabalhos e projetos</h1><p>Organize trabalhos acadêmicos, código, equipe, arquivos e prazos.</p></div>
          <button className="campus-primary-button" type="button" onClick={() => setShowForm(true)}><Icon name="add" /> Novo trabalho ou projeto</button>
        </header>
        <section className="campus-project-summary" aria-label="Resumo dos projetos">
          <article><Icon name="folder_open" /><span><strong>{counts.all}</strong><small>Total</small></span></article>
          <article><Icon name="terminal" /><span><strong>{counts.programming}</strong><small>Programação</small></span></article>
          <article><Icon name="groups" /><span><strong>{counts.group}</strong><small>Em grupo</small></span></article>
          <article><Icon name="event" /><span><strong>{counts.due}</strong><small>Com prazo</small></span></article>
        </section>
        <div className="campus-project-toolbar">
          <label className="campus-project-search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, descrição ou tecnologia..." /></label>
          <div className="campus-project-filters">
            {[
              ["all", "Todos"],
              ["academic", "Trabalhos"],
              ["programming", "Programação"],
              ["group", "Em grupo"],
              ["shared", "Compartilhados"],
            ].map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} type="button" onClick={() => setFilter(id)}>{label}</button>)}
          </div>
        </div>
        <IncomingSharesPanel
          types={["project"]}
          description="Projetos aceitos ficam nesta área com a permissão e a origem identificadas."
        />
        <section className="campus-project-grid">
          {projects.map((project) => {
            const subject = subjectMap.get(project.subjectId);
            const progress = Number(project.progress ?? getProjectProgress(project));
            const kind = projectKindOf(project);
            const team = projectTeam(project);
            const shared = sharedProjectIds.has(String(project.id)) || project.sharedWithMe;
            return (
              <article key={project.id} className={`campus-project-card ${project.status === "completed" ? "completed" : ""}`} style={{ "--project-color": subject?.color || "#bcc7de" }} role="button" tabIndex={0} onClick={() => open(project)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(project); } }}>
                <i />
                <header><span>{kind === "programming" ? <Icon name="terminal" /> : <Icon name="description" />}{projectKindLabels[kind]}</span><span className="campus-card-actions">{shared ? <b className="campus-shared-badge"><Icon name="group" /> Compartilhado</b> : null}<button className="campus-card-icon-action danger" type="button" onClick={(event) => removeProject(project, event)} title="Excluir trabalho ou projeto" aria-label={`Excluir ${project.title}`}><Icon name="delete" /></button></span></header>
                <h2>{project.title}</h2>
                <p>{project.description || "Projeto acadêmico sem descrição."}</p>
                <section className="campus-project-meta">
                  <span>{subject?.name || "Sem disciplina"}</span>
                  {project.stack ? <span>{project.stack}</span> : null}
                  {team.length ? <span>{team.length} integrante{team.length === 1 ? "" : "s"}</span> : <span>Individual</span>}
                </section>
                <div><span>Progresso</span><strong>{progress}%</strong></div>
                <em><b style={{ width: `${progress}%` }} /></em>
                <footer><span><Icon name="schedule" /> {dueLabel(project.date || project.dueDate)}</span><span className="campus-project-avatars">{team.slice(0, 3).map((member, index) => <b key={member.id || index}>{String(member.name || "?")[0]}</b>)}</span></footer>
              </article>
            );
          })}
          {!projects.length ? <button className="campus-create-card" type="button" onClick={() => setShowForm(true)}><Icon name="add_circle" /><strong>Criar primeiro projeto</strong><span>Organize marcos, arquivos e entrega final.</span></button> : null}
        </section>
      </div>
      <button className="campus-project-fab" type="button" onClick={() => setShowForm(true)}><Icon name="add" /></button>
      {showForm ? (
        <div className="campus-task-modal" role="dialog" aria-modal="true">
          <form onSubmit={save}>
            <header><div><span className="campus-eyebrow">{academic.semester.name}</span><h2>Novo trabalho ou projeto</h2></div><button type="button" onClick={() => setShowForm(false)}><Icon name="close" /></button></header>
            <label><span>Título</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label><span>Descrição</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <div className="campus-task-form-grid">
              <label><span>Tipo</span><select value={form.projectKind} onChange={(event) => setForm({ ...form, projectKind: event.target.value })}><option value="academic">Trabalho acadêmico</option><option value="programming">Projeto de programação</option></select></label>
              <label><span>Formato</span><select value={form.collaborationMode} onChange={(event) => setForm({ ...form, collaborationMode: event.target.value })}><option value="individual">Individual</option><option value="group">Em grupo</option></select></label>
              <label><span>Disciplina</span><select value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })}><option value="">Sem disciplina</option>{academic.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
              <label><span>Prazo</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              {form.projectKind === "programming" ? <label><span>Tecnologia principal</span><input value={form.stack} onChange={(event) => setForm({ ...form, stack: event.target.value })} placeholder="React, C#, Python..." /></label> : null}
              {form.projectKind === "programming" ? <label><span>Repositório</span><input type="url" value={form.repositoryUrl} onChange={(event) => setForm({ ...form, repositoryUrl: event.target.value })} placeholder="https://github.com/..." /></label> : null}
            </div>
            {form.collaborationMode === "group" ? <label><span>Integrantes</span><input value={form.teamText} onChange={(event) => setForm({ ...form, teamText: event.target.value })} placeholder="Ana <ana@email.com>, Lucas <lucas@email.com>" /><small>Separe os integrantes por vírgula. O convite online poderá ser enviado depois.</small></label> : null}
            <footer><button type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="campus-primary-button" type="submit">Criar projeto</button></footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}

export function CampusFlowProjectDetailsScreen({ onNavigate }) {
  const activeProjectId = useStudyStore((state) => state.activeProjectId);
  const academicState = useStudyStore((state) => state.academic);
  const updateAcademicEntity = useStudyStore((state) => state.updateAcademicEntity);
  const deleteAcademicEntity = useStudyStore((state) => state.deleteAcademicEntity);
  const collaboration = useStudyStore((state) => state.collaboration);
  const academic = useMemo(() => getAcademicSemesterData(academicState), [academicState]);
  const project = academic.projects.find((item) => item.id === activeProjectId);
  const [newMilestone, setNewMilestone] = useState("");
  const [newMilestoneOwner, setNewMilestoneOwner] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("Integrante");
  const [resourceUrl, setResourceUrl] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  if (!project) return <main className="campus-page"><div className="campus-library-page"><button onClick={() => onNavigate?.(SCREEN_IDS.PROJECTS)}>Voltar aos projetos</button></div></main>;
  const subject = academic.subjects.find((item) => item.id === project.subjectId);
  const milestones = project.milestones || project.tasks || [];
  const team = projectTeam(project);
  const kind = projectKindOf(project);
  const shared = Boolean(
    project.sharedWithMe ||
      (collaboration?.shares || []).some(
        (share) =>
          share.entityType === "project" &&
          String(share.entityId) === String(project.id) &&
          share.status !== "revoked",
      ),
  );
  const completed = milestones.filter((item) => item.completed).length;
  const progress = milestones.length ? Math.round((completed / milestones.length) * 100) : Number(project.progress || 0);
  const update = (changes) => updateAcademicEntity("projects", project.id, changes);
  const removeProject = () => {
    if (!window.confirm(`Excluir “${project.title}”?\n\nEsta ação remove o trabalho ou projeto desta conta.`)) return;
    deleteAcademicEntity("projects", project.id);
    onNavigate?.(SCREEN_IDS.PROJECTS);
  };
  const addFile = async () => {
    const selected = await window.studyhubDesktop?.selectFile?.({ properties: ["openFile", "multiSelections"] });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (!paths.length) return;
    update({ files: [...(project.files || []), ...paths.map((path) => ({ id: `file-${Date.now()}-${path}`, path, name: path.split(/[\\/]/).pop() }))] });
  };
  const addMember = (event) => {
    event.preventDefault();
    if (!memberName.trim()) return;
    update({
      collaborationMode: "group",
      team: [
        ...team,
        {
          id: `member-${Date.now()}`,
          name: memberName.trim(),
          email: memberEmail.trim().toLowerCase(),
          role: memberRole,
        },
      ],
    });
    setMemberName("");
    setMemberEmail("");
    setMemberRole("Integrante");
  };
  const addResource = (event) => {
    event.preventDefault();
    const normalized = /^https?:\/\//i.test(resourceUrl.trim())
      ? resourceUrl.trim()
      : `https://${resourceUrl.trim()}`;
    if (!resourceUrl.trim()) return;
    update({
      resources: [
        ...(project.resources || []),
        {
          id: `resource-${Date.now()}`,
          title: resourceUrl.trim(),
          url: normalized,
        },
      ],
    });
    setResourceUrl("");
  };
  const openResource = (resource) => {
    if (resource.url) window.studyhubDesktop?.openExternal?.(resource.url);
    else if (resource.path) window.studyhubDesktop?.openPath?.(resource.path);
  };

  return (
    <main className="campus-project-detail-page">
      <header className="campus-project-detail-top"><label><Icon name="search" /><input placeholder="Buscar no projeto..." /></label><div><Icon name="notifications" /><Icon name="settings" /></div></header>
      <div className="campus-project-detail-inner">
        <header className="campus-project-detail-hero">
          <div>
            <span>{projectKindLabels[kind]} • {subject?.name || "Sem disciplina"} • {dueLabel(project.date || project.dueDate)}</span>
            <div className="campus-project-title-row"><h1>{project.title}</h1>{shared ? <b className="campus-shared-badge"><Icon name="group" /> Compartilhado</b> : null}</div>
            <p>{project.description || "Projeto acadêmico sem descrição."}</p>
            <div className="campus-project-detail-tags">
              <select value={project.status || "in_progress"} onChange={(event) => update({ status: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              {project.stack ? <span><Icon name="code" /> {project.stack}</span> : null}
              {team.length ? <span><Icon name="groups" /> {team.length} integrante{team.length === 1 ? "" : "s"}</span> : null}
            </div>
          </div>
          <div><button type="button" onClick={() => setShowShareModal(true)}><Icon name="group" /> Compartilhar</button><button type="button" onClick={removeProject}><Icon name="delete" /> Excluir</button><button type="button" onClick={() => onNavigate?.(SCREEN_IDS.PROJECTS)}>Voltar</button><button type="button" onClick={() => update({ status: project.status === "completed" ? "in_progress" : "completed", progress: project.status === "completed" ? progress : 100 })}>{project.status === "completed" ? "Reabrir" : "Concluir"}</button></div>
        </header>
        <div className="campus-project-detail-grid">
          <section className="campus-project-progress">
            <h2>Progresso do projeto</h2>
            <div className="campus-project-progress-summary"><span><small>Marcos concluídos</small><em><b style={{ width: `${progress}%` }} /></em><small>{completed} de {milestones.length}</small></span><strong>{progress}%</strong></div>
            <div className="campus-milestones">
              {milestones.map((milestone) => <article key={milestone.id}><button type="button" onClick={() => update({ milestones: milestones.map((item) => item.id === milestone.id ? { ...item, completed: !item.completed } : item) })}><Icon name={milestone.completed ? "check_circle" : "radio_button_unchecked"} /></button><span><strong className={milestone.completed ? "done" : ""}>{milestone.title}</strong><small>{milestone.assignee ? `Responsável: ${milestone.assignee}` : milestone.description || "Sem responsável"}</small></span></article>)}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); if (!newMilestone.trim()) return; update({ milestones: [...milestones, { id: `milestone-${Date.now()}`, title: newMilestone.trim(), assignee: newMilestoneOwner, completed: false }] }); setNewMilestone(""); setNewMilestoneOwner(""); }}>
              <input value={newMilestone} onChange={(event) => setNewMilestone(event.target.value)} placeholder="Novo marco ou tarefa" />
              {team.length ? <select value={newMilestoneOwner} onChange={(event) => setNewMilestoneOwner(event.target.value)}><option value="">Sem responsável</option>{team.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}</select> : null}
              <button type="submit"><Icon name="add" /> Adicionar</button>
            </form>
          </section>
          <aside className="campus-project-detail-side">
            <section>
              <h2>Recursos</h2>
              {project.repositoryUrl ? <button type="button" onClick={() => openResource({ url: project.repositoryUrl })}><Icon name="account_tree" /><span><strong>Repositório do projeto</strong><small>{project.repositoryUrl}</small></span><Icon name="open_in_new" /></button> : null}
              {[...(project.resources || []), ...(project.files || [])].map((resource) => <button key={resource.id} type="button" onClick={() => openResource(resource)}><Icon name={resource.url ? "link" : "description"} /><span><strong>{resource.title || resource.name}</strong><small>{resource.url ? "Link externo" : "Arquivo local"}</small></span><Icon name="open_in_new" /></button>)}
              <button className="add-resource" type="button" onClick={addFile}><Icon name="add" /> Adicionar arquivo</button>
              <form className="campus-project-resource-form" onSubmit={addResource}><input value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="Adicionar link..." /><button type="submit" aria-label="Adicionar link"><Icon name="add_link" /></button></form>
            </section>
            <section className="campus-project-team-section">
              <header><h2>Equipe</h2><span>{team.length || "Individual"}</span></header>
              <div className="campus-project-member-list">{team.map((member) => <article key={member.id}><span>{String(member.name || "?")[0]}</span><div><strong>{member.name}</strong><small>{member.role || "Integrante"}{member.email ? ` • ${member.email}` : ""}</small></div><button type="button" aria-label={`Remover ${member.name}`} onClick={() => update({ team: team.filter((candidate) => candidate.id !== member.id) })}><Icon name="close" /></button></article>)}{!team.length ? <small>Adicione integrantes para dividir as atividades e compartilhar o projeto.</small> : null}</div>
              <form className="campus-project-member-form" onSubmit={addMember}><input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Nome" /><input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="E-mail (opcional)" /><select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}><option>Integrante</option><option>Líder</option><option>Desenvolvedor</option><option>Pesquisa</option><option>Revisor</option><option>Apresentador</option></select><button type="submit"><Icon name="person_add" /> Adicionar</button></form>
            </section>
            <section><h2>Entrega final</h2><button className="campus-project-upload" type="button" onClick={addFile}><Icon name="upload_file" /><span>Adicionar arquivo final</span><small>PDF ou DOCX</small></button></section>
          </aside>
        </div>
        {kind === "programming" ? <section className="campus-project-programming"><ProgrammingProjectPanel programming={project.programming || { language: project.stack || "" }} onChange={(programming) => update({ programming, stack: programming.language || project.stack || "" })} /></section> : null}
      </div>
      {showShareModal ? <ShareModal entityType="project" entityId={project.id} title={project.title} payload={project} onClose={() => setShowShareModal(false)} /> : null}
    </main>
  );
}
