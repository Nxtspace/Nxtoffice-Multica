/**
 * 应用外壳（U1 骨架）。
 *
 * 2D / 3D 视图组件分别挂载到 src/views/two-d 与 src/views/three-d，
 * 由 U3（共享契约 + mock 快照）与 U4（3D 资产实测）在隔离分支开发、
 * 完成后按 README「分支与合入规则」合入；本文件只提供落位，不提前实现。
 */
export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Nxtoffice</h1>
        <p className="app__subtitle">Multica 可视化虚拟办公室 · 2D / 3D 双视图</p>
      </header>
      <main className="app__main" data-testid="view-slot">
        <section aria-label="2D 等距视图" className="view-slot view-slot--2d">
          <h2>2D 等距视图</h2>
          <p>待 U3/U4 合入后挂载（渲染层选型见 docs/adr/0003）。</p>
        </section>
        <section aria-label="3D 沉浸视图" className="view-slot view-slot--3d">
          <h2>3D 沉浸视图</h2>
          <p>待 U3/U4 合入后挂载（Three.js / React Three Fiber）。</p>
        </section>
      </main>
      <footer className="app__footer">
        <span>骨架占位 · 快照与时效语义由 src/contract 定义（U3）</span>
      </footer>
    </div>
  );
}
