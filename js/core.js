/**
 * Habit Tracker Life – phần LÕI (core.js)
 *
 * Không đụng tới giao diện. Chứa: cấu trúc dữ liệu, kiểm tra/làm sạch dữ liệu, cách tính %,
 * chuỗi ngày (streak), tiến độ, gộp dữ liệu giữa các tab (merge) và hoàn tác (reapply).
 * Xuất ra biến toàn cục window.HabitCore để js/app.js dùng.
 *
 * Mô hình dữ liệu:
 *   state  = { version, motto, theme, updatedAt, months: { "YYYY-MM": month } }
 *   month  = { habits: [habit], checks: { id: [ngày] }, cellTs: { "id:ngày": ms }, removed: { id: ms } }
 *   habit  = { id, name, emoji, goal, freq: null | { perWeek: 1..6 }, ts }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HabitCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===================== Hằng số ===================== */
  const STORAGE_KEY = 'monthly-habit-tracker:v1';
  const DEFAULT_MOTTO = 'Mỗi ngày tốt hơn hôm qua một chút';
  const DEFAULT_HABITS = [
    ['Dậy lúc 05:00', '⏰'], ['Tập thể dục', '💪'], ['Đọc sách / Học', '📖'], ['Lên kế hoạch ngày', '📅'],
    ['Làm dự án', '🎯'], ['Không rượu bia', '🚫'], ['Hạn chế mạng xã hội', '📵'], ['Tắm nước lạnh', '🚿'],
    ['Thiền', '🧘'], ['Giãn cơ', '🤸'],
  ];
  // Tên tháng hiển thị: "Tháng 1" … "Tháng 12" (chỉ số 0–11 giống Date.getMonth())
  const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);

  /* ===================== Ngày tháng ===================== */
  const pad2 = (n) => String(n).padStart(2, '0');
  const monthKey = (y, m) => `${y}-${pad2(m + 1)}`;
  const parseKey = (key) => ({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 });
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const firstGraphemes = (s, n) => Array.from(String(s).trim()).slice(0, n).join('');

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const sameDate = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  /** Số ngày của tháng đã bắt đầu (tính cả hôm nay). */
  function elapsedDays(y, m, today = startOfToday()) {
    const days = daysIn(y, m);
    if (new Date(y, m, 1) > today) return 0;
    if (new Date(y, m, days) < today) return days;
    return today.getDate();
  }

  /** Week 1 = ngày 1–7, Week 2 = 8–14 … (dùng cho lưới & cột tuần). */
  function weekRanges(days) {
    const out = [];
    for (let s = 1; s <= days; s += 7) out.push([s, Math.min(s + 6, days)]);
    return out;
  }

  /** Thứ Hai của tuần lịch chứa ngày `date` (dùng cho thói quen N lần/tuần). */
  function weekStart(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  /* ===================== Chuẩn hóa dữ liệu ===================== */
  function emptyState() {
    return { version: 2, motto: DEFAULT_MOTTO, theme: null, updatedAt: 0, months: {} };
  }

  function normalizeHabit(h) {
    const per = h.freq && Number.isInteger(h.freq.perWeek) ? h.freq.perWeek : 0;
    return {
      id: String(h.id).slice(0, 40),
      name: String(h.name).slice(0, 60),
      emoji: (typeof h.emoji === 'string' && firstGraphemes(h.emoji, 4)) || '✅',
      goal: Number.isInteger(h.goal) && h.goal > 0 ? h.goal : null,
      freq: per >= 1 && per <= 6 ? { perWeek: per } : null,
      ts: Number.isFinite(h.ts) ? h.ts : 0,
    };
  }

  function emptyMonth(habits = []) {
    return { habits, checks: {}, cellTs: {}, removed: {} };
  }

  function normalizeMonth(month) {
    const out = emptyMonth(month.habits
      .filter((h) => h && typeof h.id === 'string' && typeof h.name === 'string')
      .map(normalizeHabit));
    if (month.checks && typeof month.checks === 'object') {
      for (const [id, list] of Object.entries(month.checks)) {
        if (!Array.isArray(list)) continue;
        const days = [...new Set(list.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b);
        if (days.length) out.checks[id] = days;
      }
    }
    for (const field of ['cellTs', 'removed']) {
      if (month[field] && typeof month[field] === 'object') {
        for (const [k, v] of Object.entries(month[field])) if (Number.isFinite(v)) out[field][k] = v;
      }
    }
    return out;
  }

  /** Kiểm tra & làm sạch dữ liệu (từ localStorage, máy chủ hoặc file Import). Ném lỗi nếu sai cấu trúc. */
  function normalizeState(s) {
    if (!s || typeof s !== 'object' || !s.months || typeof s.months !== 'object') throw new Error('Invalid data');
    const out = emptyState();
    if (typeof s.motto === 'string') out.motto = s.motto.slice(0, 140);
    if (s.theme === 'dark' || s.theme === 'light') out.theme = s.theme;
    if (Number.isFinite(s.updatedAt)) out.updatedAt = s.updatedAt;
    for (const [key, month] of Object.entries(s.months)) {
      if (!/^\d{4}-\d{2}$/.test(key) || !month || !Array.isArray(month.habits)) continue;
      out.months[key] = normalizeMonth(month);
    }
    return out;
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  /** JSON với khóa đã sắp xếp → so sánh hai state chính xác. */
  function canonical(v) {
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
    }
    return JSON.stringify(v);
  }
  const sameState = (a, b) => canonical(a) === canonical(b);

  /* ===================== Tháng & ô tick ===================== */

  /** Danh sách thói quen cho tháng chưa có: chép từ tháng gần nhất trước đó (hoặc sau đó, hoặc mặc định). */
  function templateHabits(state, key) {
    const keys = Object.keys(state.months).sort();
    const src = keys.filter((k) => k < key).pop() || keys.find((k) => k > key);
    if (src) return state.months[src].habits.map((h) => ({ ...h, freq: h.freq ? { ...h.freq } : null }));
    return DEFAULT_HABITS.map(([name, emoji], i) => ({ id: `d${i}`, name, emoji, goal: null, freq: null, ts: 0 }));
  }

  /** Dữ liệu tháng (không lưu vào state nếu tháng chưa có). */
  function monthOf(state, y, m) {
    const key = monthKey(y, m);
    return state.months[key] || emptyMonth(templateHabits(state, key));
  }

  /** Dữ liệu tháng, tạo & lưu vào state nếu chưa có. */
  function ensureMonth(state, y, m) {
    const key = monthKey(y, m);
    if (!state.months[key]) state.months[key] = emptyMonth(templateHabits(state, key));
    return state.months[key];
  }

  const isChecked = (month, id, d) => Array.isArray(month.checks[id]) && month.checks[id].includes(d);

  /** Tick / bỏ tick một ô và ghi lại thời điểm (để gộp với nơi khác). */
  function setCell(month, id, d, on, ts = Date.now()) {
    const set = new Set(month.checks[id] || []);
    if (on) set.add(d); else set.delete(d);
    if (set.size) month.checks[id] = [...set].sort((a, b) => a - b);
    else delete month.checks[id];
    month.cellTs[`${id}:${d}`] = ts;
  }

  /** `view` = { key, month } cho phép tính trên một tháng chưa lưu (bản nháp của trang tracker). */
  function checkedOn(state, id, date, view) {
    const key = monthKey(date.getFullYear(), date.getMonth());
    const month = view && view.key === key ? view.month : state.months[key];
    return !!month && isChecked(month, id, date.getDate());
  }

  /* ===================== Tần suất ===================== */
  const perWeek = (h) => (h.freq && h.freq.perWeek) || 0;
  const isWeekly = (h) => perWeek(h) > 0;

  /** Mục tiêu tháng: hằng ngày → số ngày; N lần/tuần → khoảng N × số tuần. */
  function effectiveGoal(h, days) {
    const def = isWeekly(h) ? Math.round((perWeek(h) * days) / 7) : days;
    return clamp(h.goal == null ? def : h.goal, 1, days);
  }

  /** Số lần đã làm trong tuần lịch (T2–CN) chứa `date`. `exclude` = bỏ qua chính ngày đó. */
  function weekCount(state, id, date, view, exclude = false) {
    const d = weekStart(date);
    let n = 0;
    for (let i = 0; i < 7; i++) {
      if (!(exclude && sameDate(d, date)) && checkedOn(state, id, d, view)) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  }

  /** Ngày `date` thói quen này có "đến hạn" không? Hằng ngày: luôn có. N lần/tuần: chưa đủ N trong tuần. */
  function isDue(state, h, date, view) {
    return !isWeekly(h) || weekCount(state, h.id, date, view, true) < perWeek(h);
  }

  /* ===================== Streak ===================== */

  /**
   * Chuỗi hiện tại tính tới `ref` (hôm nay, hoặc cuối tháng nếu xem tháng cũ).
   * Hằng ngày: số ngày liên tiếp (hôm nay chưa tick thì tính tới hôm qua).
   * N lần/tuần: số tuần liên tiếp đạt N (tuần hiện tại chưa đủ thì tính tới tuần trước).
   */
  function currentStreak(state, h, ref, view) {
    if (!isWeekly(h)) {
      const d = new Date(ref);
      if (!checkedOn(state, h.id, d, view)) d.setDate(d.getDate() - 1);
      let n = 0;
      while (n < 3700 && checkedOn(state, h.id, d, view)) { n++; d.setDate(d.getDate() - 1); }
      return { n, unit: 'day' };
    }
    const w = weekStart(ref);
    if (weekCount(state, h.id, w, view) < perWeek(h)) w.setDate(w.getDate() - 7);
    let n = 0;
    while (n < 530 && weekCount(state, h.id, w, view) >= perWeek(h)) { n++; w.setDate(w.getDate() - 7); }
    return { n, unit: 'week' };
  }

  /** Chuỗi dài nhất trong tháng (ngày, hoặc tuần lịch bắt đầu trong tháng). */
  function bestStreak(state, h, y, m, view) {
    const days = daysIn(y, m);
    let best = 0, run = 0;
    if (!isWeekly(h)) {
      for (let d = 1; d <= days; d++) {
        run = checkedOn(state, h.id, new Date(y, m, d), view) ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    }
    const w = weekStart(new Date(y, m, 1));
    while (w <= new Date(y, m, days)) {
      run = weekCount(state, h.id, w, view) >= perWeek(h) ? run + 1 : 0;
      best = Math.max(best, run);
      w.setDate(w.getDate() + 7);
    }
    return best;
  }

  /** Quy đổi streak ra "ngày" để so sánh giữa thói quen hằng ngày và theo tuần. */
  const streakDays = (s) => (s.unit === 'week' ? s.n * 7 : s.n);

  /* ===================== Thống kê tháng ===================== */

  /**
   * Toàn bộ số liệu của một tháng.
   * opts.month: dùng bản tháng này thay vì state (bản nháp chưa lưu); opts.today: để kiểm thử.
   */
  function computeMonth(state, y, m, opts = {}) {
    const today = opts.today || startOfToday();
    const key = monthKey(y, m);
    const month = opts.month || monthOf(state, y, m);
    const view = { key, month };
    const days = daysIn(y, m);
    const elapsed = elapsedDays(y, m, today);
    const lastDay = new Date(y, m, days);
    const ref = lastDay < today ? lastDay : today;
    const started = new Date(y, m, 1) <= today;

    const rows = month.habits.map((h) => {
      const set = new Set((month.checks[h.id] || []).filter((d) => d >= 1 && d <= days));
      const goal = effectiveGoal(h, days);
      const done = Math.min(set.size, goal);
      const expected = (goal * elapsed) / days; // số lần "đáng lẽ" đã làm tới hôm nay
      return {
        h, set, goal, done, actual: set.size,
        left: goal - done,
        pct: done / goal,
        expected,
        pace: expected > 0 ? done / expected : null,
        weekly: isWeekly(h), perWeek: perWeek(h),
        streak: started ? currentStreak(state, h, ref, view) : { n: 0, unit: isWeekly(h) ? 'week' : 'day' },
        best: bestStreak(state, h, y, m, view),
      };
    });

    // Mỗi ngày: bao nhiêu thói quen "đến hạn" và đã làm bao nhiêu
    const dayInfo = Array.from({ length: days }, (_, i) => {
      const d = i + 1;
      if (d > elapsed) return null;
      const date = new Date(y, m, d);
      let due = 0, done = 0;
      for (const r of rows) {
        if (!isDue(state, r.h, date, view)) continue;
        due++;
        if (r.set.has(d)) done++;
      }
      return { due, done };
    });
    const daily = dayInfo.map((x) => (x && x.due ? x.done / x.due : null));
    const weekly = weekRanges(days).map(([a, b]) => {
      let due = 0, done = 0;
      for (let d = a; d <= Math.min(b, elapsed); d++) { due += dayInfo[d - 1].due; done += dayInfo[d - 1].done; }
      return due ? done / due : null;
    });

    const goal = rows.reduce((s, r) => s + r.goal, 0);
    const completed = rows.reduce((s, r) => s + r.done, 0);
    const expected = rows.reduce((s, r) => s + r.expected, 0);

    // Hôm nay (nếu hôm nay thuộc tháng này)
    let todayInfo = null;
    if (today.getFullYear() === y && today.getMonth() === m) {
      const items = rows.map((r) => ({
        h: r.h, weekly: r.weekly, perWeek: r.perWeek,
        done: r.set.has(today.getDate()),
        due: isDue(state, r.h, today, view),
        weekDone: r.weekly ? weekCount(state, r.h.id, today, view) : 0,
      }));
      const dueItems = items.filter((x) => x.due);
      todayInfo = { items, due: dueItems.length, done: dueItems.filter((x) => x.done).length };
    }

    return {
      key, month, days, elapsed, rows, daily, dayInfo, weekly, today: todayInfo,
      goal, completed, left: goal - completed,
      actual: rows.reduce((s, r) => s + r.actual, 0),
      pct: goal ? completed / goal : 0,
      expected, pace: expected > 0 ? completed / expected : null,
    };
  }

  /* ===================== Gộp dữ liệu (merge) ===================== */

  function mergeMonth(A, B, aIsBase) {
    const base = aIsBase ? A : B, other = aIsBase ? B : A;
    const out = emptyMonth();
    for (const src of [A.removed, B.removed]) {
      for (const [id, ts] of Object.entries(src)) out.removed[id] = Math.max(out.removed[id] || 0, ts);
    }
    // Thói quen: bản sửa gần nhất thắng; bị xóa sau lần sửa cuối thì bỏ
    const find = (mo, id) => mo.habits.find((h) => h.id === id);
    const ids = [...base.habits.map((h) => h.id), ...other.habits.map((h) => h.id).filter((id) => !find(base, id))];
    for (const id of ids) {
      const a = find(A, id), b = find(B, id);
      const h = !a ? b : !b ? a : (b.ts || 0) > (a.ts || 0) ? b : (a.ts || 0) > (b.ts || 0) ? a : find(base, id);
      if ((out.removed[id] || 0) >= (h.ts || 0) && out.removed[id]) continue;
      out.habits.push(clone(h));
    }
    // Ô tick: ô nào được thay đổi sau cùng thì lấy theo nơi đó
    const cells = new Set([...Object.keys(A.cellTs), ...Object.keys(B.cellTs)]);
    for (const mo of [A, B]) for (const [id, list] of Object.entries(mo.checks)) for (const d of list) cells.add(`${id}:${d}`);
    for (const k of cells) {
      const i = k.lastIndexOf(':');
      const id = k.slice(0, i), d = Number(k.slice(i + 1));
      const ta = A.cellTs[k] || 0, tb = B.cellTs[k] || 0;
      const on = ta > tb ? isChecked(A, id, d) : tb > ta ? isChecked(B, id, d) : isChecked(base, id, d);
      if (on) (out.checks[id] = out.checks[id] || []).push(d);
      if (ta || tb) out.cellTs[k] = Math.max(ta, tb);
    }
    for (const id of Object.keys(out.checks)) out.checks[id].sort((x, y) => x - y);
    return out;
  }

  /** Gộp hai bản dữ liệu mà không làm mất thay đổi của bên nào. */
  function mergeStates(a, b) {
    const aIsBase = (a.updatedAt || 0) >= (b.updatedAt || 0);
    const base = aIsBase ? a : b;
    const out = emptyState();
    out.motto = base.motto;
    out.theme = base.theme;
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    for (const key of new Set([...Object.keys(a.months), ...Object.keys(b.months)])) {
      const A = a.months[key], B = b.months[key];
      out.months[key] = A && B ? mergeMonth(A, B, aIsBase) : clone(A || B);
    }
    return out;
  }

  /**
   * Biến `current` thành giống hệt `target` nhưng đóng dấu thời gian MỚI cho mọi chỗ khác nhau.
   * Dùng cho Hoàn tác và Import: thay đổi này sẽ thắng khi gộp với nơi khác.
   */
  function reapply(current, target, now = Date.now()) {
    const out = clone(current);
    out.motto = target.motto;
    out.theme = target.theme;
    out.updatedAt = now;
    const same = (x, y) => x.name === y.name && x.emoji === y.emoji && x.goal === y.goal && perWeek(x) === perWeek(y);
    for (const key of new Set([...Object.keys(out.months), ...Object.keys(target.months)])) {
      const T = target.months[key] || emptyMonth();
      const C = out.months[key] || (out.months[key] = emptyMonth());
      for (const h of C.habits) if (!T.habits.some((t) => t.id === h.id)) C.removed[h.id] = now;
      C.habits = T.habits.map((t) => {
        const c = C.habits.find((h) => h.id === t.id);
        return c && same(c, t) && !(C.removed[t.id] >= (c.ts || 0)) ? c : { ...clone(t), ts: now };
      });
      const cells = new Set();
      for (const mo of [C, T]) for (const [id, list] of Object.entries(mo.checks)) for (const d of list) cells.add(`${id}:${d}`);
      for (const k of cells) {
        const i = k.lastIndexOf(':');
        const id = k.slice(0, i), d = Number(k.slice(i + 1));
        if (isChecked(C, id, d) !== isChecked(T, id, d)) setCell(C, id, d, isChecked(T, id, d), now);
      }
    }
    return out;
  }

  return {
    STORAGE_KEY, DEFAULT_MOTTO, DEFAULT_HABITS, MONTH_NAMES,
    pad2, monthKey, parseKey, daysIn, clamp, firstGraphemes, startOfToday, sameDate,
    elapsedDays, weekRanges, weekStart,
    emptyState, emptyMonth, normalizeState, normalizeHabit, clone, canonical, sameState,
    templateHabits, monthOf, ensureMonth, isChecked, setCell, checkedOn,
    perWeek, isWeekly, effectiveGoal, weekCount, isDue,
    currentStreak, bestStreak, streakDays,
    computeMonth, mergeStates, reapply,
  };
});
