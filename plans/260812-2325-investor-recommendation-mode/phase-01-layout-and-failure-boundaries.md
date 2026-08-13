# Phase 1: Layout, scroll và ranh giới lỗi

**Status:** Done · **Phụ thuộc:** không · **Chặn:** Phase 2, Phase 4

## Context

Ba lỗi đã chẩn đoán xong, có bằng chứng dòng cụ thể. Đây là nền cho mọi phase
sau: panel mới của Phase 4 sẽ thừa hưởng đúng cơ chế cuộn này.

**Lỗi 1 — bảng pattern kéo dài thay vì cuộn.** `App.jsx:276-299` cho hai wrapper
`div` chiều cao xác định qua `min-h-0 flex-1` (chúng là flex item của `aside`
`flex min-h-0 flex-col`). Nhưng root `.card` ở `pattern-list.jsx:78` và
`instance-detail.jsx:28` **không có `h-full`**, và `.card` ở `index.css:26`
không set height. Card lấy chiều cao theo nội dung → tràn khỏi wrapper. Div bảng
bên trong có `overflow-auto` nhưng nó là `flex-1` của một parent auto-height nên
không bao giờ bị ép cuộn.

**Lỗi 2 — bản đồ sập chiều cao dưới `lg`.** `App.jsx:237-274`: dưới `lg` cả ba
panel `col-span-12` xếp thành grid row **auto**; `h-full` của card resolve theo
row auto → div bản đồ (`mining-map.jsx:128`) cao 0. Mobile không phải target
nhưng bản đồ vẫn không được biến mất, và bố cục desktop cần chắc chắn.

**Lỗi 3 — focus indicator bị xoá.** `index.css:74-79` và `89-94` viết
`ring: 2px; ring-color: ...` — đây là **tên utility Tailwind, không phải CSS
property**; trong `@layer components` trình duyệt bỏ qua chúng. Chỉ `outline:
none` có tác dụng → mọi input/select không có trạng thái focus.

**Lỗi 4 — một lần poll lỗi giấu tiến trình vĩnh viễn.** `job-progress.jsx:23-27`
trả về error card **thay cho** job. `App.jsx:94-108` ghi mọi lỗi poll vào
`jobError`; `App.jsx:57` cũng ghi lỗi nạp dataset vào cùng state đó.

## Requirements

- Card cuộn trong khung; header card (tiêu đề, slider ngưỡng rare) không cuộn theo.
- Bản đồ có chiều cao thật ở mọi breakpoint; desktop là ưu tiên.
- Focus nhìn thấy được bằng bàn phím trên mọi input/select.
- Lỗi poll tạm thời không được xoá sổ tiến trình job.
- Một lỗi render không được làm trắng cả app.

## Files

| File | Thay đổi |
|---|---|
| `src/components/pattern-list.jsx` | thêm `h-full` vào root card |
| `src/components/instance-detail.jsx` | thêm `h-full` vào root card |
| `src/App.jsx` | chiều cao panel bản đồ; tách kênh lỗi; bọc error boundary |
| `src/index.css` | `ring:` → `outline` trên `:focus-visible` |
| `src/components/job-progress.jsx` | hiện lỗi **cạnh** stage list, không thay thế |
| `src/components/error-boundary.jsx` | **mới** |
| `src/main.jsx` | bọc `<App/>` |

## Steps

1. **Sửa cuộn.** Thêm `h-full` vào root card của `pattern-list.jsx` và
   `instance-detail.jsx`. Kiểm tra div bảng bên trong đã có `min-h-0 flex-1
   overflow-auto` — có rồi, chỉ thiếu chiều cao xác định từ trên xuống.
2. **Chiều cao bản đồ.** Cho `<main>` `overflow-auto` dưới `lg` và
   `lg:min-h-0 lg:overflow-hidden`; cho section bản đồ `h-[60vh] min-h-[360px]`
   dưới `lg`, `lg:h-auto lg:min-h-0`. Hai `aside` nhận `min-h-[320px]` dưới `lg`.
3. **Focus.** Thay hai khối `:focus` trong `index.css` bằng
   `:focus-visible { outline: 2px solid var(--color-primary-500); outline-offset: 2px; }`.
   Rà cả file xem còn khai báo `ring*` nào khác không.
4. **Tách kênh lỗi.** Thêm state `appError` cho lỗi nạp dataset/instances, hiện
   ở banner đầu trang. `jobError` chỉ còn cho lỗi gửi job. Trong vòng poll: đếm
   lỗi liên tiếp, chỉ hiện sau ngưỡng (đề xuất 3), xoá khi tick thành công.
5. **`job-progress.jsx`.** Bỏ `if (error) return`; hiện lỗi như một dòng cảnh báo
   phía trên stage list, giữ nguyên status badge và đồng hồ.
6. **Error boundary.** Component class tối thiểu, hiện thông báo + nút tải lại.
   Bọc `<App/>` trong `main.jsx`.

## Validation

- Chạy mining Philadelphia ε=80 m → 175 pattern; bảng cuộn trong card, tiêu đề
  và slider ngưỡng rare đứng yên, chiều cao trang **không** vượt viewport.
- Tab qua toàn bộ form: mọi input/select có viền focus nhìn thấy được.
- Thu nhỏ cửa sổ xuống dưới `lg`: bản đồ vẫn vẽ, trang cuộn được.
- Tắt backend giữa lúc job đang chạy: stage list vẫn hiện, cảnh báo xuất hiện sau
  3 lần lỗi; bật lại → cảnh báo biến mất, poll tiếp.
- `npm run lint` và `npm run build` sạch.

## Risk / Rollback

Rủi ro thấp, thuần CSS + cấu trúc state cục bộ. Mỗi bước là một commit độc lập;
rollback bằng revert từng commit. Bước 2 là bước dễ cần tinh chỉnh nhất — xác
minh bằng trình duyệt thật trước khi sang Phase 2.
