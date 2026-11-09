# Nxtoffice-Multica

专为 Multica 定制的 2D/3D AI Agent 可视化虚拟办公室。通过等距 2D 场景与沉浸式 3D 空间，将 Agent、Squad、任务执行、工具调用及协作过程转化为直观、动态、可交互的视觉体验。

> **当前阶段：U3（共享契约 + mock 快照生成器）已合入，U5 视觉层六态实现中。** 本仓库当前含工程骨架、ADR 归档、共享契约层（`src/contract`）、mock 隔离开发数据（`src/mock`）与 2D/3D 占位场景。2D 渲染层选型见 `docs/adr/0003`（SVG + React）。正式数据入口与新鲜度阈值均为未决项（D-2 / D-3），**当前所有数据均为 mock，不得用于验收放行**。

## 目录结构与职责

```
Nxtoffice-Multica/
├── docs/adr/                 # 架构决策记录（原文归档，不改写）
│   ├── 0001-data-and-permission-contract.md       # 数据与权限契约（服务端授权适配器）
│   ├── 0002-double-view-frontend-stack.md         # 双视图前端技术栈
│   └── 0003-adr-02-revision-2d-scene-svg-react.md # D-1 修订：2D 改 SVG+React
├── e2e/                      # Playwright 验证位（双视图同一脚本的核对留位）
├── src/
│   ├── app/                  # 应用外壳：场景切换、详情按单对象重新鉴权、四态装配
│   ├── contract/             # 共享契约层：状态字典、新鲜度、结构化错误信号、呈现状态机
│   ├── mock/                 # mock 快照生成器与场景矩阵（隔离开发，不得用于验收）
│   ├── views/
│   │   ├── scene-tokens.ts   # 2D/3D 共用的状态色与标签
│   │   ├── two-d/            # 2D 等距视图（SVG + React + CSS 动画，ADR-0003）
│   │   └── three-d/          # 3D 沉浸视图（R3F；懒加载，独立分包）
│   ├── main.tsx
│   └── app/styles.css
├── .github/workflows/ci.yml  # CI：build（typecheck/test/build）+ e2e（Playwright）
├── THIRD-PARTY-NOTICES.md    # 第三方资产登记（openclaw-office-2 MIT 署名链）
└── LICENSE                   # MIT
```

`src/contract` 是 2D/3D 双视图唯一的语义来源（ADR-01）；视图层只做布局、绘制、命中与动效，不做状态推导。**移植 openclaw-office-2 模块时逐行登记 `THIRD-PARTY-NOTICES.md` 的移植登记表**。

## 依赖版本基线（three 栈）

| 依赖 | 锁定版本 | 依据 |
| --- | --- | --- |
| `three` | `0.183.1` | U4（NXTLAB-18）实测基线 |
| `@react-three/drei` | `10.7.7` | U4 实测基线 |
| `@react-three/fiber` | `9.5.0` | U4 实测基线 |
| `@types/three` | `0.183.1` | 与 `three` 版本对齐（three 不自带类型） |

U3 合入时存在两套候选：U3 补丁 pin `three 0.187.0` / `drei 10.7.9` / `fiber 9.8.2`，U4 实测基线为 `three 0.183.1` / `drei 10.7.7` / `fiber 9.5`。**合入采用 U4 实测基线**，理由：U4 的渲染性能与浏览器兼容实测全部在该基线上得出，采用未实测的更新版本会使 U4 数据失效并引入回归风险；依赖升级须单独走变更评估（工程约定「不静默升级依赖」），不由合入顺带完成。`npm install` 需带 `--legacy-peer-deps`（`@react-three/fiber@9.5.0` 的可选 peer `expo` 链与 React 19 有解析冲突；`npm ci` 使用已生成的 lockfile 不受影响）。

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
- **测试**：Vitest，全局环境 `node`；需要 DOM 的测试文件在文件头加 `// @vitest-environment jsdom`（见 `src/app/App.test.tsx`）。
- **四态必覆盖**：空 / 加载 / 错误 / 正常。2D/3D 视图与详情按 `docs/adr/0001` 的状态字典实现，缺一个当缺陷处理。
- **样式**：不引入 UI 框架；CSS 变量与设计 token 由共享层统一（样式见 `src/app/styles.css` 与 `src/views/*`）。
- **不新增依赖**。确有必要先给理由、体积影响与维护风险，等确认。骨架阶段明确**不安装 PixiJS**（`docs/adr/0003` 未决）。
- **构建分包**：`vite.config.ts` 的 `manualChunks` 把 three 栈划入 `three-stack` 独立分包，3D 视图经 `React.lazy` 懒加载，2D 入口不承担 three 的下载与解析成本。

## 分支与合入规则

- 默认分支 `main`，CI 在 push/PR 到 `main` 时触发。
- U3（共享契约/mock）、U4（3D 小样）在独立分支开发，完成后合入 `main`；U1 骨架的目录结构、依赖版本、tsconfig/vitest 配置已与 U3 对齐，合并时不重排。
- U3（NXTLAB-19）已按 `u3-shared-contract-mock.patch` 合入：`src/contract` / `src/mock` / `src/views` / `src/app` 落地，U1 的占位外壳（`src/App.tsx`、`src/index.css`）由 `src/app/App.tsx` 取代并删除；three 栈版本取 U4 实测基线（见上文「依赖版本基线」）。
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
