#!/usr/bin/env node
/**
 * 贴边/展开窗口几何的回归测试（纯逻辑，不需要启动 Tauri、不需要先构建）。
 *
 * 运行：node tools/test-window-geometry.cjs      （或 pnpm test:geometry）
 *
 * 直接用 TypeScript 编译器 API 把 src/lib/windowGeometry.ts 及其依赖转成 CJS 后加载，
 * 所以断言的是**真实源码**，不是副本。
 *
 * 覆盖的是本轮修复的几个历史缺陷：
 *   1. 收起(docked)必须贴到屏幕边缘——旧逻辑会留下"漂在屏幕中间的 22px 小条"；
 *   2. 贴边位置偏下时展开不能被屏幕底部/任务栏截断；
 *   3. 悬浮状态（未贴边）展开必须留在原地，不能被强行吸回边缘；
 *   4. 吸附阈值：距边缘 32px 内吸附、超出不吸附；
 *   5. 贴右边缘展开过程中右边缘必须保持不动（否则就是肉眼可见的跳动）。
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/** 极简的 .ts → CJS 加载器：只够本项目这几个零依赖的纯逻辑模块用 */
function loadTs(file, cache = new Map()) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const source = fs.readFileSync(abs, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: abs,
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const localRequire = (spec) => loadTs(path.resolve(path.dirname(abs), spec) + '.ts', cache);
  new Function('module', 'exports', 'require', out)(mod, mod.exports, localRequire);
  return mod.exports;
}

const { computeTargetRect, detectDockSide, nearestSideWithin, clampRect, sideByCenter, slideSteps } = loadTs(
  path.join(__dirname, '..', 'src', 'lib', 'windowGeometry.ts'),
);

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log('  ok   ' + name);
  } else {
    failures.push(name + ' → 期望 ' + e + '，实际 ' + a);
    console.log('  FAIL ' + name + ' → 期望 ' + e + '，实际 ' + a);
  }
}

// 主显示器 2560x1440，底部任务栏 40px
const PRIMARY = { x: 0, y: 0, width: 2560, height: 1400, scale: 1 };
// 右侧副屏 1920x1080（无任务栏）
const SECOND = { x: 2560, y: 0, width: 1920, height: 1080, scale: 1 };

console.log('1) docked 一定贴边（修复：小条漂在屏幕中间再也回不来）');
check(
  '屏幕中间的竖条 → 贴右边缘',
  computeTargetRect('docked', 'right', { x: 1000, y: 600, width: 22, height: 130 }, PRIMARY),
  { x: 2538, y: 600, width: 22, height: 130 },
);
check(
  '屏幕中间的竖条 → 贴左边缘',
  computeTargetRect('docked', 'left', { x: 1000, y: 600, width: 22, height: 130 }, PRIMARY),
  { x: 0, y: 600, width: 22, height: 130 },
);
check(
  '竖条贴近屏幕底部 → 纵向也钳制进工作区',
  computeTargetRect('docked', 'right', { x: 2400, y: 1390, width: 320, height: 400 }, PRIMARY),
  { x: 2538, y: 1270, width: 22, height: 130 },
);

console.log('2) 贴边展开：向内生长 + 不被屏幕底部截断');
check(
  '右贴边 + 位置偏下 → 向左展开且整体上移',
  computeTargetRect('expanded', 'right', { x: 2538, y: 1300, width: 22, height: 130 }, PRIMARY),
  { x: 2160, y: 760, width: 400, height: 640 },
);
check(
  '左贴边 → 向右展开（左边缘不动）',
  computeTargetRect('expanded', 'left', { x: 0, y: 100, width: 22, height: 130 }, PRIMARY),
  { x: 0, y: 100, width: 400, height: 640 },
);
check(
  '右贴边 hover → 向左展开',
  computeTargetRect('hovering', 'right', { x: 2538, y: 200, width: 22, height: 130 }, PRIMARY),
  { x: 2240, y: 200, width: 320, height: 400 },
);

console.log('3) 悬浮（未贴边）状态：保持原地，只做钳制');
check(
  '屏幕中部的面板展开 → 位置不变',
  computeTargetRect('expanded', 'right', { x: 1000, y: 300, width: 320, height: 400 }, PRIMARY),
  { x: 1000, y: 300, width: 400, height: 640 },
);
check(
  '拖到屏幕外的面板 → 拉回可见区域',
  computeTargetRect('hovering', 'left', { x: -50, y: -30, width: 320, height: 400 }, PRIMARY),
  { x: 0, y: 0, width: 320, height: 400 },
);

console.log('4) 边缘判定与吸附阈值');
check('贴边判定：左', detectDockSide({ x: 0, y: 0, width: 320, height: 400 }, PRIMARY), 'left');
check('贴边判定：右', detectDockSide({ x: 2240, y: 0, width: 320, height: 400 }, PRIMARY), 'right');
check('贴边判定：中间 → null', detectDockSide({ x: 1000, y: 0, width: 320, height: 400 }, PRIMARY), null);
check(
  '松手距右边缘 20px → 吸附',
  nearestSideWithin({ x: 2220, y: 0, width: 320, height: 400 }, PRIMARY, 32),
  'right',
);
check(
  '松手距右边缘 40px → 不吸附',
  nearestSideWithin({ x: 2200, y: 0, width: 320, height: 400 }, PRIMARY, 32),
  null,
);
check(
  '松手距左边缘 12px → 吸附',
  nearestSideWithin({ x: 12, y: 0, width: 320, height: 400 }, PRIMARY, 32),
  'left',
);
check('中线左侧 → left', sideByCenter({ x: 100, y: 0, width: 320, height: 400 }, PRIMARY), 'left');
check('中线右侧 → right', sideByCenter({ x: 2000, y: 0, width: 320, height: 400 }, PRIMARY), 'right');

console.log('5) 副屏（主屏右侧）');
check(
  '副屏贴右边缘',
  computeTargetRect('docked', 'right', { x: 3000, y: 100, width: 22, height: 130 }, SECOND),
  { x: 4458, y: 100, width: 22, height: 130 },
);
check(
  '副屏贴左边缘（= 主屏右边缘处）',
  computeTargetRect('docked', 'left', { x: 3000, y: 100, width: 22, height: 130 }, SECOND),
  { x: 2560, y: 100, width: 22, height: 130 },
);

console.log('6) 滑动过渡：贴边展开期间锚定边不动');
{
  const from = { x: 2538, y: 600, width: 22, height: 130 };
  const to = computeTargetRect('expanded', 'right', from, PRIMARY);
  const steps = slideSteps(from, to, 9);
  const anchored = steps.every((r) => Math.abs(r.x + r.width - (PRIMARY.x + PRIMARY.width)) <= 1);
  const last = steps[steps.length - 1];
  check('所有插值帧右边缘都贴合屏幕右缘', anchored, true);
  check(
    '末帧等于目标矩形',
    { x: last.x, y: last.y, width: last.width, height: last.height },
    { x: to.x, y: to.y, width: to.width, height: to.height },
  );
  check('帧数正确', steps.length, 9);
}

console.log('7) 工作区比窗口还小时不越界');
check(
  '窗口尺寸按工作区收缩',
  clampRect({ x: 0, y: 0, width: 400, height: 640 }, { x: 0, y: 0, width: 300, height: 500, scale: 1 }),
  { x: 0, y: 0, width: 300, height: 500 },
);

console.log('');
if (failures.length) {
  console.log('失败 ' + failures.length + ' 项，通过 ' + passed + ' 项');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('全部通过：' + passed + ' 项');
