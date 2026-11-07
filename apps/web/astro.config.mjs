import { fileURLToPath } from 'node:url';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  session: false,
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Astro does not read tsconfig paths for bundling; this is the runtime half.
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
