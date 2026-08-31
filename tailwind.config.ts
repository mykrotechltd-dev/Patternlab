import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEF1F8",
          100: "#DCE3F0",
          200: "#B9C7E1",
          300: "#8FA3C9",
          400: "#5F76A0",
          500: "#3A4E75",
          600: "#1E2A47",
          700: "#141C33",
          800: "#0F1420",
          900: "#0A0D16",
        },
        accent: {
          50: "#FBF1EA",
          100: "#F5DFCC",
          400: "#E0956A",
          500: "#C67C4E",
          600: "#AD6740",
        },
        cream: {
          DEFAULT: "#F7F3EA",
          50: "#F7F3EA",
          100: "#F2ECDD",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
