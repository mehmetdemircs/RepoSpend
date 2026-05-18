import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        mist: "#f7f8fa",
        line: "#d9dde5",
        teal: "#0f766e",
        plum: "#7c3aed",
        amber: "#b45309",
        rose: "#be123c",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(16, 24, 40, 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
