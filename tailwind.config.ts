import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-thai)", "system-ui", "sans-serif"] },
      colors: {
        up: { DEFAULT: "#15803d", dark: "#4ade80" },
        down: { DEFAULT: "#b91c1c", dark: "#f87171" },
        brand: { DEFAULT: "#1d4ed8", dark: "#93c5fd" },
      },
    },
  },
  plugins: [],
} satisfies Config;
