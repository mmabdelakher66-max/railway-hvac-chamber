import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/railway-hvac-chamber/',
  plugins: [react(), tailwindcss()],
})
