import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201d",
        canvas: "#f7f5ef",
        spruce: "#1f4d45",
        mint: "#cfe8d8",
        ember: "#d96f32",
        steel: "#dce6e5",
      },
      boxShadow: {
        commerce: "0 18px 50px rgba(23, 32, 29, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
