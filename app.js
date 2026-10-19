/**
 * Habit Tracker Life – GIAO DIỆN & TƯƠNG TÁC (app.js)
 *
 * Cần js/core.js được nạp trước (dùng window.HabitCore).
 * Các phần: hằng số → tiện ích → dữ liệu & lưu trữ → đồng bộ giữa các tab → vẽ giao diện →
 * thao tác (tick, đổi tháng, mục tiêu, hoàn tác, xuất/nhập) → giao diện sáng/tối → hộp thoại thói quen →
 * kéo thả → thông báo → hiệu ứng → phím tắt → gắn sự kiện → khởi động.
 */
(() => {
  'use strict';

  const Core = window.HabitCore;
  const { DEFAULT_MOTTO, MONTH_NAMES, monthKey, daysIn, clamp } = Core;
  // Ngăn lưu riêng của Habit Tracker Life (không dùng chung với bản đầy đủ)
  const STORAGE_KEY = 'habit-tracker-life:v1';

  /* ================= Constants ================= */
  const EMOJIS = ('⏰ 💪 📖 📅 🎯 🚫 📵 🚿 🧘 🤸 💧 🥗 🏃 🚴 🏊 😴 ✍️ 📝 📚 🧠 💻 🎨 🎸 🎧 ' +
    '🍎 🥦 ☕ 🚭 💊 🙏 ❤️ 💰 🧹 🌱 🌞 🌙 🐕 📞 🏠 ✅ ⭐ 🔥').split(' ');
  const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // theo Date.getDay(): 0 = Chủ nhật
  const DONUT_C = 2 * Math.PI * 52;
  const WEEK_BAR_MAX = 60; // px

  /* ================= Helpers ================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v) => `${Math.round(v * 100)}%`;
  const uid = () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /** 'past' | 'today' | 'future' */
  function dayStatus(y, m, d) {
    const t = Core.startOfToday();
    const x = new Date(y, m, d);
    if (x < t) return 'past';
    return x > t ? 'future' : 'today';
  }

  /* ================= State & storage ================= */
  const today0 = new Date();
  let view = { year: today0.getFullYear(), month: today0.getMonth() };
  let state = loadState();
  let draft = null;        // tháng đang xem nhưng chưa lưu (chưa có thay đổi nào)
  let editingId = null;    // thói quen đang mở trong hộp thoại (null = thêm mới)

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Core.normalizeState(JSON.parse(raw));
    } catch (e) { /* dữ liệu hỏng → bắt đầu mới */ }
    return Core.emptyState();
  }

  /** Lưu vào trình duyệt, không đổi mốc updatedAt (dùng khi nhận dữ liệu từ máy chủ). */
  function persistLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Không lưu được dữ liệu vào trình duyệt');
    }
  }

  /** Lưu sau một thay đổi của người dùng: đóng dấu thời gian rồi gửi lên máy chủ. */
  function saveState() {
    state.updatedAt = Date.now();
    persistLocal();
    schedulePush();
  }

  const viewKey = () => monthKey(view.year, view.month);

  /** Dữ liệu tháng đang xem. Tháng chưa có thì dùng bản nháp cho tới khi có thay đổi đầu tiên. */
  function currentMonth() {
    const key = viewKey();
    if (state.months[key]) return state.months[key];
    if (!draft || draft.key !== key) draft = { key, data: Core.monthOf(state, view.year, view.month) };
    return draft.data;
  }

  /** Đưa bản nháp vào state (để hoàn tác / gộp có đủ dữ liệu). */
  function ensureStored() {
    const key = viewKey();
    if (!state.months[key]) state.months[key] = currentMonth();
    draft = null;
    return state.months[key];
  }

  function commit() {
    ensureStored();
    saveState();
  }

  const laterMonthKeys = () => Object.keys(state.months).filter((k) => k > viewKey()).sort();

  /** Thay toàn bộ state (từ máy chủ, hoàn tác, import). Không vẽ lại nếu không có gì khác. */
  function adopt(next) {
    if (Core.sameState(next, state)) return false;
    state = next;
    draft = null;
    persistLocal();
    applyTheme();
    renderAll();
    return true;
  }

  /* ================= Đồng bộ giữa các tab =================
     Bản công khai không cần máy chủ: dữ liệu nằm trong trình duyệt (localStorage).
     Mở 2 tab cùng lúc thì tab này tự gộp thay đổi của tab kia (gộp theo từng ô, không mất lượt tick nào). */
  function schedulePush() { /* không có máy chủ */ }

  function pullRemote() {
    adopt(Core.mergeStates(state, loadState()));
  }

  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) pullRemote(); });

  /* ================= Statistics (tính trong core.js) ================= */
  function computeStats() {
    return Core.computeMonth(state, view.year, view.month, { month: currentMonth() });
  }

  const freqLabel = (h) => (Core.isWeekly(h) ? `${Core.perWeek(h)}×/tuần` : '');

  /* ================= Rendering ================= */
  function renderAll() {
    renderHeader();
    renderGrid();
    renderAnalysisStructure();
    renderStats();
  }

  function renderHeader() {
    const label = `${MONTH_NAMES[view.month]}/${view.year}`;
    $('#title').textContent = `Thói quen – ${label}`;
    document.title = `Habit Tracker Life – ${label}`;
    const motto = $('#motto');
    if (document.activeElement !== motto) motto.textContent = state.motto;
    const isDark = effectiveTheme() === 'dark';
    $('#themeBtn').textContent = isDark ? '◑ Sáng' : '◐ Tối';
  }

  function renderGrid() {
    const { year, month } = view;
    const m = currentMonth();
    const days = daysIn(year, month);
    const weeks = Core.weekRanges(days);
    const range = Array.from({ length: days }, (_, i) => i + 1);
    const status = range.map((d) => dayStatus(year, month, d));

    const dayCls = (d) => {
      const st = status[d - 1];
      return [st === 'today' && 'today', st === 'future' && 'future', d > 1 && d % 7 === 1 && 'wk-start']
        .filter(Boolean).join(' ');
    };
    const weekCls = (i) => (i > 0 ? 'wk-start' : '');

    let html = `<colgroup><col class="c-name">${range.map(() => '<col>').join('')}</colgroup><thead>`;

    html += `<tr><th class="sticky lbl" scope="row"></th>${weeks.map(([a, b], i) =>
      `<th colspan="${b - a + 1}" class="wk-label ${weekCls(i)}" scope="colgroup">Tuần ${i + 1}</th>`).join('')}</tr>`;

    html += `<tr class="wk-row"><th class="sticky lbl" scope="row">Tiến độ tuần</th>${weeks.map(([a, b], i) =>
      `<td colspan="${b - a + 1}" class="${weekCls(i)}"><div class="wtrack">
         <span class="wk-pct" data-wk-pct="${i}">—</span><div class="wbar" data-wk="${i}"></div></div></td>`).join('')}</tr>`;

    html += `<tr class="bar-row"><th class="sticky lbl" scope="row">Tiến độ ngày</th>${range.map((d) =>
      `<td class="${dayCls(d)}"><div class="dtrack"><span class="done-tag">XONG</span><div class="dbar" data-day="${d}"></div></div></td>`).join('')}</tr>`;

    html += `<tr><th class="sticky habits-head" rowspan="2" scope="col">Thói quen<span class="count">${m.habits.length}</span></th>${range.map((d) =>
      `<th class="wd ${dayCls(d)}" scope="col">${WEEKDAYS[new Date(year, month, d).getDay()]}</th>`).join('')}</tr>`;

    html += `<tr>${range.map((d) => `<th class="dn ${dayCls(d)}" scope="col">${d}</th>`).join('')}</tr></thead><tbody>`;

    if (!m.habits.length) {
      html += `<tr><td class="sticky empty-cell">Chưa có thói quen.</td><td colspan="${days}" class="empty-cell">Bấm “+ Thêm thói quen” để bắt đầu.</td></tr>`;
    }
    const booting = document.body.classList.contains('boot');
    m.habits.forEach((h, i) => {
      const name = esc(h.name);
      const key = i < 9 ? `<span class="kbd" title="Phím tắt: ${i + 1} để tick hôm nay">${i + 1}</span>` : '';
      const freq = Core.isWeekly(h) ? `<span class="freq">${freqLabel(h)}</span>` : '';
      html += `<tr class="habit-row" data-id="${esc(h.id)}"${booting ? ` style="animation-delay:${i * 40}ms"` : ''}>
        <th class="sticky name-cell" scope="row"><div class="name-wrap">
          <button class="handle" type="button" title="Kéo để sắp xếp (hoặc ↑ ↓)" aria-label="Sắp xếp ${name}">⠿</button>
          <button class="habit-name" type="button" data-edit="${esc(h.id)}" title="Sửa “${name}”">
            <span class="emo">${esc(h.emoji)}</span><span class="txt">${name}</span>${freq}</button>${key}
        </div></th>${range.map((d) => {
          const on = Core.isChecked(m, h.id, d);
          const future = status[d - 1] === 'future';
          return `<td class="${dayCls(d)}"><button type="button" class="chk${on ? ' on' : ''}" role="checkbox"
            aria-checked="${on}" data-day="${d}" aria-label="${name} – ngày ${d}"${future ? ' disabled title="Ngày tương lai"' : ''}></button></td>`;
        }).join('')}</tr>`;
    });

    html += `</tbody><tfoot><tr class="pct-row"><th class="sticky lbl" scope="row">Xong %</th>${range.map((d) =>
      `<td class="pct-cell ${dayCls(d)}" data-pct-day="${d}"></td>`).join('')}</tr></tfoot>`;

    const grid = $('#grid');
    grid.style.setProperty('--days', days);
    grid.innerHTML = html;
  }

  function renderAnalysisStructure() {
    const m = currentMonth();
    const days = daysIn(view.year, view.month);
    const body = m.habits.map((h) => `
      <tr data-id="${esc(h.id)}">
        <td class="a-name" title="${esc(h.name)}"><span class="emo">${esc(h.emoji)}</span>${esc(h.name)}${Core.isWeekly(h) ? ` <span class="freq">${freqLabel(h)}</span>` : ''}</td>
        <td><input class="goal-input" type="number" min="1" max="${days}" inputmode="numeric"
             value="${Core.effectiveGoal(h, days)}" data-goal="${esc(h.id)}" aria-label="Mục tiêu cho ${esc(h.name)}"></td>
        <td data-f="actual"></td>
        <td data-f="left"></td>
        <td class="a-prog"><div class="progress"><i data-f="bar"></i></div></td>
        <td class="strong" data-f="pct"></td>
        <td data-f="pace"></td>
        <td data-f="streak"></td>
        <td data-f="best"></td>
      </tr>`).join('');

    $('#analysis').innerHTML = `
      <thead><tr>
        <th style="text-align:left">Thói quen</th><th>Mục tiêu</th><th>Đã làm</th><th>Còn lại</th>
        <th style="text-align:left">Tiến độ</th><th>%</th>
        <th title="Đã làm so với số lần cần có tới hôm nay">Nhịp</th>
        <th title="Chuỗi hiện tại">Chuỗi</th><th title="Chuỗi dài nhất trong tháng">Dài nhất</th>
      </tr></thead>
      <tbody>${body || '<tr><td class="a-name" colspan="9" style="color:var(--ink-3);font-style:italic">Chưa có thói quen.</td></tr>'}</tbody>
      <tfoot><tr>
        <td class="a-name">Tổng</td><td data-t="goal"></td><td data-t="actual"></td><td data-t="left"></td>
        <td class="a-prog"><div class="progress"><i data-t="bar"></i></div></td><td data-t="pct"></td><td data-t="pace"></td><td></td><td></td>
      </tr></tfoot>`;
  }

  /** fx = true khi vừa tick → bật các hiệu ứng (vệt sáng, lật số streak, mũi tên lên hạng). */
  function renderStats(fx = false) {
    const s = computeStats();

    // Daily bars & Done % row (chỉ tính thói quen "đến hạn" trong ngày)
    for (const el of $$('#grid .dbar')) {
      const i = el.dataset.day - 1;
      const v = s.daily[i];
      el.style.height = v == null ? '0' : `${v * 100}%`;
      const td = el.closest('td');
      const info = s.dayInfo[i];
      td.title = v == null ? '' : `Ngày ${el.dataset.day}: ${info.done}/${info.due} (${pct(v)})`;
      td.classList.toggle('full', v === 1); // (4) hiện chữ XONG
    }
    for (const el of $$('#grid [data-pct-day]')) {
      const v = s.daily[el.dataset.pctDay - 1];
      el.textContent = v == null ? '' : Math.round(v * 100);
    }

    // Weekly bars
    for (const el of $$('#grid .wbar')) {
      const v = s.weekly[el.dataset.wk];
      el.style.height = v == null ? '0' : `${Math.max(v * WEEK_BAR_MAX, v > 0 ? 2 : 0)}px`;
    }
    for (const el of $$('#grid [data-wk-pct]')) {
      const v = s.weekly[el.dataset.wkPct];
      if (v == null) { el._num = null; el.textContent = '—'; } else tweenNum(el, v, pct);
    }

    // Overall (numbers count up smoothly)
    tweenNum($('#statGoal'), s.goal);
    tweenNum($('#statDone'), s.completed);
    tweenNum($('#statLeft'), s.left);
    $('#donutFg').style.strokeDashoffset = DONUT_C * (1 - s.pct);
    tweenNum($('#donutPct'), s.pct, pct);
    renderPace(s);

    // Analysis rows
    const table = $('#analysis');
    for (const r of s.rows) {
      const tr = table.querySelector(`tbody tr[data-id="${CSS.escape(r.h.id)}"]`);
      if (!tr) continue;
      tweenNum(tr.querySelector('[data-f="actual"]'), r.actual);
      tweenNum(tr.querySelector('[data-f="left"]'), r.left);
      setBar(tr.querySelector('[data-f="bar"]'), pct(r.pct), fx);
      tweenNum(tr.querySelector('[data-f="pct"]'), r.pct, pct);
      tr.querySelector('[data-f="pace"]').textContent = r.pace == null ? '—' : pct(r.pace);
      renderStreak(tr.querySelector('[data-f="streak"]'), r.streak, fx);
      tr.querySelector('[data-f="best"]').textContent = r.best + (r.weekly ? ' tuần' : '');
      const input = tr.querySelector('.goal-input');
      if (document.activeElement !== input) input.value = r.goal;
    }
    tweenNum(table.querySelector('[data-t="goal"]'), s.goal);
    tweenNum(table.querySelector('[data-t="actual"]'), s.actual);
    tweenNum(table.querySelector('[data-t="left"]'), s.left);
    setBar(table.querySelector('[data-t="bar"]'), pct(s.pct), fx);
    tweenNum(table.querySelector('[data-t="pct"]'), s.pct, pct);
    table.querySelector('[data-t="pace"]').textContent = s.pace == null ? '—' : pct(s.pace);

    renderTop10(s.rows, fx);
  }

  /** (5) "Đúng tiến độ": đã làm so với số lần cần có tới hôm nay + vạch mốc trên donut. */
  function renderPace(s) {
    const mark = $('#donutMark');
    const frac = s.goal ? Math.min(1, s.expected / s.goal) : 0;
    mark.style.transform = `rotate(${frac * 360}deg)`;
    mark.style.opacity = s.pace == null || frac >= 1 ? 0 : 1;
    if (s.pace == null) {
      tweenNum($('#paceVal'), 0, () => '—');
      $('#paceVal')._num = null;
      $('#paceHint').textContent = 'Tháng chưa bắt đầu';
      return;
    }
    tweenNum($('#paceVal'), s.pace, pct);
    const behind = Math.ceil(s.expected - s.completed);
    $('#paceHint').textContent = behind <= 0
      ? 'Đang đúng hoặc vượt tiến độ 👏'
      : `Cần thêm ${behind} lượt để bắt kịp tiến độ`;
  }

  /** Đổi độ dài thanh tiến độ; nếu fx thì cho một vệt sáng lướt qua (7). */
  function setBar(el, width, fx) {
    if (el.style.width === width) return;
    el.style.width = width;
    if (fx) restartClass(el, 'shine');
  }

  /** Ô streak: 🔥 + số (+ "tuần"); khi tăng thì lửa phập phồng, số lật như đồng hồ lật (9). */
  function renderStreak(cell, streak, fx) {
    const prev = cell._v;
    const n = streak.n;
    cell._v = n;
    cell.classList.toggle('streak-on', n > 0);
    cell.innerHTML = n ? '<span class="flame">🔥</span> <span class="sn"></span>' : '<span class="sn"></span>';
    cell.querySelector('.sn').textContent = n + (n && streak.unit === 'week' ? ' tuần' : '');
    if (!fx || prev == null || n <= prev) return;
    animate(cell.querySelector('.flame'),
      [{ transform: 'scale(1)' }, { transform: 'scale(1.7) rotate(-8deg)' }, { transform: 'scale(.9)' }, { transform: 'scale(1)' }],
      { duration: 600, easing: 'ease-out' });
    animate(cell.querySelector('.sn'),
      [{ transform: 'perspective(80px) rotateX(-90deg)', opacity: 0 }, { transform: 'perspective(80px) rotateX(0)', opacity: 1 }],
      { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  /** Ranking with FLIP animation so items glide to their new position. */
  function renderTop10(rows, fx = false) {
    const list = $('#top10');
    const ranked = [...rows]
      .sort((a, b) => b.pct - a.pct || b.actual - a.actual || a.h.name.localeCompare(b.h.name))
      .slice(0, 10);
    $('#topEmpty').hidden = ranked.length > 0;

    const before = new Map($$('li', list).map((li) => [li.dataset.id, li.getBoundingClientRect().top]));
    const existing = new Map($$('li', list).map((li) => [li.dataset.id, li]));

    ranked.forEach((r, i) => {
      let li = existing.get(r.h.id);
      if (li) {
        existing.delete(r.h.id);
      } else {
        li = document.createElement('li');
        li.dataset.id = r.h.id;
        li.className = 'enter';
        li.innerHTML = '<span class="rk"></span><span class="emo"></span><span class="nm"></span><span class="mini"><i></i></span><span class="pc"></span>';
      }
      // (12) Leo hạng → mũi tên ▲ hiện 2 giây
      if (fx && li._rank != null && i + 1 < li._rank) showRankUp(li);
      li._rank = i + 1;
      li.querySelector('.rk').textContent = i + 1;
      li.querySelector('.emo').textContent = r.h.emoji;
      li.querySelector('.nm').textContent = r.h.name;
      setBar(li.querySelector('.mini i'), pct(r.pct), fx);
      li.querySelector('.pc').textContent = pct(r.pct);
      list.appendChild(li); // moves existing node into rank order
    });
    existing.forEach((li) => li.remove());

    // Lúc mới mở trang các thẻ còn đang trượt vào → vị trí đo được sai, bỏ hiệu ứng đổi hạng
    if (document.body.classList.contains('boot')) return;
    for (const li of $$('li', list)) {
      const old = before.get(li.dataset.id);
      if (old == null) continue;
      const dy = old - li.getBoundingClientRect().top;
      if (!dy) continue;
      li.style.transition = 'none';
      li.style.transform = `translateY(${dy}px)`;
      li.style.zIndex = dy > 0 ? 1 : 0;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        li.style.transition = '';
        li.style.transform = '';
        li.addEventListener('transitionend', () => { li.style.zIndex = ''; }, { once: true });
      }));
    }
  }

  function scrollToToday() {
    const scroller = $('#gridScroller');
    const cell = $('#grid .dn.today');
    if (!cell) { scroller.scrollLeft = 0; return; }
    const nameW = $('#grid .habits-head').offsetWidth;
    const target = cell.offsetLeft - nameW - (scroller.clientWidth - nameW) / 2;
    scroller.scrollLeft = Math.max(0, target);
  }

  /* ================= Actions ================= */
  let monthAnimating = false;

  /** Swap month content with a slide: cards glide out sideways, then back in from the other side. */
  function slideTo(delta, apply) {
    if (monthAnimating) return;
    if (reducedMotion()) { apply(); return; }
    monthAnimating = true;
    const cards = $$('.main-col .card, .side-col .card');
    const out = delta > 0 ? 'm-out-l' : 'm-out-r';
    const inn = delta > 0 ? 'm-in-r' : 'm-in-l';
    cards.forEach((el) => el.classList.add(out));
    setTimeout(() => {
      apply();
      cards.forEach((el) => {
        el.classList.remove(out);
        el.classList.add(inn);
        void el.offsetWidth; // commit the hidden start state, then transition back to visible
        el.classList.remove(inn);
      });
      setTimeout(() => { monthAnimating = false; }, 320);
    }, 190);
  }

  function goToMonth(year, month) {
    const delta = (year * 12 + month) - (view.year * 12 + view.month);
    if (!delta) return;
    slideTo(delta, () => {
      view = { year, month };
      draft = null;
      renderAll();
      scrollToToday();
    });
  }

  function changeMonth(delta) {
    const d = new Date(view.year, view.month + delta, 1);
    goToMonth(d.getFullYear(), d.getMonth());
  }

  function goToday() {
    const t = new Date();
    if (t.getFullYear() === view.year && t.getMonth() === view.month) { scrollToToday(); return; }
    goToMonth(t.getFullYear(), t.getMonth());
  }

  function toggleCheck(id, day, btn) {
    const before = computeStats();
    const bRow = before.rows.find((r) => r.h.id === id);
    const m = currentMonth();
    const on = !Core.isChecked(m, id, day);
    Core.setCell(m, id, day, on, Date.now());
    commit();

    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
    restartClass(btn, 'pop');
    if (on) {
      restartClass(btn.closest('td'), 'just-on');
      restartClass(btn.closest('tr'), 'row-flash'); // (2)
    }
    renderStats(true);

    const s = computeStats();
    const row = s.rows.find((r) => r.h.id === id);
    if (!row || !bRow) return;
    const tag = (r) => `${r.h.emoji} ${r.h.name}`;
    const unit = row.weekly ? 'tuần' : 'ngày';

    if (on) floatPlusOne(btn); // (3)

    // (4) Ngày này vừa đủ 100% thói quen đến hạn
    if (s.daily[day - 1] === 1 && before.daily[day - 1] !== 1) stampDay(day);

    // (8) Donut vượt mốc 25/50/75/100%
    const mark = [0.25, 0.5, 0.75, 1].filter((x) => s.pct >= x && before.pct < x).pop();
    if (mark) donutMilestone(mark);

    // Thói quen theo tuần vừa đủ số lần của tuần này
    if (on && row.weekly) {
      const date = new Date(view.year, view.month, day);
      const vw = { key: viewKey(), month: m };
      if (Core.weekCount(state, id, date, vw) === row.perWeek) {
        burstAt(btn, 20);
        toast(`Đủ ${row.perWeek} lần tuần này: ${tag(row)}`);
      }
    }

    // (10) Kỷ lục chuỗi mới trong tháng
    if (row.best > bRow.best && row.best >= (row.weekly ? 2 : 3)) {
      showRecord(`★ Kỷ lục mới · ${tag(row)} · ${row.best} ${unit} liên tiếp`);
    }

    // (11) Ăn mừng: đạt mục tiêu thói quen, mốc streak, 100% tháng
    if (row.pct >= 1 && bRow.pct < 1) {
      burstAt(btn, 36);
      toast(`Đạt mục tiêu tháng: ${tag(row)}`);
    }
    const milestones = row.weekly ? [4, 12, 26, 52] : [7, 30, 100, 365];
    if (row.streak.n > bRow.streak.n && milestones.includes(row.streak.n)) {
      const cell = $(`#analysis tbody tr[data-id="${CSS.escape(id)}"] [data-f="streak"]`);
      if (cell) burstAt(cell, 48);
    }
    if (s.pct >= 1 && before.pct < 1) {
      burstAt($('#donutFg'), 90);
      toast('Hoàn thành 100% mục tiêu tháng này!');
    }
  }

  /** (14 phím tắt) Tick / bỏ tick hôm nay cho thói quen thứ `index`. */
  function toggleTodayByIndex(index) {
    const t = new Date();
    if (t.getFullYear() !== view.year || t.getMonth() !== view.month) {
      toast('Đang xem tháng khác – nhấn T để về hôm nay');
      return;
    }
    const h = currentMonth().habits[index];
    if (!h) return;
    const btn = $(`#grid tr.habit-row[data-id="${CSS.escape(h.id)}"] .chk[data-day="${t.getDate()}"]`);
    if (btn) toggleCheck(h.id, t.getDate(), btn);
  }

  function moveHabit(from, to) {
    const m = currentMonth();
    if (to < 0 || to >= m.habits.length || from === to) return false;
    const [h] = m.habits.splice(from, 1);
    m.habits.splice(to, 0, h);
    commit();
    renderAll();
    return true;
  }

  function setGoal(id, raw) {
    const m = currentMonth();
    const h = m.habits.find((x) => x.id === id);
    if (!h) return;
    const days = daysIn(view.year, view.month);
    const n = parseInt(raw, 10);
    const def = Core.effectiveGoal({ ...h, goal: null }, days);
    h.goal = Number.isNaN(n) || clamp(n, 1, days) === def ? null : clamp(n, 1, days);
    h.ts = Date.now();
    commit();
    renderStats();
  }

  /* ---------- (3 tối ưu) Hoàn tác ---------- */

  /** Chụp lại dữ liệu trước một thao tác lớn; trả về hàm hoàn tác. */
  function snapshot() {
    ensureStored();
    const snap = Core.clone(state);
    return () => {
      adopt(Core.reapply(state, snap)); // đóng dấu mới → thắng khi gộp với máy chủ
      schedulePush();
      toast('Đã hoàn tác');
    };
  }

  function resetMonth() {
    const label = `${MONTH_NAMES[view.month]}/${view.year}`;
    if (!confirm(`Xóa toàn bộ dấu tick của ${label}?\nDanh sách thói quen được giữ nguyên. Có thể hoàn tác ngay sau đó.`)) return;
    const undo = snapshot();
    const m = currentMonth();
    const now = Date.now();
    for (const [id, list] of Object.entries(m.checks)) for (const d of [...list]) Core.setCell(m, id, d, false, now);
    commit();
    renderAll();
    toast(`Đã reset ${label}`, { label: 'Hoàn tác', fn: undo });
  }

  function downloadJson(filename) {
    const payload = { ...state, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportData() {
    const t = new Date();
    downloadJson(`habit-tracker-${t.getFullYear()}-${Core.pad2(t.getMonth() + 1)}-${Core.pad2(t.getDate())}.json`);
    toast('Đã xuất dữ liệu JSON');
  }

  async function importData(file) {
    try {
      const next = Core.normalizeState(JSON.parse(await file.text()));
      const count = Object.keys(next.months).length;
      if (!confirm(`Nhập ${count} tháng dữ liệu từ “${file.name}”?\nDữ liệu hiện tại sẽ được thay bằng nội dung file (có thể hoàn tác ngay sau đó).`)) return;
      const undo = snapshot();
      adopt(Core.reapply(state, next)); // đóng dấu mới để bản nhập thắng khi gộp với máy chủ
      schedulePush();
      toast('Đã nhập dữ liệu', { label: 'Hoàn tác', fn: undo });
    } catch (e) {
      toast('File JSON không hợp lệ');
    }
  }

  /* ================= Theme ================= */
  const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme = () => state.theme || (systemDark() ? 'dark' : 'light');

  function applyTheme() {
    if (state.theme) document.documentElement.dataset.theme = state.theme;
    else delete document.documentElement.dataset.theme;
  }

  function toggleTheme() {
    state.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
    saveState();
    applyTheme();
    renderHeader();
  }

  /* ================= Habit dialog ================= */
  function dialogFreq() {
    return $('#fFreq').value === 'weekly' ? { perWeek: clamp(parseInt($('#fPerWeek').value, 10) || 3, 1, 6) } : null;
  }

  /** Mục tiêu mặc định theo tần suất đang chọn (và gợi ý bên dưới ô nhập). */
  function syncGoalDefault(resetValue) {
    const days = daysIn(view.year, view.month);
    const freq = dialogFreq();
    $('#perWeekWrap').hidden = !freq;
    const def = Core.effectiveGoal({ goal: null, freq }, days);
    if (resetValue) $('#fGoal').value = def;
    $('#goalHint').textContent = freq
      ? `Tháng này có ${days} ngày ≈ ${(days / 7).toFixed(1)} tuần → mặc định ${def} lần.`
      : `Tháng này có ${days} ngày (mặc định = ${days}).`;
  }

  function openHabitDialog(id) {
    const m = currentMonth();
    const days = daysIn(view.year, view.month);
    const h = id ? m.habits.find((x) => x.id === id) : null;
    editingId = h ? h.id : null;

    $('#dlgTitle').textContent = h ? 'Sửa thói quen' : 'Thêm thói quen';
    $('#fName').value = h ? h.name : '';
    $('#fEmoji').value = h ? h.emoji : '✅';
    $('#fFreq').value = h && Core.isWeekly(h) ? 'weekly' : 'daily';
    $('#fPerWeek').value = h && Core.isWeekly(h) ? Core.perWeek(h) : 3;
    $('#fGoal').max = days;
    syncGoalDefault(true);
    if (h) $('#fGoal').value = Core.effectiveGoal(h, days);
    $('#deleteHabitBtn').hidden = !h;

    // (7) Áp dụng cho các tháng sau đã tạo
    const later = laterMonthKeys();
    $('#forwardWrap').hidden = !later.length;
    $('#fForward').checked = true;
    $('#forwardText').textContent = `Áp dụng cho ${later.length} tháng sau đã tạo (${later.map((k) => `T${Core.parseKey(k).m + 1}`).join(', ')})`;

    syncEmojiSelection();
    $('#habitDialog').showModal();
    if (h && !reducedMotion()) {
      $('#fEmoji').animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: 450, easing: 'cubic-bezier(.3,.7,.4,1)' });
    }
    $('#fName').focus();
  }

  function syncEmojiSelection() {
    const v = $('#fEmoji').value.trim();
    for (const b of $$('#emojiGrid button')) b.classList.toggle('sel', b.textContent === v);
  }

  /** Chạy fn trên từng tháng sau (nếu hộp "áp dụng cho các tháng sau" được chọn). */
  function forEachLaterMonth(fn) {
    if ($('#forwardWrap').hidden || !$('#fForward').checked) return 0;
    const keys = laterMonthKeys();
    keys.forEach((k) => fn(state.months[k]));
    return keys.length;
  }

  function saveHabitFromDialog() {
    const name = $('#fName').value.trim().slice(0, 60);
    if (!name) { $('#fName').focus(); return; }
    const emoji = Core.firstGraphemes($('#fEmoji').value, 4) || '✅';
    const freq = dialogFreq();
    const days = daysIn(view.year, view.month);
    const n = parseInt($('#fGoal').value, 10);
    const def = Core.effectiveGoal({ goal: null, freq }, days);
    const goal = Number.isNaN(n) || clamp(n, 1, days) === def ? null : clamp(n, 1, days);
    const now = Date.now();

    const m = ensureStored();
    const h = editingId && m.habits.find((x) => x.id === editingId);
    const fields = { name, emoji, goal, freq, ts: now };
    // Tháng sau chỉ nhận tên, emoji, tần suất – mục tiêu là riêng của từng tháng (số ngày khác nhau)
    const forward = () => ({ name, emoji, freq: freq ? { ...freq } : null, ts: now });
    let newId = null;
    if (h) {
      Object.assign(h, fields);
      forEachLaterMonth((mo) => {
        const x = mo.habits.find((y) => y.id === h.id);
        if (x) Object.assign(x, forward());
      });
    } else {
      newId = uid();
      m.habits.push({ id: newId, ...fields });
      forEachLaterMonth((mo) => mo.habits.push({ id: newId, goal: null, ...forward() }));
    }
    commit();
    $('#habitDialog').close();
    renderAll();
    if (newId) animateRowIn(newId); // (14 hiệu ứng)
  }

  async function deleteHabitFromDialog() {
    const m = currentMonth();
    const h = m.habits.find((x) => x.id === editingId);
    if (!h) return;
    const later = !$('#forwardWrap').hidden && $('#fForward').checked ? laterMonthKeys().length : 0;
    const scope = later ? ` và ${later} tháng sau` : '';
    if (!confirm(`Xóa thói quen “${h.name}” khỏi ${MONTH_NAMES[view.month]}/${view.year}${scope}?\nCó thể hoàn tác ngay sau đó.`)) return;
    $('#habitDialog').close();
    const undo = snapshot();
    await animateRowOut(h.id); // (14 hiệu ứng) thu hàng lại trước khi xóa
    const now = Date.now();
    const remove = (mo) => {
      mo.habits = mo.habits.filter((x) => x.id !== h.id);
      mo.removed[h.id] = now; // ghi lại để nơi khác cũng xóa khi gộp
    };
    remove(ensureStored());
    if (later) laterMonthKeys().forEach((k) => remove(state.months[k]));
    commit();
    renderAll();
    toast(`Đã xóa “${h.name}”`, { label: 'Hoàn tác', fn: undo });
  }

  /* ================= Drag to reorder (pointer events: mouse + touch) ================= */
  function startDrag(handle, e) {
    const rows = $$('#grid tbody tr.habit-row');
    const row = handle.closest('tr');
    const from = rows.indexOf(row);
    let to = from;
    const clearMarks = () => rows.forEach((r) => r.classList.remove('drop-before', 'drop-after'));

    row.classList.add('dragging');
    document.body.classList.add('is-dragging');
    handle.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const idx = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return ev.clientY < b.top + b.height / 2;
      });
      to = idx === -1 ? rows.length : idx;
      clearMarks();
      if (to === from || to === from + 1) return;
      if (to < rows.length) rows[to].classList.add('drop-before');
      else rows[rows.length - 1].classList.add('drop-after');
    };
    const onEnd = (ev) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      clearMarks();
      row.classList.remove('dragging');
      document.body.classList.remove('is-dragging');
      if (ev.type === 'pointerup') moveHabit(from, to > from ? to - 1 : to);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }

  /* ================= Toast (kèm nút Hoàn tác) ================= */
  let toastTimer;
  function toast(msg, action) {
    const el = $('#toast');
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = msg;
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        el.classList.remove('show');
        action.fn();
      }, { once: true });
      el.appendChild(btn);
    }
    el.classList.toggle('has-action', !!action);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 7000 : 2200);
  }

  /* ================= Effects ================= */
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Smoothly count an element's number toward a new value. */
  function tweenNum(el, to, fmt = (v) => String(Math.round(v))) {
    if (el._raf) cancelAnimationFrame(el._raf);
    const from = el._num == null ? to : el._num;
    el._num = to;
    // Tab ẩn thì requestAnimationFrame bị tạm dừng → đặt luôn giá trị cuối để không hiện số sai
    if (from === to || reducedMotion() || document.hidden) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 450);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  /** Chạy Web Animation trừ khi người dùng bật giảm chuyển động (CSS không chặn được WAAPI). */
  function animate(el, keyframes, opts) {
    if (!el || reducedMotion()) return null;
    return el.animate(keyframes, opts);
  }

  /** Gỡ rồi gắn lại class để animation CSS chạy lại từ đầu. */
  function restartClass(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** (3) "+1" bay từ ô vừa tick tới ô Completed, rồi ô Completed nảy lên. */
  function floatPlusOne(fromEl) {
    if (reducedMotion()) return;
    const a = fromEl.getBoundingClientRect();
    const tile = $('#statDone').closest('.tile');
    const b = $('#statDone').getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'float-num';
    el.textContent = '+1';
    el.style.left = `${a.left + a.width / 2}px`;
    el.style.top = `${a.top + a.height / 2}px`;
    document.body.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    el.animate([
      { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
      { transform: 'translate(-50%,-160%) scale(1)', opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0.2 },
    ], { duration: 850, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => {
      el.remove();
      restartClass(tile, 'bump');
    };
  }

  /** (4) Cả cột của ngày lóe sáng, chữ XONG "đóng dấu" xuống. */
  function stampDay(day) {
    const grid = $('#grid');
    const cells = [
      ...$$(`tr.habit-row > td:nth-child(${day + 1}), tr.bar-row > td:nth-child(${day + 1}), tr.pct-row > td:nth-child(${day + 1})`, grid),
      ...$$('th.dn', grid).filter((th) => th.textContent === String(day)),
    ];
    cells.forEach((c) => restartClass(c, 'col-flash'));
    const tag = $(`.dbar[data-day="${day}"]`, grid)?.previousElementSibling;
    if (tag) restartClass(tag, 'stamp');
  }

  /** (8) Donut "tách" một nhịp và hiện huy hiệu mốc %. */
  function donutMilestone(mark) {
    const badge = $('#milestone');
    badge.textContent = mark >= 1 ? '100% ✓' : `${Math.round(mark * 100)}%`;
    animate($('.donut'), [{ transform: 'scale(1)' }, { transform: 'scale(1.09)' }, { transform: 'scale(.97)' }, { transform: 'scale(1)' }],
      { duration: 650, easing: 'ease-out' });
    animate(badge, [
      { opacity: 0, transform: 'translateY(6px) scale(.8)' },
      { opacity: 1, transform: 'none', offset: 0.12 },
      { opacity: 1, transform: 'none', offset: 0.85 },
      { opacity: 0, transform: 'translateY(-4px)' },
    ], { duration: 2400, easing: 'ease-out' });
  }

  /** (10) Dòng "NEW RECORD" chạy ngang thanh tiêu đề. */
  function showRecord(text) {
    const el = $('#record');
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = text;
    const anim = animate(el, [
      { transform: 'translateX(110%)', opacity: 1 },
      { transform: 'translateX(0)', opacity: 1, offset: 0.12 },
      { transform: 'translateX(0)', opacity: 1, offset: 0.85 },
      { transform: 'translateX(-110%)', opacity: 1 },
    ], { duration: 3200, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (!anim) toast(text);
  }

  /** (12) Mũi tên ▲ cạnh thứ hạng, mờ dần sau 2 giây. */
  function showRankUp(li) {
    li.querySelector('.up')?.remove();
    const up = document.createElement('span');
    up.className = 'up';
    up.textContent = '▲';
    li.appendChild(up);
    const anim = animate(up, [
      { opacity: 0, transform: 'translateY(4px)' },
      { opacity: 1, transform: 'none', offset: 0.15 },
      { opacity: 1, offset: 0.8 },
      { opacity: 0 },
    ], { duration: 2200, easing: 'ease-out' });
    if (anim) anim.onfinish = () => up.remove(); else up.remove();
  }

  /** (14) Hàng thói quen mới mở ra / hàng bị xóa thu lại. */
  function animateRowIn(id) {
    const tr = $(`#grid tr.habit-row[data-id="${CSS.escape(id)}"]`);
    if (!tr) return;
    for (const cell of tr.children) {
      animate(cell, [{ opacity: 0, transform: 'scaleY(0)' }, { opacity: 1, transform: 'scaleY(1)' }],
        { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    restartClass(tr, 'row-flash');
    tr.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function animateRowOut(id) {
    const tr = $(`#grid tr.habit-row[data-id="${CSS.escape(id)}"]`);
    const anims = tr ? [...tr.children].map((cell) => animate(cell,
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-24px) scaleY(.4)' }],
      { duration: 260, easing: 'ease-in', fill: 'forwards' })).filter(Boolean) : [];
    // Không bao giờ để việc xóa phụ thuộc vào animation (tab ẩn thì animation không chạy)
    const timeout = new Promise((resolve) => setTimeout(resolve, 400));
    return Promise.race([Promise.all(anims.map((a) => a.finished)), timeout]);
  }

  /** (11) Pháo giấy đơn sắc: ô vuông đen/xám theo màu giao diện. */
  function confettiBurst(x, y, count = 32) {
    if (reducedMotion()) return;
    const css = getComputedStyle(document.documentElement);
    const colors = ['--ink', '--ink-2', '--ink-3'].map((v) => css.getPropertyValue(v).trim());
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      const w = 4 + Math.random() * 6;
      const thin = Math.random() < .35;
      p.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${thin ? w * .4 : w}px;`
        + `background:${colors[i % colors.length]}`;
      document.body.appendChild(p);
      const a = Math.random() * Math.PI * 2;
      const dx = Math.cos(a) * (40 + Math.random() * 90);
      const dy = Math.sin(a) * (30 + Math.random() * 50) + 110;
      p.animate(
        [{ transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
         { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${(Math.random() - .5) * 720}deg)`, opacity: 0 }],
        { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.15,.6,.35,1)' }
      ).onfinish = () => p.remove();
    }
  }
  const burstAt = (el, n) => {
    const b = el.getBoundingClientRect();
    confettiBurst(b.left + b.width / 2, b.top + b.height / 2, n);
  };

  /* ================= Phím tắt ================= */
  const SHORTCUTS = '1–9: tick hôm nay · ← →: đổi tháng · T: hôm nay · N: thêm thói quen · ?: trợ giúp';

  function onShortcut(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || $('#habitDialog').open) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable="true"], .handle')) return;
    if (/^[1-9]$/.test(e.key)) { e.preventDefault(); toggleTodayByIndex(Number(e.key) - 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); changeMonth(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); changeMonth(1); }
    else if (e.key === 't' || e.key === 'T') goToday();
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openHabitDialog(null); }
    else if (e.key === '?') toast(SHORTCUTS);
  }

  /* ================= Events ================= */
  function bindEvents() {
    $('#prevMonth').addEventListener('click', () => changeMonth(-1));
    $('#nextMonth').addEventListener('click', () => changeMonth(1));
    $('#todayBtn').addEventListener('click', goToday);
    $('#addHabitBtn').addEventListener('click', () => openHabitDialog(null));
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });
    $('#resetBtn').addEventListener('click', resetMonth);
    $('#themeBtn').addEventListener('click', toggleTheme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderHeader);
    document.addEventListener('keydown', onShortcut);
    $('#shortcutHint').textContent = `Phím tắt: ${SHORTCUTS}`;

    // Motto
    const motto = $('#motto');
    motto.addEventListener('input', () => {
      state.motto = motto.textContent.slice(0, 140);
      saveState();
    });
    motto.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); motto.blur(); } });
    motto.addEventListener('blur', () => {
      if (!motto.textContent.trim()) {
        state.motto = DEFAULT_MOTTO;
        saveState();
      }
      motto.textContent = state.motto;
    });

    // Grid: checkboxes + edit
    const grid = $('#grid');
    grid.addEventListener('click', (e) => {
      const chk = e.target.closest('.chk');
      if (chk && !chk.disabled) {
        toggleCheck(chk.closest('tr').dataset.id, Number(chk.dataset.day), chk);
        return;
      }
      const edit = e.target.closest('[data-edit]');
      if (edit) openHabitDialog(edit.dataset.edit);
    });
    grid.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.handle');
      if (!handle || e.button !== 0) return;
      e.preventDefault();
      startDrag(handle, e);
    });
    grid.addEventListener('keydown', (e) => {
      const handle = e.target.closest('.handle');
      if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const id = handle.closest('tr').dataset.id;
      const idx = currentMonth().habits.findIndex((h) => h.id === id);
      if (moveHabit(idx, idx + (e.key === 'ArrowUp' ? -1 : 1))) {
        $(`#grid tr[data-id="${CSS.escape(id)}"] .handle`).focus();
      }
    });

    // Analysis: inline goal editing
    $('#analysis').addEventListener('change', (e) => {
      const input = e.target.closest('.goal-input');
      if (input) setGoal(input.dataset.goal, input.value);
    });

    // Dialog
    $('#emojiGrid').innerHTML = EMOJIS.map((em) => `<button type="button" aria-label="${em}">${em}</button>`).join('');
    $('#emojiGrid').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $('#fEmoji').value = b.textContent;
      restartClass(b, 'pop');
      syncEmojiSelection();
    });
    $('#fEmoji').addEventListener('input', syncEmojiSelection);
    $('#fFreq').addEventListener('change', () => syncGoalDefault(true));
    $('#fPerWeek').addEventListener('input', () => syncGoalDefault(true));
    $('#habitForm').addEventListener('submit', (e) => { e.preventDefault(); saveHabitFromDialog(); });
    $('#cancelDlgBtn').addEventListener('click', () => $('#habitDialog').close());
    $('#deleteHabitBtn').addEventListener('click', deleteHabitFromDialog);

    // Quay lại tab (ví dụ sau nửa đêm): vẽ lại và lấy dữ liệu mới từ máy chủ
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      renderAll();
      pullRemote();
    });
  }

  /* ================= Init ================= */
  document.body.classList.add('boot');
  setTimeout(() => document.body.classList.remove('boot'), 1400);
  ['#statGoal', '#statDone', '#statLeft', '#donutPct', '#paceVal'].forEach((sel) => { $(sel)._num = 0; });
  $('#donutFg').setAttribute('stroke-dasharray', DONUT_C);
  $('#donutFg').style.strokeDashoffset = DONUT_C;
  applyTheme();
  bindEvents();
  renderAll();
  scrollToToday();
})();
