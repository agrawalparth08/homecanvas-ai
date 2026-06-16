import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@lib': fileURLToPath(new URL('./lib', import.meta.url)),
    },
    // Single copy of three + three-mesh-bvh — three-gpu-pathtracer's BVH
    // instanceof checks fail if vite hoists a second mesh-bvh under it.
    dedupe: ['three', 'three-mesh-bvh'],
  },
  server: {
    port: 5173,
    // Fail loudly if 5173 is taken. The sidecar's Origin allow-list is pinned to
    // 5173, so a silent Vite port drift (→5174) would 403 every write.
    strictPort: true,
    proxy: {
      // Local sidecar — all fs/job/bridge traffic goes through it.
      '/api': 'http://127.0.0.1:4871',
    },
  },
});
