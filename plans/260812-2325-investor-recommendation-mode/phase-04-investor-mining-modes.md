# Phase 4: Tách Investor/Mining view

**Status:** Done · **Phụ thuộc:** Phase 2 và Phase 3 · **Chặn:** Phase 5

## Context

Hai chế độ dùng chung bản đồ và bảng điều khiển mining; chỉ cột phải khác nhau.

**Mining view giữ nguyên** — quyết định của người dùng. Nó là bằng chứng thuật
toán của đồ án (κ, WPI, deduced, bảng pattern đầy đủ) và đã hoạt động đúng.
Phase này **không** thêm gì vào nó; sửa layout/scroll đã xong ở Phase 1.

**Investor view** thay panel bên phải bằng hai khối mới, dùng hai endpoint của
Phase 3.

Từ vựng thuật toán ẩn mặc định, mỗi dòng có expander nhãn **"Lý do"** mở ra
pattern hỗ trợ kèm WPI và nhãn deduced.

## Requirements

- Toggle chế độ ở header, giữ nguyên dataset/job/kết quả khi đổi chế độ.
- Investor view: click điểm → bảng feature nên đầu tư.
- Investor view: chọn feature → danh sách khu vực + overlay trên bản đồ.
- Khu vực xếp theo peak mặc định; click tiêu đề cột đổi sang tổng điểm.
- Không có endpoint nào bị gọi khi chế độ tương ứng chưa mở.

## Files

| File | Thay đổi |
|---|---|
| `src/App.jsx` | state `mode`, chia nhánh panel phải |
| `src/components/mode-toggle.jsx` | **mới** |
| `src/components/feature-recommendations.jsx` | **mới** — bảng "nên đầu tư gì ở đây" |
| `src/components/area-recommendations.jsx` | **mới** — chọn feature + bảng khu vực |
| `src/components/supporting-patterns.jsx` | **mới** — expander "Lý do", dùng lại `PatternFeatures` |
| `src/components/leaflet-map.jsx` | thêm lớp overlay khu vực |
| `src/config/api.js` | hai hàm gọi mới |

## Steps

1. **`mode-toggle.jsx`** — hai nút phân đoạn ở header cạnh nút Upload CSV
   (`App.jsx:231`). State `mode` (`'investor' | 'mining'`) ở `App.jsx`, mặc định
   `'investor'`. Đổi chế độ **không** đụng tới `datasetId`, `job`, `result`.
2. **`api.js`** — `instanceRecommendations(jobId, feature, number)` và
   `siteRecommendations(jobId, feature, top)`. Truyền `signal` để huỷ được.
3. **`feature-recommendations.jsx`** — cột: Feature, Score, Hỗ trợ (`ready/total`),
   Đã có (saturation). Feature hiếm giữ quy ước màu đỏ hiện có
   (`utils/feature-colors.js` đã bỏ đỏ khỏi palette đúng vì lý do này). Mỗi dòng
   có nút mở `supporting-patterns.jsx`.
   Trạng thái rỗng: chưa chọn điểm → hướng dẫn click bản đồ; đã chọn nhưng chưa
   chạy mining → nhắc chạy mining trước (giống `App.jsx:177` hiện tại).
4. **`supporting-patterns.jsx`** — nhãn nút **"Lý do"**. Mở ra danh sách pattern
   ready: features (dùng lại `PatternFeatures` từ `pattern-list.jsx`), WPI, nhãn
   deduced (dùng lại `PatternWpi`). Không viết lại hai component đó.
5. **`area-recommendations.jsx`** — select chọn feature (nguồn: `result.feature_counts`),
   bảng khu vực: `#`, Vùng, Peak, Tổng, Ô, Đã có. Mặc định xếp theo Peak; click
   tiêu đề `Tổng` đổi thứ tự. Click một dòng → bản đồ bay tới `bbox` của vùng.
6. **Overlay khu vực trên `leaflet-map.jsx`** — nhận prop `regions`; vẽ
   `L.rectangle` theo `bbox` với độ mờ theo `peak_score` đã chuẩn hoá. Dùng
   adapter `toLatLng` của Phase 2 nên chạy đúng ở cả hai CRS. Overlay là một
   layer group riêng, thêm/xoá độc lập, **không** đụng tới marker instance.
7. **Chia nhánh panel phải ở `App.jsx`.** `mining` → `InstanceDetail` +
   `PatternList` như hiện tại. `investor` → `feature-recommendations` +
   `area-recommendations`. Chỉ fetch khi chế độ tương ứng đang mở.
8. **Nhãn trung thực.** Đầu Investor view ghi rõ khuyến nghị dựa trên pattern
   co-location đã khai phá, không phải dự báo kết quả kinh doanh.

## Validation

- Chạy mining Philadelphia ε=80 m (175 pattern). Đổi qua lại hai chế độ: dataset,
  job và kết quả **không** bị nạp lại.
- Investor view, click một nhà hàng: bảng feature hiện ra; mở "Lý do" của dòng
  đầu → các pattern liệt kê **đều chứa** feature của điểm đã chọn và feature ứng viên.
- Đối chiếu chéo với Mining view: pattern trong expander phải xuất hiện trong
  bảng pattern toàn cục với cùng WPI.
- Chọn một feature: khu vực vẽ trên bản đồ; click dòng đầu → bản đồ bay tới đúng
  vùng; xác nhận bằng mắt các feature hỗ trợ có thật quanh đó.
- Đổi thứ tự sang Tổng → thứ hạng đổi (chứng minh hai cột không trùng nhau).
- Lặp lại toàn bộ trên dataset chỉ có X/Y: overlay vẽ đúng vị trí.
- `npm run lint`, `npm run build` sạch.

## Risk / Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Hai chế độ nhân đôi bề mặt phải bảo trì | Dùng chung bản đồ, controls, `PatternFeatures`, `PatternWpi`. Chỉ panel phải khác. |
| Overlay vùng đè lên marker, che dữ liệu | Layer group riêng, độ mờ thấp, vẽ **dưới** marker; có nút bật/tắt. |
| Người xem hiểu nhầm là dự báo kinh doanh | Nhãn ở bước 8 + cột saturation + expander "Lý do" hiện pattern gốc. |

Rollback: chế độ Investor là nhánh cộng thêm; gỡ toggle và bốn component mới đưa
UI về đúng trạng thái sau Phase 2.
