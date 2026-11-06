# THIRD-PARTY-NOTICES

本项目（Nxtoffice-Multica）本身以 MIT 许可发布（见仓库根目录 `LICENSE`）。
以下登记本项目复用的第三方资产及其许可与署名要求。

## 1. openclaw-office-2（MIT）——复用资产来源

| 项 | 内容 |
|---|---|
| 许可 | MIT（全文见本节末） |
| 上游原作 | OpenClaw / WW-AI-Lab · `https://github.com/WW-AI-Lab/openclaw-office` |
| 复用来源 fork | artapon · `https://github.com/artapon/openclaw-office-2` |
| **锁定 commit** | `be47d03`（fork 版本 v2026.3.6；D-1 评估代码级实测所基于的修订） |
| 复用方式 | D-1 路线 B「仅复用资产」：**不 fork 导入**，按模块移植组件代码到本仓库，移植代码自此由本项目维护（有意为之的模块级分叉），原署名与许可声明随模块保留 |
| 复用范围 | `office-2d`（SVG 等距组件）、`office-3d`（R3F 程序化几何）、`lib` 工具（avatar-generator、position-allocator、movement-animator、event-throttle 等自包含工具） |
| 版本号登记 | 依赖 `be47d03` 之上各模块的精确版本号，随 **U2（NXTLAB-17）资产盘点结论**逐模块补全；落地移植时在此追加文件级清单（模块 → 源文件 → 目标文件 → 改动说明） |

### 移植登记表

每完成一个模块移植，按下表逐行登记，保证来源可追溯：

| 移植模块 | 源路径（@ be47d03） | 目标路径 | 改动说明 | 登记单元 |
|---|---|---|---|---|
| _(待 U2 盘点结论与 U3/U4 移植时逐行填写)_ | | | | |

### 注意事项

- openclaw-office-2 **没有静态模型文件**：其 2D 为程序化 SVG React 组件，3D 为 R3F 程序化几何。复用资产等价于移植组件代码，不存在独立资产管线。
- 移植模块**不得**引入其 `GatewayAdapter`、`openclaw-control-ui` token、管理台与聊天代码——与 ADR-01「浏览器不持管理员凭据、服务端逐用户鉴权」正面冲突（依据：NXTLAB-15 D-1 评估第三节）。
- 移植后的模块如改动，仍须保留上游版权声明与本登记；风格/品牌规格以 D-2 项目方决议为准。

### openclaw-office MIT 许可全文

```
MIT License

Copyright (c) OpenClaw / WW-AI-Lab and contributors
Copyright (c) artapon (openclaw-office-2 fork)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

> 上游版权声明行以 openclaw-office-2 仓库内 LICENSE 原文为准；移植入仓时逐模块核对，如与本转录有出入以上游原文为准并在此订正。

## 2. 依赖清单

运行时与开发依赖均为标准开源包（React / Vite / TypeScript / Vitest / Playwright 等，MIT 或 BSD/Apache 等宽松许可）。
完整许可文本随 `node_modules` 内各包分发；升级或新增依赖时核对许可兼容性，不在本仓库重复转录。
