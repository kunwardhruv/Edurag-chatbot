import type { Config } from 'tailwindcss'

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   "#0a0a0f",
          secondary: "#111118",
          card:      "#16161f",
          border:    "#1e1e2e",
          hover:     "#1c1c28",
        },
        accent: {
          DEFAULT: "#f59e0b",
          hover:   "#d97706",
          muted:   "#f59e0b22",
        },
        text: {
          primary:   "#f4f4f8",
          secondary: "#8888a8",
          muted:     "#4a4a68",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-dot": "pulseDot 1.4s infinite ease-in-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { transform: "translateY(12px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
        pulseDot: { "0%, 80%, 100%": { transform: "scale(0)", opacity: "0.5" }, "40%": { transform: "scale(1)", opacity: "1" } },
      },
    },
  },
  plugins: [],
} satisfies Config;
