export function Icon({ name, className = "", filled = false, style }) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? "fill" : ""} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
