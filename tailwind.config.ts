import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./i18n/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        cream: "#f7f4ef",
        ink: "#1c1c1e",
        muted: "#8e8b85"
      },
      boxShadow: {
        soft: "0 4px 24px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.04)",
        fab: "0 6px 28px rgba(100,165,100,0.48), 0 2px 8px rgba(0,0,0,0.08)"
      },
      fontFamily: {
        rounded: ["var(--font-nunito)", "system-ui", "sans-serif"],
        body: ["var(--font-manrope)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
