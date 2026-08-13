# Phase 5: Tương tác, a11y và kiểm thử

**Status:** Done · **Phụ thuộc:** Phase 4 · **Chặn:** không

## Context

Dọn các vấn đề còn lại từ [review report](../reports/review-260812-2258-frontend-review.md)
mà bốn phase trước không chạm tới. Không phase nào phụ thuộc phase này, nên nó có
thể cắt bớt nếu thời gian ép — trừ mục 1 và 2, vốn ảnh hưởng trực tiếp tới cảm
giác khi demo.

## Requirements

- Kéo slider ngưỡng rare không tạo bão request.
- Có phản hồi trực quan khi đang nạp instance.
- Mọi control có nhãn liên kết; hàng bảng dùng được bằng bàn phím.
- Có kiểm thử frontend tự động.

## Files

| File | Thay đổi |
|---|---|
| `src/App.jsx` | debounce ngưỡng rare, chống response cũ, state loading, tách hook |
| `src/hooks/use-mining-job.js` | **mới** |
| `src/config/api.js` | nhận `signal` |
| `src/components/pattern-list.jsx` | reset trang, hoist Set, hàng bảng dùng bàn phím |
| `src/components/mining-controls.jsx`, `data-upload.jsx` | `htmlFor`/`id` |
| `src/components/DataUpload.jsx` → `data-upload.jsx` | đổi tên |
| `package.json` | dời dep build; thêm vitest |
| `src/**/*.test.jsx` | **mới** |

## Steps

1. **Debounce ngưỡng rare.** `App.jsx:139-148` hiện gọi API mỗi bước slider —
   kéo 0→100 với `step=5` là **20 request** `/result` cộng 20 request detail, và
   không có gì chặn response cũ ghi đè response mới. Debounce 200 ms, giữ slider
   phản hồi tức thì ở local state, đánh số request và bỏ qua response bị vượt mặt.
2. **`AbortController`.** `config/api.js:8` chưa từng truyền `signal`. Thêm tham
   số tuỳ chọn; huỷ request cũ khi đổi dataset, đổi chế độ, hoặc kéo slider tiếp.
3. **Loading state khi nạp instance.** `App.jsx:61-80` xoá sạch state rồi fetch
   9.928–17.128 instance; trong lúc đó bản đồ trắng, không phân biệt được với
   dataset rỗng hay lỗi. Thêm `instancesLoading` + skeleton trong card bản đồ.
4. **`pattern-list.jsx`.**
   - reset `page` khi `result` đổi (hiện `Math.min` chỉ kẹp giá trị, người dùng
     rơi vào giữa danh sách mới);
   - `new Set(rareFeatures)` đang dựng lại **mỗi dòng, mỗi lần render**
     (`pattern-list.jsx:12`) — hoist lên component cha, truyền Set xuống;
   - hàng `<tr onClick>` (`:116-123`) thêm `tabIndex={0}`, `onKeyDown`
     Enter/Space, `aria-selected`;
   - `PatternWpi` (`:30-42`): đổi điều kiện thành `wpi === null` thay vì
     `deduced && wpi === null`. Bất biến của engine (`miner.h:20-27`) không sinh
     tổ hợp `wpi:null, deduced:false`, nên đây **không phải lỗi đang sống** — chỉ
     là bỏ một giả định không cần thiết.
5. **Nhãn a11y.** Không nơi nào dùng `htmlFor`/`id`; nhãn không bọc control nên
   không có liên kết nào. Sửa ở `mining-controls.jsx`, `pattern-list.jsx:87`,
   `data-upload.jsx:137`, và các panel mới của Phase 4.
6. **Tách hook.** `App.jsx` giữ 12 `useState` và 5 effect. Rút
   `use-mining-job.js` (job, poll, result, ngưỡng rare) để vòng poll kiểm thử
   được tách rời khỏi render.
7. **Đổi tên + dependency.** `DataUpload.jsx` → `data-upload.jsx` (mọi component
   khác đã kebab-case). Dời `tailwindcss`, `@tailwindcss/postcss`, `postcss`,
   `autoprefixer` sang `devDependencies` — chúng chỉ chạy lúc build.
8. **Vitest + Testing Library.** Phủ: poll state machine (running → done → load
   result, và nhánh lỗi liên tiếp của Phase 1), debounce ngưỡng rare bỏ qua
   response cũ, hai panel khuyến nghị render từ payload cố định, nhánh CRS chọn
   đúng cấu hình bản đồ. Thêm script `test` vào `package.json`.

## Validation

- Kéo slider ngưỡng rare từ 0 tới 100: đếm request trong tab Network — phải là
  một nhóm nhỏ, không phải 20; bảng dừng đúng ở giá trị cuối.
- Đổi dataset giữa lúc đang nạp: không có cảnh báo setState sau unmount, không có
  dữ liệu dataset cũ lọt vào.
- Điều hướng toàn app chỉ bằng bàn phím: tới được mọi control, chọn được hàng
  bảng, focus luôn nhìn thấy.
- `npm test` xanh; `npm run lint`, `npm run build` sạch; `pytest server/tests` xanh.

## Risk / Rollback

Rủi ro thấp và từng bước tách rời được. Bước 6 (tách hook) là bước đụng nhiều
dòng nhất — làm sau khi Vitest ở bước 8 đã chạy, để có lưới an toàn; hoặc đảo thứ
tự 6 và 8 nếu muốn chắc chắn hơn. Mỗi bước một commit.
