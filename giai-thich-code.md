# Giải thích code – Habit Tracker Life

Tài liệu này giải thích cách Habit Tracker Life được xây dựng: mỗi file làm gì, mỗi phần trong file nằm ở dòng nào,
và chuyện gì xảy ra từ lúc mở trang đến lúc bấm một ô.

---

## 0. Bức tranh tổng thể

```
index.html ──nạp──▶ css/style.css      (giao diện: màu, bố cục, hiệu ứng)
           ──nạp──▶ js/core.js         (bộ não: dữ liệu & cách tính – KHÔNG đụng giao diện)
           ──nạp──▶ js/app.js          (giao diện & tương tác – dùng core.js để tính)
                         │
                         ▼
                 localStorage của trình duyệt  (khóa "habit-tracker-life:v1")
```

Ví dụ dễ hình dung – một ngôi nhà:

| File | Ví dụ | Vai trò |
|---|---|---|
| `index.html` | Tường, cửa, phòng | Khung trang: các vùng trống để JS "đổ" nội dung vào |
| `css/style.css` | Sơn, đèn, đồ trang trí | Màu đen–trắng, kích thước, bố cục, hiệu ứng |
| `js/core.js` | Bộ não / sổ sách kế toán | Cất dữ liệu đúng cách, tính %, đếm chuỗi ngày |
| `js/app.js` | Điện, nước, công tắc | Bấm gì thì làm gì, vẽ bảng, hiện thông báo |

**Thứ tự nạp quan trọng:** `core.js` phải nạp trước `app.js`, vì `app.js` dùng `window.HabitCore` do `core.js` tạo ra.

---

## 1. Dữ liệu được lưu như thế nào

Toàn bộ dữ liệu là **một object**, lưu dưới dạng chữ (JSON) trong localStorage:

```js
{
  version: 2,
  motto: "Mỗi ngày tốt hơn hôm qua một chút",    // khẩu hiệu
  theme: "dark",                                  // "light" | "dark" | null (theo máy)
  updatedAt: 1792412628582,                       // lần lưu gần nhất (mili-giây)
  months: {
    "2026-10": {                                  // mỗi tháng một mục riêng
      habits: [                                   // danh sách thói quen của tháng
        { id: "d0", name: "Tập thể dục", emoji: "💪",
          goal: null,                             // null = mặc định (cả tháng)
          freq: null,                             // null = hằng ngày; { perWeek: 3 } = 3 lần/tuần
          ts: 0 }                                 // lần sửa gần nhất
      ],
      checks:  { d0: [1, 2, 5] },                 // thói quen d0 đã tick ngày 1, 2, 5
      cellTs:  { "d0:5": 1792412622743 },         // giờ tick/bỏ tick từng ô (để gộp giữa các tab)
      removed: {}                                 // thói quen đã xóa: { id: giờ xóa }
    }
  }
}
```

---

## 2. `index.html` – khung trang (~150 dòng)

| Dòng | Phần | Ghi chú |
|---|---|---|
| 1–32 | `<head>` | Tên trang, `viewport` cho điện thoại, **mô tả** (`description` – Google hiện dưới tên trang), **icon** (favicon, apple-touch-icon), màu thanh địa chỉ (`theme-color`), **thẻ chia sẻ** `og:*` / `twitter:card` (ảnh + tiêu đề khi gửi link qua Facebook, Zalo…), nạp `css/style.css` |
| 35–53 | `<header class="topbar">` | Thanh đen `← THÓI QUEN – THÁNG 10/2026 →`, 5 nút (Hôm nay, Xuất dữ liệu, Nhập dữ liệu, Reset tháng, Tối/Sáng), khẩu hiệu sửa được (`contenteditable`) |
| 55–68 | Cột trái | Bảng lưới `#grid` và bảng phân tích `#analysis` – **để trống**, JS vẽ vào |
| 70–99 | Cột phải | 3 ô số (Mục tiêu / Đã làm / Còn lại), vòng donut (SVG), dòng "Đúng tiến độ", danh sách `#top10` |
| 102–104 | Ghi chú cuối trang | Nhắc dữ liệu nằm trong trình duyệt, chỗ hiện phím tắt |
| 106–144 | `<dialog id="habitDialog">` | Hộp thoại thêm/sửa: tên, emoji, tần suất, mục tiêu, nút Xóa/Hủy/Lưu |
| 146 | `#toast` | Thông báo nhỏ dưới đáy (có `aria-live` để trình đọc màn hình đọc) |
| 148–149 | `<script>` | Nạp `js/core.js` rồi `js/app.js` |

**Donut vẽ % thế nào?** Vòng tròn SVG có chu vi `C`. Thuộc tính `stroke-dasharray = C` biến viền thành một đoạn dài
đúng bằng chu vi; `stroke-dashoffset` "đẩy" đoạn đó đi: đẩy hết `C` → 0%, không đẩy → 100%.

---

## 3. `css/style.css` – giao diện (~490 dòng)

| Dòng | Phần | Nội dung chính |
|---|---|---|
| 5–15 | Font | 3 khối `@font-face` – font Inter cho chữ Latin, Latin mở rộng, tiếng Việt (`unicode-range` → chỉ tải khi cần) |
| 16–45 | **Bảng màu (tokens)** | `--ink` (mực), `--paper` (giấy), `--bg` (nền), `--line` (đường kẻ)… + bộ màu tối. **Sửa ở đây là đổi màu cả trang** |
| 46–75 | Nền tảng | Font, cỡ chữ, kiểu nút chung `.btn` (viền đen, chữ IN HOA, rê chuột thì đảo màu) |
| 76–106 | Thanh trên | Thanh đen chữ trắng, hàng nút, khẩu hiệu |
| 107–133 | Bố cục | 2 cột (`grid-template-columns: 1fr 300px`), kiểu "thẻ" `.card`, tiêu đề khối `.bar-title` |
| 134–245 | **Lưới** | Ô kẻ mảnh như bảng tính, cột tên dính bên trái khi cuộn (`position: sticky`), cột hôm nay, ô tick `.chk` (mực loang + dấu ✓ vẽ dần), cột biểu đồ |
| 246–266 | Bảng phân tích | Thanh tiến độ `.progress`, ô nhập mục tiêu |
| 267–284 | Tổng quan | 3 ô số, donut, chú thích |
| 285–306 | Top 10 | Hàng xếp hạng, hạng 1 nền đen, `transition` để trượt khi đổi hạng |
| 307–342 | Hộp thoại & thông báo | Kiểu `<dialog>`, lưới emoji, toast |
| 343–429 | **Hiệu ứng** | Mở trang trượt lên, chuyển tháng trượt ngang, cột hôm nay "thở", hàng lóe sáng, "+1" bay, XONG đóng dấu, vệt sáng, KỶ LỤC MỚI… |
| 430–468 | Tiến độ & tuần | Vạch mốc trên donut, dòng Đúng tiến độ, nhãn "3×/tuần", nút Hoàn tác trong toast |
| 469–490 | Màn hình nhỏ | ≤1100px: 1 cột · ≤640px: cột tên hẹp, ô ngày to hơn · tắt hiệu ứng nếu máy bật "giảm chuyển động" |

**Chế độ tối hoạt động thế nào?** Khi `<html data-theme="dark">`, CSS gán lại các biến màu: `--ink` thành sáng,
`--paper` thành tối. Mọi phần tử đều dùng biến nên tự đổi theo – không phải viết CSS riêng cho từng thứ.

**Ô tick vẽ thế nào?**
- `.chk::before` là một **vòng tròn đen** ẩn bên trong ô (`scale(0)`); khi ô có class `on` → `scale(1.5)` → mực "loang" kín ô.
- `.chk.on::after` là dấu **✓**: một hình chữ nhật chỉ có viền phải + viền dưới, xoay 45°.
- Vừa tick (`.pop`) → dấu ✓ hiện dần từ dưới lên (`clip-path`) như đang được vẽ.

---

## 4. `js/core.js` – bộ não (~410 dòng)

Không đụng tới giao diện. Bọc trong một hàm tự chạy, cuối cùng gắn kết quả vào `window.HabitCore`.

| Dòng | Phần | Hàm chính |
|---|---|---|
| 19–29 | Hằng số | `STORAGE_KEY`, câu khẩu hiệu mặc định, 10 thói quen mặc định, tên tháng |
| 30–66 | Ngày tháng | `monthKey(2026, 9)` → `"2026-10"` · `daysIn` số ngày tháng · `elapsedDays` số ngày đã qua · `weekRanges` chia tuần 1–7, 8–14… · `weekStart` tìm Thứ Hai |
| 67–132 | Làm sạch dữ liệu | `normalizeState` (dòng 108): kiểm tra dữ liệu đọc vào (từ trình duyệt hay file Import), bỏ chỗ sai, điền chỗ thiếu. Sai cấu trúc → báo lỗi |
| 133–173 | Tháng & ô tick | `templateHabits` (tháng mới chép thói quen tháng trước) · `isChecked` · **`setCell`** (dòng 159): tick/bỏ tick + ghi giờ |
| 174–199 | Tần suất | `effectiveGoal` (mục tiêu: hằng ngày = số ngày; N lần/tuần ≈ N × số tuần) · `isDue` (hôm đó có "cần làm" không) |
| 200–244 | Chuỗi ngày | **`currentStreak`** (dòng 207): đếm lùi từ hôm nay; hôm nay chưa tick thì tính từ hôm qua; thói quen theo tuần thì đếm tuần · `bestStreak` kỷ lục trong tháng |
| 245–324 | **Thống kê tháng** | **`computeMonth`** (dòng 251) – hàm quan trọng nhất, xem bên dưới |
| 325–400 | Gộp & hoàn tác | **`mergeStates`** (dòng 358) gộp 2 bản dữ liệu theo từng ô · **`reapply`** (dòng 376) hoàn tác / import |
| 401– | Xuất | Trả về các hàm cho `app.js` dùng |

### `computeMonth` trả về những gì

```js
{
  rows: [ { h, goal, done, actual, left, pct, pace, streak, best }, … ],  // từng thói quen
  daily:  [0.5, 1, 0.75, null, …],   // % từng ngày (null = ngày tương lai) → biểu đồ cột ngày
  weekly: [0.6, 0.8, …],             // % từng tuần → biểu đồ cột tuần
  goal, completed, left,             // 3 ô số
  pct,                               // % mục tiêu tháng → donut
  pace,                              // đã làm ÷ "đáng lẽ" tới hôm nay → "Đúng tiến độ"
  today: { items, due, done },       // danh sách hôm nay
}
```

- **`pct`** = đã làm ÷ mục tiêu cả tháng. Giữa tháng thì số này còn thấp là bình thường.
- **`pace`** = đã làm ÷ số lần *đáng lẽ* đã làm tới hôm nay. 100% = đúng tiến độ dù mới giữa tháng.

### Vì sao cần `cellTs`, `mergeStates`, `reapply`

- **Mở 2 tab cùng lúc:** tab A tick ô X, tab B tick ô Y. `mergeStates` so giờ thay đổi **từng ô** →
  giữ cả X lẫn Y (thay vì tab nào lưu sau thì đè mất của tab kia).
- **Hoàn tác:** chỉ "lấy lại bản cũ" thì dữ liệu cũ có giờ cũ → khi gộp sẽ thua. `reapply` đưa dữ liệu về bản cũ
  nhưng **đóng dấu giờ mới** cho mọi chỗ khác biệt → bản hoàn tác luôn thắng.

---

## 5. `js/app.js` – giao diện & tương tác (~1080 dòng)

| Dòng | Phần | Hàm chính · làm gì |
|---|---|---|
| 1–23 | Mở đầu & hằng số | Lấy công cụ từ `HabitCore`; khóa lưu `habit-tracker-life:v1`; danh sách emoji; tên thứ `CN, T2…T7` |
| 24–39 | Tiện ích | `$` / `$$` tìm phần tử · `esc` "khử độc" chữ trước khi chèn HTML · `pct` · `uid` tạo mã · `dayStatus` |
| 40–106 | **Dữ liệu & lưu trữ** | `loadState` đọc · `persistLocal` cất · `saveState` (ghi giờ + cất) · `currentMonth` (tháng đang xem, có "bản nháp") · `commit` · `adopt` (thay toàn bộ dữ liệu rồi vẽ lại) |
| 107–117 | Đồng bộ giữa các tab | Nghe sự kiện `storage` → tab khác vừa lưu → `pullRemote` gộp vào |
| 118–124 | Thống kê | `computeStats` = gọi `HabitCore.computeMonth` cho tháng đang xem |
| 125–399 | **Vẽ giao diện** | `renderAll` · `renderHeader` · `renderGrid` (143) dựng lưới · `renderAnalysisStructure` · `renderStats` (236) điền số liệu, biểu đồ, donut · `renderPace` · `renderStreak` · `renderTop10` (341, hiệu ứng FLIP) · `scrollToToday` |
| 400–544 | **Thao tác** | `slideTo` / `goToMonth` / `changeMonth` / `goToday` đổi tháng · **`toggleCheck`** (446) tick một ô · `toggleTodayByIndex` phím 1–9 · `moveHabit` · `setGoal` |
| 545–602 | Hoàn tác, xuất/nhập | `snapshot` chụp trước & trả về hàm hoàn tác · `resetMonth` · `downloadJson` / `exportData` · `importData` |
| 603–618 | Sáng / tối | `applyTheme` gắn `data-theme` · `toggleTheme` |
| 619–736 | Hộp thoại thói quen | `openHabitDialog` · `syncGoalDefault` · `saveHabitFromDialog` (thêm/sửa) · `deleteHabitFromDialog` (xóa có hoàn tác) |
| 737–773 | Kéo thả | `startDrag` – dùng Pointer Events nên chạy cả chuột lẫn cảm ứng |
| 774–795 | Thông báo | `toast(msg, action)` – có thể kèm nút "Hoàn tác" |
| 796–958 | Hiệu ứng | `tweenNum` số chạy dần · `floatPlusOne` "+1" bay · `stampDay` XONG · `donutMilestone` · `showRecord` · `showRankUp` · `animateRowIn/Out` · `confettiBurst` |
| 959–973 | Phím tắt | `onShortcut` – bỏ qua khi đang gõ chữ hoặc mở hộp thoại |
| 974–1065 | **Gắn sự kiện** | `bindEvents` – "bấm cái này thì gọi hàm kia" |
| 1066– | Khởi động | Bật hiệu ứng mở trang → áp giao diện → gắn sự kiện → vẽ lần đầu → cuộn tới hôm nay |

### Chuyện gì xảy ra khi MỞ trang

1. Trình duyệt dựng khung từ `index.html`, tô màu theo `style.css`.
2. `core.js` chạy → tạo `window.HabitCore`.
3. `app.js` chạy:
   - `loadState()` đọc dữ liệu từ localStorage (chưa có → dữ liệu rỗng → hiện 10 thói quen mặc định).
   - `bindEvents()` gắn xử lý cho mọi nút.
   - `renderAll()` vẽ lưới, số liệu, biểu đồ.
   - `scrollToToday()` cuộn lưới tới cột hôm nay.

### Chuyện gì xảy ra khi BẤM một ô (`toggleCheck`, dòng 446)

1. `bindEvents` bắt cú bấm trên lưới → tìm ra ô nào (`e.target.closest('.chk')`) → gọi `toggleCheck(id, ngày, ô)`.
2. Chụp số liệu **trước** khi tick (để lát nữa so sánh xem có nên ăn mừng không).
3. `HabitCore.setCell(...)` đổi ô + ghi giờ → `commit()` lưu vào localStorage.
4. Đổi giao diện ô ngay (thêm class `on`, hiệu ứng vẽ ✓, lóe hàng) – không vẽ lại cả lưới nên rất nhanh.
5. `renderStats(true)` cập nhật mọi con số, biểu đồ, donut, Top 10 (có hiệu ứng).
6. So số liệu **sau** với **trước**:
   - ngày vừa đủ 100% → chữ XONG đóng dấu
   - % tháng vượt mốc 25/50/75/100 → donut nảy + huy hiệu
   - kỷ lục chuỗi mới → dòng ★ KỶ LỤC MỚI
   - đạt mục tiêu tháng / mốc streak 7–30–100–365 → pháo giấy

### Một số kỹ thuật đáng chú ý

- **Ủy quyền sự kiện:** cả lưới chỉ có **một** trình xử lý `click`, dùng `closest()` để biết bấm vào ô nào.
  Nhanh hơn gắn cho từng ô, và vẫn đúng khi lưới được vẽ lại.
- **"Khử độc" chữ (`esc`):** tên thói quen như `<b>Gym</b>` sẽ hiện đúng là chữ, không bị hiểu thành code HTML.
- **Bản nháp tháng:** bấm sang tháng sau chỉ để xem thì không tạo dữ liệu; chỉ khi thật sự sửa gì đó mới lưu tháng đó.
- **FLIP (Top 10):** nhớ vị trí cũ → đặt hàng vào vị trí mới → dịch ngược về chỗ cũ → cho trượt tới chỗ mới.
- **Tôn trọng "giảm chuyển động":** máy bật tùy chọn này thì mọi hiệu ứng tự tắt (cả CSS lẫn JS).

---

## 6. Muốn sửa gì thì sửa ở đâu

| Muốn… | Sửa ở |
|---|---|
| Đổi màu cả trang | `css/style.css`, phần Tokens (dòng 16–45) |
| Đổi 10 thói quen mặc định | `js/core.js`, `DEFAULT_HABITS` (phần Hằng số) |
| Đổi tên tháng / tên thứ | `js/core.js` → `MONTH_NAMES` · `js/app.js` → `WEEKDAYS` |
| Đổi mô tả / ảnh khi chia sẻ link | `index.html`, các thẻ `description` và `og:*` trong `<head>`; ảnh ở `icons/og-image.png` |
| Đổi câu khẩu hiệu mặc định | `js/core.js`, `DEFAULT_MOTTO` |
| Đổi cách tính %, chuỗi ngày | `js/core.js`, `computeMonth` / `currentStreak` |
| Thêm nút mới | `index.html` (thêm nút) + `js/app.js` → `bindEvents` (gắn hàm) |
| Đổi danh sách emoji gợi ý | `js/app.js`, `EMOJIS` |
| Đổi phím tắt | `js/app.js`, `onShortcut` |
| Tắt / đổi hiệu ứng | `css/style.css` phần Hiệu ứng + `js/app.js` phần Effects |
