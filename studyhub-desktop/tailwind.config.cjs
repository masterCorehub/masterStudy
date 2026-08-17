module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-bright": "var(--surface-bright)",
        "surface-lowest": "var(--surface-lowest)",
        "surface-high": "var(--surface-high)",
        "surface-highest": "var(--surface-highest)",
        "surface-dim": "var(--surface-dim)",
        primary: "var(--primary)",
        tertiary: "var(--tertiary)",
        "on-surface": "var(--on-surface)",
        "on-surface-variant": "var(--on-surface-variant)",
        outline: "var(--outline)",
        error: "var(--error)",
      },
      boxShadow: {
        "neo-raised":
          "6px 6px 12px rgba(0,0,0,0.08), -6px -6px 12px rgba(255,255,255,0.6)",
        "neo-inset":
          "inset 4px 4px 8px rgba(0,0,0,0.06), inset -4px -4px 8px rgba(255,255,255,0.5)",
      },
      fontFamily: {
        body: ["Plus Jakarta Sans", "sans-serif"],
        display: ["Plus Jakarta Sans", "sans-serif"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/container-queries"),
  ],
};
