import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: { card: "1rem", float: "1.25rem", sheet: "1.5rem" },
      boxShadow: { ambient: "0 18px 50px rgb(23 24 27 / 0.12)" },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Arial", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
        editorial: ["var(--font-instrument-serif)", "Georgia", "serif"]
      },
      colors: {
        canvas: "hsl(var(--canvas))",
        surface: "hsl(var(--surface))",
        "surface-raised": "hsl(var(--surface-raised))",
        ink: "hsl(var(--ink))",
        "muted-ink": "hsl(var(--muted-ink))",
        line: "hsl(var(--line))",
        signal: "hsl(var(--signal))",
        "signal-strong": "hsl(var(--signal-strong))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        violet: "hsl(var(--violet))"
      }
    }
  },
  plugins: []
};

export default config;
