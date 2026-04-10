/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#00589F",
        secondary: "#D4AF37",
        background: "#f5f7fa",
        text: "#1e2b3c",
        lightGray: "#eef2f6",
        white: "#ffffff",
      },
    },
  },
  plugins: [],
}
