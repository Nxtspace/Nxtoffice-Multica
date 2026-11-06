/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// U1 骨架只启用 react chunk。3D 依赖（three / @react-three/fiber / @react-three/drei）
// 由 U3/U4 合入时按 ADR-02 独立分包：manualChunks 增加 'three-stack'，
// 不让 2D 入口承担 three 的下载与解析成本（见 README「构建分包约定」）。
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Vite 8 的 manualChunks 只接受函数形式；返回 undefined 则归入默认 chunk。
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
