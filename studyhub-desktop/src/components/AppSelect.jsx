import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";

export function AppSelect({
  value,
  onChange,
  options,
  placeholder = "Selecionar",
  className = "",
  buttonClassName = "",
  menuClassName = "",
  ariaLabel,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const normalizedValue = value ?? "";
  const selectedOption = options.find(
    (option) => String(option.value ?? "") === String(normalizedValue),
  );
  const label = selectedOption?.label || placeholder;

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className={`relative ${className}`.trim()} ref={rootRef}>
      <button
        aria-label={ariaLabel}
        aria-expanded={open}
        className={`app-select-trigger ${buttonClassName}`.trim()}
        disabled={disabled}
        type="button"
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
      >
        <span className="truncate">{label}</span>
        <Icon
          className={`text-[18px] transition-transform ${open ? "rotate-180" : ""}`}
          name="expand_more"
        />
      </button>

      {open && !disabled ? (
        <div
          className={`app-select-menu custom-scrollbar ${menuClassName}`.trim()}
        >
          {options.map((option) => {
            const active =
              String(option.value ?? "") === String(normalizedValue);
            return (
              <button
                key={String(option.value ?? "__empty__")}
                className={`app-select-option ${active ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="truncate">{option.label}</span>
                {active ? <Icon className="text-[16px]" name="check" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
