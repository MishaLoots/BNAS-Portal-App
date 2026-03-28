/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy:  "#1F3864",
        bblue: "#2E75B6",
        lblue: "#BDD7EE",
      },
    },
  },
  plugins: [],
}
