import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-latin)", "var(--font-thai)", "system-ui", "sans-serif"] },
      colors: {
        up: { DEFAULT: "#15803d", dark: "#4ade80" },
        down: { DEFAULT: "#b91c1c", dark: "#f87171" },
        brand: { DEFAULT: "#1d4ed8", dark: "#93c5fd" },
        // โทเคนธีม "กระจกฝ้าโทนเทา" (ขาวโปร่งบนพื้นเบลอ) + สีเด่นเดียว = น้ำเงิน #3B82F6
        canvas: "#1c1d20",
        surface: "rgb(255 255 255 / 0.07)",
        subtle: "rgb(255 255 255 / 0.05)",
        line: "rgb(255 255 255 / 0.10)",
        ink: "rgb(255 255 255 / <alpha-value>)",
        "ink-muted": "rgb(255 255 255 / 0.62)",
        "ink-faint": "rgb(255 255 255 / 0.50)",
        accent: { DEFAULT: "#3B82F6", text: "#7FB0FF" },
        "accent-ink": "#ffffff",
      },
    },
  },
  plugins: [],
} satisfies Config;
