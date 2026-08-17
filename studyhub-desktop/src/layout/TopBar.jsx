import { Icon } from "../ui/Icon";

export function TopBar({ title, searchPlaceholder, avatar, showTitleBorder = false, children }) {
  return (
    <header className="neo-raised relative z-10 flex h-20 shrink-0 items-center justify-between bg-[color:var(--surface)] px-8">
      <div className="flex items-center gap-5">
        <div className="text-[20px] font-semibold tracking-tight text-[color:var(--primary)]">{title}</div>
        {showTitleBorder ? (
          <div className="ml-1 border-l border-[color:var(--outline-variant)] pl-5 text-[18px] font-medium text-[color:var(--on-surface-variant)]">
            Modo Imersão
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-6">
        {children}
        {searchPlaceholder ? (
          <label className="neo-field flex h-12 w-[320px] items-center rounded-full px-5 text-[color:var(--on-surface-variant)]">
            <Icon className="mr-3 text-[20px]" name="search" />
            <input className="w-full bg-transparent text-sm outline-none placeholder:text-[color:var(--on-surface-variant)]/70" placeholder={searchPlaceholder} />
          </label>
        ) : null}
        <div className="flex items-center gap-4">
          {["notifications", "settings", "fullscreen"].map((icon) => (
            <button key={icon} className="neo-button flex h-12 w-12 items-center justify-center rounded-full text-[color:var(--on-surface-variant)] hover:text-[color:var(--primary)]" type="button">
              <Icon className="text-[20px]" name={icon} />
            </button>
          ))}
          <div className="neo-raised flex h-12 w-12 items-center justify-center overflow-hidden rounded-full p-1">
            <img alt="User profile" className="h-full w-full rounded-full object-cover" src={avatar} />
          </div>
        </div>
      </div>
    </header>
  );
}
