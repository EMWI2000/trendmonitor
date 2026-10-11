import type { Config } from "tailwindcss";

// Colour tokens follow the validated reference palette in the dataviz skill: one blue for magnitude
// (the sequential ramp `seq`), three categorical slots for brand roles, and neutral ink/chrome.
// Every class name is written out literally in app/, components/ or lib/ (lib/labels.ts holds the role
// swatch classes), and all three directories are scanned so the JIT scanner keeps them.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0b0b",
        ink2: "#52514e",
        muted: "#898781",
        hair: "#e1e0d9",
        axis: "#c3c2b7",
        surface: "#fcfcfb",
        plane: "#f9f9f7",
        accent: "#2a78d6",
        accentSoft: "#9ec5f4",
        seq: {
          100: "#cde2fb",
          200: "#9ec5f4",
          300: "#6da7ec",
          400: "#3987e5",
          500: "#256abf",
          600: "#184f95",
          700: "#0d366b",
        },
        role: {
          self: "#0b0b0b",
          peer: "#2a78d6",
          benchmark: "#eb6834",
          international: "#1baf7a",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
