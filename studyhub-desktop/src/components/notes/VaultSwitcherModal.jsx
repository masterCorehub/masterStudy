import React, { useState, useMemo } from "react";
import { Icon } from "../../ui/Icon";

const AVAILABLE_ICONS = [
  "folder_special",
  "auto_stories",
  "school",
  "science",
  "code",
  "psychology",
  "lightbulb",
  "bookmark",
  "terminal",
  "palette",
  "fitness_center",
  "work",
  "star",
  "rocket_launch",
];

const AVAILABLE_COLORS = [
  "#6366f1", // Indigo
  "#3b82f6", // Blue
  "#0ea5e9", // Sky
  "#10b981", // Emerald
  "#14b8a6", // Teal
  "#f59e0b", // Amber
  "#f97316", // Orange
  "#ef4444", // Red
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#64748b", // Slate
];

export function VaultSwitcherModal({
  isOpen,
  onClose,
  vaults = [],
  activeVaultId = "global",
  onSelectVault,
  onCreateVault,
  onDeleteVault,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const [newVaultDescription, setNewVaultDescription] = useState("");
  const [newVaultIcon, setNewVaultIcon] = useState("folder_special");
  const [newVaultColor, setNewVaultColor] = useState("#6366f1");

  const filteredVaults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return vaults;
    return vaults.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.description && v.description.toLowerCase().includes(q)),
    );
  }, [vaults, searchQuery]);

  const globalAndAll = useMemo(() => {
    return filteredVaults.filter((v) => v.type === "global" || v.id === "all");
  }, [filteredVaults]);

  const disciplineVaults = useMemo(() => {
    return filteredVaults.filter((v) => v.type === "discipline");
  }, [filteredVaults]);

  const courseVaults = useMemo(() => {
    return filteredVaults.filter((v) => v.type === "course");
  }, [filteredVaults]);

  const customVaults = useMemo(() => {
    return filteredVaults.filter((v) => v.type === "custom");
  }, [filteredVaults]);

  if (!isOpen) return null;

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newVaultName.trim()) return;

    onCreateVault?.({
      name: newVaultName.trim(),
      description: newVaultDescription.trim(),
      icon: newVaultIcon,
      color: newVaultColor,
    });

    setNewVaultName("");
    setNewVaultDescription("");
    setIsCreating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[var(--surface)] border border-[var(--outline-variant)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--outline-variant)] flex items-center justify-between shrink-0 bg-[var(--surface-lowest)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)] flex items-center justify-center">
              <Icon name="library_books" className="text-[20px]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--on-surface)] leading-none">
                Cofres de Anotações (Vaults)
              </h3>
              <p className="text-xs text-[var(--on-surface-variant)] mt-1">
                Selecione ou crie um cofre isolado estilo Obsidian
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[var(--surface-high)] flex items-center justify-center text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Top Actions: Search + Create Button */}
          {!isCreating && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-[var(--on-surface-variant)]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cofre..."
                  className="w-full pl-9 pr-3 py-2 bg-[var(--surface-high)] text-sm text-[var(--on-surface)] rounded-xl border border-[var(--outline-variant)] focus:outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--on-surface-variant)]/60"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="px-3 py-2 bg-[var(--primary)] text-[var(--on-primary)] rounded-xl text-xs font-semibold hover:brightness-110 flex items-center gap-1.5 shrink-0 shadow-sm transition-all"
              >
                <Icon name="add" className="text-[16px]" />
                <span>Novo Cofre</span>
              </button>
            </div>
          )}

          {/* Form de Criação de Novo Cofre */}
          {isCreating && (
            <form
              onSubmit={handleCreateSubmit}
              className="p-4 bg-[var(--surface-lowest)] rounded-xl border border-[var(--outline-variant)] space-y-3 animate-in slide-in-from-top-2 duration-150"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[var(--outline-variant)]">
                <span className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">
                  Criar Novo Cofre
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--on-surface-variant)] mb-1">
                  Nome do Cofre
                </label>
                <input
                  type="text"
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  placeholder="Ex: Projetos Pessoais, Pesquisas, Livros..."
                  className="w-full px-3 py-2 bg-[var(--surface-high)] text-sm rounded-lg border border-[var(--outline-variant)] focus:outline-none focus:border-[var(--primary)] text-[var(--on-surface)]"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--on-surface-variant)] mb-1">
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  value={newVaultDescription}
                  onChange={(e) => setNewVaultDescription(e.target.value)}
                  placeholder="Finalidade deste cofre..."
                  className="w-full px-3 py-2 bg-[var(--surface-high)] text-sm rounded-lg border border-[var(--outline-variant)] focus:outline-none focus:border-[var(--primary)] text-[var(--on-surface)]"
                />
              </div>

              {/* Seletor de Ícone */}
              <div>
                <label className="block text-xs font-medium text-[var(--on-surface-variant)] mb-1.5">
                  Ícone
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewVaultIcon(ic)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        newVaultIcon === ic
                          ? "bg-[var(--primary)] text-[var(--on-primary)] shadow-sm scale-105"
                          : "bg-[var(--surface-high)] text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-highest)]"
                      }`}
                    >
                      <Icon name={ic} className="text-[18px]" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Seletor de Cor */}
              <div>
                <label className="block text-xs font-medium text-[var(--on-surface-variant)] mb-1.5">
                  Cor de Destaque
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewVaultColor(c)}
                      className={`w-6 h-6 rounded-full transition-all flex items-center justify-center ${
                        newVaultColor === c
                          ? "ring-2 ring-offset-2 ring-[var(--primary)] scale-110"
                          : "opacity-80 hover:opacity-100 hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {newVaultColor === c && (
                        <Icon name="check" className="text-white text-[12px]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-xs text-[var(--on-surface-variant)] hover:bg-[var(--surface-high)] rounded-lg transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={!newVaultName.trim()}
                  className="px-4 py-1.5 bg-[var(--primary)] text-[var(--on-primary)] text-xs font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                >
                  Salvar e Abrir Cofre
                </button>
              </div>
            </form>
          )}

          {/* ── LISTA DE VAULTS AGRUPADOS ── */}

          {/* 1. Vault Geral e Todos */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-[var(--on-surface-variant)] uppercase tracking-wider px-2">
              Principal
            </div>
            {globalAndAll.map((vault) => {
              const isActive = activeVaultId === vault.id;
              return (
                <button
                  key={vault.id}
                  type="button"
                  onClick={() => {
                    onSelectVault(vault.id);
                    onClose();
                  }}
                  className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all group ${
                    isActive
                      ? "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] border border-[var(--primary)]/30 text-[var(--on-surface)]"
                      : "hover:bg-[var(--surface-high)] text-[var(--on-surface)]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: vault.color || "#6366f1" }}
                    >
                      <Icon name={vault.icon} className="text-[18px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                        <span>{vault.name}</span>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-bold">
                            Ativo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--on-surface-variant)] truncate">
                        {vault.description || "Cofre geral"}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-lowest)] text-[var(--on-surface-variant)] shrink-0 border border-[var(--outline-variant)]/50">
                    {vault.noteCount} notas
                  </span>
                </button>
              );
            })}
          </div>

          {/* 2. Disciplinas Acadêmicas */}
          {disciplineVaults.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="text-[10px] font-bold text-[var(--on-surface-variant)] uppercase tracking-wider px-2 flex items-center gap-1">
                <Icon name="auto_stories" className="text-[12px]" />
                <span>Disciplinas Acadêmicas</span>
              </div>
              {disciplineVaults.map((vault) => {
                const isActive = activeVaultId === vault.id;
                return (
                  <button
                    key={vault.id}
                    type="button"
                    onClick={() => {
                      onSelectVault(vault.id);
                      onClose();
                    }}
                    className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all ${
                      isActive
                        ? "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] border border-[var(--primary)]/30 text-[var(--on-surface)]"
                        : "hover:bg-[var(--surface-high)] text-[var(--on-surface)]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: vault.color || "#0ea5e9" }}
                      >
                        <Icon name={vault.icon} className="text-[18px]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                          <span>{vault.name}</span>
                          {isActive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-bold">
                              Ativo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--on-surface-variant)] truncate">
                          {vault.description}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-lowest)] text-[var(--on-surface-variant)] shrink-0 border border-[var(--outline-variant)]/50">
                      {vault.noteCount} notas
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 3. Cursos */}
          {courseVaults.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="text-[10px] font-bold text-[var(--on-surface-variant)] uppercase tracking-wider px-2 flex items-center gap-1">
                <Icon name="school" className="text-[12px]" />
                <span>Cursos</span>
              </div>
              {courseVaults.map((vault) => {
                const isActive = activeVaultId === vault.id;
                return (
                  <button
                    key={vault.id}
                    type="button"
                    onClick={() => {
                      onSelectVault(vault.id);
                      onClose();
                    }}
                    className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-all ${
                      isActive
                        ? "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] border border-[var(--primary)]/30 text-[var(--on-surface)]"
                        : "hover:bg-[var(--surface-high)] text-[var(--on-surface)]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: vault.color || "#8b5cf6" }}
                      >
                        <Icon name={vault.icon} className="text-[18px]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                          <span>{vault.name}</span>
                          {isActive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-bold">
                              Ativo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--on-surface-variant)] truncate">
                          {vault.description}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-lowest)] text-[var(--on-surface-variant)] shrink-0 border border-[var(--outline-variant)]/50">
                      {vault.noteCount} notas
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 4. Cofres Personalizados */}
          {customVaults.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="text-[10px] font-bold text-[var(--on-surface-variant)] uppercase tracking-wider px-2 flex items-center gap-1">
                <Icon name="folder_special" className="text-[12px]" />
                <span>Cofres Personalizados</span>
              </div>
              {customVaults.map((vault) => {
                const isActive = activeVaultId === vault.id;
                return (
                  <div
                    key={vault.id}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between transition-all group ${
                      isActive
                        ? "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] border border-[var(--primary)]/30 text-[var(--on-surface)]"
                        : "hover:bg-[var(--surface-high)] text-[var(--on-surface)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectVault(vault.id);
                        onClose();
                      }}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: vault.color || "#ec4899" }}
                      >
                        <Icon name={vault.icon} className="text-[18px]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                          <span>{vault.name}</span>
                          {isActive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-bold">
                              Ativo
                            </span>
                          )}
                        </div>
                        {vault.description && (
                          <div className="text-xs text-[var(--on-surface-variant)] truncate">
                            {vault.description}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-lowest)] text-[var(--on-surface-variant)] border border-[var(--outline-variant)]/50">
                        {vault.noteCount} notas
                      </span>
                      {onDeleteVault && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              window.confirm(
                                `Deseja realmente excluir o cofre "${vault.name}"? As notas serão movidas para o Vault Geral.`,
                              )
                            ) {
                              onDeleteVault(vault.id);
                            }
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-[var(--surface-highest)] text-[var(--on-surface-variant)] hover:text-[var(--error)] flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                          title="Excluir cofre"
                        >
                          <Icon name="delete" className="text-[16px]" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredVaults.length === 0 && (
            <div className="p-8 text-center text-[var(--on-surface-variant)] text-xs">
              Nenhum cofre encontrado para "{searchQuery}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VaultSwitcherModal;
