// storage.js — 本地成绩与设置存储 (FR-SAV-01..05 / 附录 G.1)。
// 所有 localStorage 访问唯一入口；后端可注入以便 Node 测试 (FR-SAV-02 降级)。
import {
  STORAGE_KEY, STORAGE_SCHEMA_VERSION, STORAGE_MAX_BYTES, DIFFICULTY, SHIPS,
} from './config.js';

// 首次运行默认值 (FR-SYS-07)。系统 prefers-reduced-motion 时 motion='reduced' 由调用方覆盖。
export function defaultSettings(prefersReducedMotion = false) {
  return {
    volume: { master: 70, sfx: 70, music: 50 },
    hitboxDot: true,
    motion: prefersReducedMotion ? 'reduced' : 'standard',
    difficulty: 'standard',
    tutorialSeen: false,
    ship: 'raiden',     // 当前选择战机 (v2.1)
  };
}

// 空结构（解析失败/版本不符时整体丢弃重建，不抛异常，FR-SAV-05）。
export function emptyData() {
  return {
    schema_version: STORAGE_SCHEMA_VERSION,
    best: null,
    top5: [],
    settings: defaultSettings(),
    unlocked: defaultUnlocked(), // 已解锁战机 id (v2.1)
  };
}

// 初始解锁：unlock.type === 'default' 的机型。
export function defaultUnlocked() {
  return SHIPS.filter((s) => !s.unlock || s.unlock.type === 'default').map((s) => s.id);
}

// 读取。任何异常或版本不符返回空结构。
export function load(backend, prefersReducedMotion = false) {
  try {
    const raw = backend.getItem(STORAGE_KEY);
    if (raw == null) return emptyData();
    const data = JSON.parse(raw);
    if (!data || data.schema_version !== STORAGE_SCHEMA_VERSION) {
      return emptyData(); // 版本不识别整体丢弃重建
    }
    // 补齐缺失字段，避免旧结构缺键导致后续 undefined
    const merged = emptyData();
    merged.best = data.best ?? null;
    merged.top5 = Array.isArray(data.top5) ? data.top5 : [];
    merged.settings = { ...merged.settings, ...(data.settings || {}) };
    const un = defaultUnlocked();
    merged.unlocked = Array.isArray(data.unlocked)
      ? Array.from(new Set(un.concat(data.unlocked.filter((id) => SHIPS.some((s) => s.id === id)))))
      : un;
    if (prefersReducedMotion && merged.settings.motion === 'standard') {
      merged.settings.motion = 'reduced';
    }
    return merged;
  } catch {
    return emptyData(); // 解析异常返回空结构而非抛错
  }
}

// 写入。失败静默降级，返回 false；成功返回 true。
export function save(backend, data) {
  try {
    const raw = JSON.stringify(data);
    if (raw.length > STORAGE_MAX_BYTES) return false; // 超限不写
    backend.setItem(STORAGE_KEY, raw);
    return true;
  } catch {
    return false; // 配额耗尽/隐私模式/禁用 -> 不中断、不弹错
  }
}

// 清除本地记录 (FR-SAV-04)：最高分归零、前五榜清空、读取返回空结构。
export function clearAll(backend, prefersReducedMotion = false) {
  try { backend.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
  return emptyData();
}

// 记录一局结果：更新最高分与前五榜 (FR-SAV-01/03)。
// run = { score, difficulty, date:'YYYY-MM-DD', duration, region }
export function recordRun(data, run) {
  // unlocked 需随局推进一并保留 (v2.1)
  const next = {
    ...data,
    top5: keepTop5(data.top5, run),
    settings: data.settings,
    unlocked: data.unlocked || defaultUnlocked(),
  };
  if (!next.best || run.score > next.best.score) {
    next.best = { score: run.score, difficulty: run.difficulty, date: run.date };
  }
  return next;
}

// 保留最近 5 局；超出丢弃最早一条（按日期降序）；同分按用时升序仅影响排序展示，不在此强约束。
export function keepTop5(top5, run) {
  const arr = [...top5, run];
  if (arr.length > 5) {
    arr.sort((a, b) => (b.date || '').localeCompare(a.date || '')); // 最近优先
    arr.length = 5;
  }
  return arr;
}
