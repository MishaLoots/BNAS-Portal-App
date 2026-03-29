/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy:  "#1A1A2E",
        bblue: "#E94560",
        lblue: "#FDEAED",
        dmid:  "#0E2841",
        steel: "#156082",
      },
    },
  },
  plugins: [],
}
