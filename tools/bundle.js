// 零依赖打包：将 ES Module 源码内联为单个 classic <script>，消除 file:// 与预览 webview
// 加载 ES Module 时的 CORS 限制（"游戏打不开" 的最常见根因）。仅用于产出自包含入口，
// 模块化 src/ 仍保留供测试与维护。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const ORDER = [
  'config', 'util', 'weapons', 'ships', 'scoring', 'drops', 'boss', 'storage',
  'settings', 'statemachine', 'entities', 'levels', 'render', 'audio',
  'input', 'ui', 'game', 'main',
];

function transform(code) {
  const exp = [];
  // import { a, b } from './x.js'
  code = code.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g,
    (_m, names, p) => {
      const local = p.replace(/^\.\//, '').replace(/\.js$/, '');
      return `const {${names}} = __require(${JSON.stringify(local)});`;
    });
  // import X from './x.js'
  code = code.replace(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]\s*;?/g,
    (_m, name, p) => {
      const local = p.replace(/^\.\//, '').replace(/\.js$/, '');
      return `const ${name} = __require(${JSON.stringify(local)});`;
    });
  // import './x.js'
  code = code.replace(/import\s*['"]([^'"]+)['"]\s*;?/g, '');
  // export const|let|var|function|class NAME
  code = code.replace(/export\s+(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g,
    (_m, kw, name) => {
      if (!exp.includes(name)) exp.push(name);
      return `${kw} ${name}`;
    });
  // export { a, b as c }
  code = code.replace(/export\s*\{([\s\S]*?)\}\s*;?/g, (_m, names) =>
    names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => {
      const parts = n.split(/\s+as\s+/);
      const loc = parts[0].trim();
      const as = (parts[1] || loc).trim();
      if (!exp.includes(as)) exp.push(as);
      return `__exports.${as} = ${loc};`;
    }).join('\n'));
  const tail = exp.map((n) => `__exports.${n} = ${n};`).join('\n');
  return `${code}\n${tail}\n`;
}

const modules = {};
for (const f of ORDER) {
  const src = fs.readFileSync(path.join(SRC, f + '.js'), 'utf8');
  modules[f] = transform(src);
}

// 运行时：极简 CommonJS 式加载器（懒加载 + 缓存），之后启动入口模块。
let runtime = `
(function(){
  const __modules = ${JSON.stringify(modules)};
  const __cache = {};
  function __require(id){
    if (__cache[id]) return __cache[id].exports;
    const m = { exports: {} };
    __cache[id] = m;
    (new Function('__require', '__exports', __modules[id]))(__require, m.exports);
    return m.exports;
  }
  __require('main');
})();
`;
// 防止内联脚本中若出现 </script> 提前闭合（源码无此串，但留一手）。
runtime = runtime.replace(/<\/script/gi, '<\\/script');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const outHtml = html.replace(
  /<script type="module" src="\.\/src\/main\.js"><\/script>/,
  `<script>\n${runtime}\n</script>`,
);
fs.writeFileSync(path.join(ROOT, 'raiden-strike.html'), outHtml);

// 同时写出纯 JS 供无头冒烟测试
fs.writeFileSync(path.join(ROOT, 'dist.bundle.js'), runtime);

console.log(`bundled ${ORDER.length} modules -> raiden-strike.html (${outHtml.length} bytes)`);
