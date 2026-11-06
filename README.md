# Nxtoffice-Multica

专为 Multica 定制的 2D/3D AI Agent 可视化虚拟办公室。通过等距 2D 场景与沉浸式 3D 空间，将 Agent、Squad、任务执行、工具调用及协作过程转化为直观、动态、可交互的视觉体验。

> **当前阶段：U1 建仓骨架（NXTLAB-16）。** 本仓库目前只含工程骨架与 ADR 归档，不含 2D/3D 场景实现。2D 渲染层选型待项目方裁定（见 `docs/adr/0003`），骨架阶段不安装任何 2D 渲染库。

## 目录结构与职责

```
Nxtoffice-Multica/
├── docs/adr/                 # 架构决策记录（原文归档，不改写）
│   ├── 0001-data-and-permission-contract.md       # 数据与权限契约（服务端授权适配器）
│   ├── 0002-double-view-frontend-stack.md         # 双视图前端技术栈
│   └── 0003-adr-02-revision-2d-scene-svg-react.md # D-1 修订：2D 改 SVG+React
├── e2e/                      # Playwright 验证位（双视图同一脚本的核对留位）
├── src/
│   ├── app/                  # 应用外壳（路由、详情入口；U3 填充）
│   ├── contract/             # 共享状态契约（对象 ID、关系边、快照版本；U3 填充）
│   ├── mock/                 # mock 快照生成器（U3 填充）
│   ├── views/
│   │   ├── two-d/            # 2D 等距视图（渲染层待裁定，骨架不落地）
│   │   └── three-d/          # 3D 沉浸视图（R3F；U4 填充）
│   ├── App.tsx               # 骨架外壳：两视图占位 section
│   ├── main.tsx
│   └── index.css
├── .github/workflows/ci.yml  # CI：build（typecheck/test/build）+ e2e（Playwright）
├── THIRD-PARTY-NOTICES.md    # 第三方资产登记（openclaw-office-2 MIT 署名链）
└── LICENSE                   # MIT
```

`src/` 下以 `.gitkeep` 占位的目录是 U3（共享契约骨架与 mock 快照生成器，NXTLAB-19）/ U4（3D 技术小样，NXTLAB-18）的挂位，避免合并冲突；**移植 openclaw-office-2 模块时逐行登记 `THIRD-PARTY-NOTICES.md` 的移植登记表**。

## 本地命令

```bash
npm install            # 安装依赖（包管理器固定 npm，勿换 pnpm/yarn）
npm run dev            # 本地开发服务器 http://localhost:5173
npm run typecheck      # tsc --noEmit
npm test               # vitest run（单元/组件测试）
npm run build          # typecheck + vite build
npm run e2e            # Playwright（首次需 npx playwright install chromium）
npm run preview        # 预览构建产物 http://localhost:4173
```

## 工程约定

- **包管理器固定 npm**，版本锁定在 `package-lock.json`；CI 用 `npm ci`。
- **TypeScript 严格模式**（`tsconfig.json`：strict、noUnusedLocals、noUnusedParameters、verbatimModuleSyntax）；`npm run build` 先跑 `tsc --noEmit`，类型错误即构建失败。
- **测试**：Vitest，全局环境 `node`；需要 DOM 的测试文件在文件头加 `// @vitest-environment jsdom`（见 `src/App.test.tsx`）。
- **四态必覆盖**：空 / 加载 / 错误 / 正常。2D/3D 视图与详情按 `docs/adr/0001` 的状态字典实现，缺一个当缺陷处理。
- **样式**：不引入 UI 框架；CSS 变量与设计 token 由 U3/U4 共享层统一（占位样式见 `src/index.css`）。
- **不新增依赖**。确有必要先给理由、体积影响与维护风险，等确认。骨架阶段明确**不安装 PixiJS**（`docs/adr/0003` 未决）。

## 分支与合入规则

- 默认分支 `main`，CI 在 push/PR 到 `main` 时触发。
- U3（共享契约/mock）、U4（3D 小样）在独立分支开发，完成后合入 `main`；U1 骨架的目录结构、依赖版本、tsconfig/vitest 配置已与 U3 对齐，合并时不重排。
- 提交信息结尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- CI 两job：`build`（install/typecheck/test/build，上传 dist）与 `e2e`（Playwright chromium，失败上传 trace）。**合并前要求 CI 通过。**

## 合规与署名

- 本项目 MIT（`LICENSE`）。
- 复用 openclaw-office-2（MIT，锁定 commit `be47d03`）资产按 D-1 路线 B「仅复用资产」**模块级移植**，不 fork 导入；移植登记见 `THIRD-PARTY-NOTICES.md`。
- **禁止**移植其 `GatewayAdapter`、`openclaw-control-ui` token、管理台与聊天代码（与 ADR-01「浏览器不持管理员凭据、服务端逐用户鉴权」冲突）。
- 移植模块保留上游版权声明与许可头。

## 更多背景

- 数据/权限契约与状态字典：`docs/adr/0001`
- 技术栈与渲染层选型（含未决分歧）：`docs/adr/0002`、`docs/adr/0003`
- openclaw-office-2 资产登记：`THIRD-PARTY-NOTICES.md`
