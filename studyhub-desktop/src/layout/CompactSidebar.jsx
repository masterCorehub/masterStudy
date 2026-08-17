import { shellNavigation } from "../data/mockData";
import { Icon } from "../ui/Icon";
import { useStudyStore } from "../store/useStore";

export function CompactSidebar({ activeScreen, onNavigate }) {
  const isDarkMode = useStudyStore((state) => state.isDarkMode);
  const themePreference = useStudyStore((state) => state.themePreference || "system");
  const setThemePreference = useStudyStore((state) => state.setThemePreference);

  return (
    <aside className="neo-raised group relative z-20 flex h-full w-[100px] shrink-0 flex-col rounded-r-[28px] bg-[color:var(--surface)] px-4 py-6 transition-all duration-300 hover:w-[250px]">
      <div className="mb-8 flex items-center overflow-hidden whitespace-nowrap">
        <div className="neo-raised flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] text-[color:var(--tertiary)]">
          <Icon className="text-[30px]" name="school" />
        </div>
        <div className="ml-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <h2 className="text-lg font-semibold text-[color:var(--tertiary)]">IMERSÃO</h2>
          <p className="text-xs text-[color:var(--on-surface-variant)]">Deep Study Flow</p>
        </div>
      </div>

      <nav className="flex-1">
        {shellNavigation.map((item) => {
          const active = item.id === activeScreen;
          return (
            <button
              key={item.id}
              className={`mb-2 flex w-full items-center overflow-hidden whitespace-nowrap rounded-[18px] p-4 text-left transition-all duration-200 ${
                active
                  ? "neo-inset text-[color:var(--primary)]"
                  : "text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]"
              }`}
              type="button"
              onClick={() => item.id !== "notes" && onNavigate(item.id)}
            >
              <Icon filled={active} name={active ? item.activeIcon : item.icon} />
              <span className="ml-4 text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {[
        { id: "signout", label: "Sair", icon: "logout" },
      ].map((item) => (
        <button
          key={item.id}
          className="mb-2 flex w-full items-center overflow-hidden whitespace-nowrap rounded-[18px] p-4 text-left text-[color:var(--on-surface-variant)] transition-colors duration-200 hover:text-[color:var(--primary)]"
          type="button"
        >
          <Icon name={item.icon} />
          <span className="ml-4 text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {item.label}
          </span>
        </button>
      ))}
      <button
        type="button"
        title={`Tema: ${themePreference === "system" ? "automático" : themePreference === "dark" ? "escuro" : "claro"}`}
        aria-label="Alternar tema"
        onClick={() => setThemePreference(themePreference === "system" ? "dark" : themePreference === "dark" ? "light" : "system")}
        className="flex w-full items-center overflow-hidden whitespace-nowrap rounded-[18px] p-4 text-left text-[color:var(--on-surface-variant)] transition-colors duration-200 hover:text-[color:var(--primary)]"
      >
        <Icon name={isDarkMode ? "dark_mode" : "light_mode"} filled />
        <span className="ml-4 text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100">{isDarkMode ? "Modo escuro" : "Modo claro"}</span>
      </button>
    </aside>
  );
}
