# Habit Tracker Life

Bảng theo dõi thói quen theo tháng, phong cách bảng tính đen – trắng tối giản.
Trang web tĩnh: **không cần tài khoản, không cần máy chủ hay cơ sở dữ liệu**.

## Cách dùng

1. Mở file `index.html` bằng trình duyệt (Chrome, Edge, Firefox, Safari).
2. Bấm vào ô để đánh dấu ✓ thói quen đã làm trong ngày, bấm lại để bỏ.
3. Bấm **+ Thêm thói quen** để thêm thói quen; bấm vào tên thói quen để sửa hoặc xóa.

## Tính năng

- Lưới check-in theo tháng, chia Tuần 1 → Tuần 5, làm nổi cột hôm nay
- Thêm / sửa / xóa / kéo thả sắp xếp thói quen, chọn emoji
- Mục tiêu số ngày mỗi tháng; thói quen hằng ngày hoặc **N lần/tuần**
- Biểu đồ cột **Tiến độ ngày** và **Tiến độ tuần**
- **Tổng quan tháng**: Mục tiêu / Đã làm / Còn lại, vòng donut % tháng, chỉ số **Đúng tiến độ**
- Bảng **Phân tích** từng thói quen, **Top 10**, chuỗi ngày (streak) hiện tại và dài nhất
- Lưu riêng từng tháng; tháng mới tự chép danh sách thói quen của tháng trước
- **Xuất / Nhập dữ liệu** (file JSON) để sao lưu và chuyển sang máy khác
- **Reset tháng** có nút **Hoàn tác** (cả khi xóa thói quen và khi nhập file)
- Chế độ sáng / tối, giao diện điện thoại (lưới cuộn ngang, cột tên cố định)
- Phím tắt: `1–9` tick hôm nay · `← →` đổi tháng · `T` về hôm nay · `N` thêm thói quen · `?` trợ giúp
- Mở nhiều tab cùng lúc: dữ liệu giữa các tab tự gộp, không mất lượt tick nào
- Giao diện tiếng Việt hoàn toàn; có icon, ảnh xem trước khi chia sẻ link

## Cấu trúc thư mục

```
habit-tracker-life/
├── index.html      Khung trang (chỉ HTML) + thẻ meta: mô tả, icon, ảnh chia sẻ
├── css/
│   └── style.css   Toàn bộ giao diện: màu, bố cục, lưới, biểu đồ, hiệu ứng, sáng/tối, điện thoại
├── js/
│   ├── core.js     Phần lõi: cấu trúc dữ liệu, cách tính %, streak, tiến độ, gộp dữ liệu, hoàn tác
│   └── app.js      Giao diện & tương tác: vẽ bảng, tick, hộp thoại, xuất/nhập, phím tắt, hiệu ứng
├── fonts/          Font Inter (tiếng Việt, Latin)
├── icons/          favicon, apple-touch-icon (iPhone), og-image (ảnh chia sẻ 1200×630)
├── docs/
│   └── giai-thich-code.md   Giải thích code: từng file, từng phần, luồng chạy
└── README.md
```

- `core.js` phải được nạp **trước** `app.js` (app.js dùng `window.HabitCore`).
- Dùng thẻ `<script>` thường (không phải ES module) để mở được bằng cách nhấp đúp file `index.html`.
- Muốn đổi màu cả trang: sửa các biến `--ink`, `--paper`, `--bg`… ở đầu `css/style.css`.

## Dữ liệu của bạn

- Dữ liệu chỉ nằm **trong trình duyệt của bạn** (localStorage), không gửi lên bất kỳ máy chủ nào.
- Xóa dữ liệu trình duyệt hoặc dùng chế độ ẩn danh sẽ làm mất dữ liệu → hãy **Xuất dữ liệu** định kỳ.
- Mỗi trình duyệt / mỗi máy có dữ liệu riêng. Muốn chuyển máy: Xuất dữ liệu ở máy cũ → Nhập dữ liệu ở máy mới.

## Đăng lên mạng

Chép **cả thư mục** lên bất kỳ dịch vụ web tĩnh nào, ví dụ GitHub Pages, Netlify, Cloudflare Pages, Vercel.
Không cần máy chủ hay cơ sở dữ liệu.

**Việc cần làm sau khi có địa chỉ web** (ví dụ `https://thoiquen.vn/`):

1. Mở `index.html`, thay `https://example.com/` ở hai thẻ `og:url` và `og:image` bằng địa chỉ thật
   (ảnh chia sẻ phải là địa chỉ đầy đủ thì Facebook/Zalo mới hiện được).
2. Kiểm tra ảnh xem trước bằng công cụ Facebook Sharing Debugger (dán link → *Scrape Again*).

## Giấy phép

- Font **Inter** (thư mục `fonts/`) dùng giấy phép SIL Open Font License 1.1 – được phép phân phối kèm.
