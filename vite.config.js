import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/protrader-suite/', // ⚠️ Reemplaza protrader-suite por el nombre exacto de tu repo en GitHub
})