/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/sidetrack/',
  plugins: [react(), tailwindcss()],
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
})
