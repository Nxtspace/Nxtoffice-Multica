/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 3D 场景按 ADR-02 独立分包：manualChunks 划出 'three-stack'，
// 不让 2D 入口承担 three 的下载与解析成本（见 README「构建分包约定」）。
// U1 骨架只启用 react chunk；U3 合入后 three 栈随 3D 视图懒加载。
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Vite 8（rolldown）的 manualChunks 只接受函数形式：按模块归属划分 vendor 分包
        manualChunks: (id: string): string | undefined => {
          if (!id.includes('node_modules')) return undefined;
          const threeStack = [
            'three',
            '@react-three',
            'three-stdlib',
            'three-mesh-bvh',
            'troika',
            'meshoptimizer',
            'draco3d',
            '@mediapipe',
            'camera-controls',
            'stats-gl',
            'maath',
            'suspend-react',
          ];
          if (threeStack.some((m) => id.includes(m))) return 'three-stack';
          const reactStack = ['react', 'scheduler', 'use-sync-external-store', 'zustand'];
          if (reactStack.some((m) => id.includes(m))) return 'react';
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
