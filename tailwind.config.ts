import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Monochrome editorial system (V_01 redesign). The dealer's own logo
        // supplies brand color; the UI stays neutral so it works for any brand.
        // Token NAMES are unchanged (brand / accent / surface) so every existing
        // `brand-*` / `accent-*` usage across the app recolors with zero markup
        // churn. `brand` is a near-black ink scale; `accent` mirrors it so any
        // legacy orange CTA renders as a strong dark action, not a stray hue.
        brand: {
          50: "#f6f6f7",
          100: "#ededee",
          200: "#d8d8db",
          300: "#b7b7bc",
          400: "#8f8f96",
          500: "#6b6b72",
          600: "#2c2c30",
          700: "#1d1d20",
          800: "#161618",
          900: "#0f0f11",
          950: "#0a0a0b",
        },
        accent: {
          50: "#f6f6f7",
          100: "#ededee",
          200: "#d8d8db",
          300: "#b7b7bc",
          400: "#8f8f96",
          500: "#2c2c30",
          600: "#1d1d20",
          700: "#161618",
          800: "#0f0f11",
          900: "#0a0a0b",
          950: "#050506",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f6f6f7",
          subtle: "#efeff1",
          border: "#e4e4e7",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      fontSize: {
        "price-lg": ["2rem", { lineHeight: "1.2", fontWeight: "700" }],
        "price-xl": ["2.5rem", { lineHeight: "1.1", fontWeight: "700" }],
      },
      spacing: {
        "header-height": "4rem",
        "sidebar-width": "18rem",
      },
      borderRadius: {
        card: "1rem",
      },
      maxWidth: {
        "8xl": "88rem",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "card-hover":
          "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
