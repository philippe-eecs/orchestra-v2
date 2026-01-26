import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/graphs': 'http://localhost:8000',
      '/nodes': 'http://localhost:8000',
      '/edges': 'http://localhost:8000',
      '/runs': 'http://localhost:8000',
    }
  }
})
