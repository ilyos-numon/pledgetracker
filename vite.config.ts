import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 프로젝트 루트(이 파일 위치)의 postcss.config.cjs — Mantine 프리셋
const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'web',
  envDir: '..',
  plugins: [react()],
  server: { port: 8860, strictPort: true },
  css: { postcss: projectRoot },
});
