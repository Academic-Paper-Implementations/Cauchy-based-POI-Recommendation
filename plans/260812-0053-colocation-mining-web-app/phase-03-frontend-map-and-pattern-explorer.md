---
phase: 3
title: "Frontend map and pattern explorer"
status: complete
priority: P1
effort: "2d"
dependencies: [2]
---

# Phase 3: Frontend map and pattern explorer

## Overview

Thay giao diện POI bằng một màn hình duy nhất: bản đồ OpenStreetMap, bảng điều
khiển tham số, tiến trình job, danh sách pattern có làm nổi bật rare feature, và
tương tác click-để-giải-thích trên bản đồ.

## Requirements

**Functional**
- Chọn dataset; vẽ toàn bộ instance, tô màu theo feature.
- Dataset có lat/lon → nền OpenStreetMap; chỉ có X/Y → scatter Plotly như hiện tại.
- Điều khiển ε, minprev, tỷ lệ lấy mẫu → nút "Chạy khai phá" (một job).
- Slider ngưỡng rare (phân vị) đổi nhãn **tức thì**, không chạy lại job.
- Job đang chạy: hiện giai đoạn + thời gian trôi, có nút Hủy.
- Bảng pattern: feature, kích thước, WPI (hoặc dấu "suy diễn"), và **số instance
  của từng feature**; số của rare feature **tô đỏ**. Người xem thấy ngay
  `T: 28` đỏ cạnh `A: 5649` nên hiểu luôn vì sao feature đó hiếm, không cần nhãn
  riêng. Áp dụng cho cả bảng pattern chính lẫn panel pattern của instance.
- **Không** tô sáng rare feature trên bản đồ; không bộ lọc, không sắp xếp theo rare.
- Click instance trên bản đồ → panel liệt kê pattern nó tham gia; chọn một pattern
  → tô sáng các hàng xóm đồng tham gia và vẽ vòng bán kính ε.

**Non-functional**
- Giao diện tối, dùng lại `.card` trong `src/index.css`.
- Không đứng hình khi vẽ ~10k điểm.

## Architecture

Một route, ba vùng: bản đồ (chính), thanh điều khiển + tiến trình (trái/trên),
panel pattern và chi tiết instance (phải).

Bản đồ dùng **Leaflet + OpenStreetMap tiles**, marker cụm nhẹ hoặc `CircleMarker`
cho ~10k điểm. Giữ Plotly cho dataset chỉ có X/Y — không ép mọi thứ vào một
thành phần.

Trạng thái: `datasetId`, `jobId`, `jobStatus`, `patterns`, `rarePercentile`,
`selectedInstance`, `selectedPattern`. Slider rare gọi lại
`/api/jobs/{id}/result` với tham số mới — rẻ, không đụng miner.

Phân biệt hiển thị **WPI đã tính** và **pattern suy diễn**: pattern suy diễn không
có WPI, phải hiện dấu riêng chứ không hiện 0 hay để trống gây hiểu nhầm.

## Related Code Files

- Delete: `src/components/PoiRecommender.jsx`, `src/components/CauchyVsGaussian.jsx`
- Modify: `src/App.jsx` — bỏ ba chế độ, còn một màn hình
- Modify: `src/config/api.js` — thay hàm POI bằng jobs/datasets/query
- Create: `src/components/mining-map.jsx` — bản đồ Leaflet + lớp tô sáng
- Create: `src/components/mining-controls.jsx` — ε, minprev, lấy mẫu, chạy/hủy
- Create: `src/components/job-progress.jsx` — giai đoạn, thời gian, nút hủy
- Create: `src/components/pattern-list.jsx` — danh sách + nổi bật rare
- Create: `src/components/instance-detail.jsx` — pattern của instance + hàng xóm
- Keep: `src/components/SpatialMap.jsx` — nhánh scatter cho dataset không lat/lon
- Modify: `package.json` — thêm `leaflet`, `react-leaflet`

## Implementation Steps

1. Gỡ `PoiRecommender.jsx`, `CauchyVsGaussian.jsx`; rút `App.jsx` còn một màn hình.
2. Viết lại `src/config/api.js` theo API Phase 2.
3. `mining-map.jsx`: Leaflet + tile OSM, vẽ instance theo feature, xử lý click điểm.
4. `mining-controls.jsx` + `job-progress.jsx`: tạo job, hỏi trạng thái định kỳ,
   hủy. Khoá nút chạy khi đang có job.
5. `pattern-list.jsx`: bảng pattern kèm cột số instance từng feature, tô đỏ số của
   rare feature; slider phân vị gọi lại result để đổi tập rare. Đánh dấu rõ pattern
   suy diễn (không có WPI).
6. `instance-detail.jsx`: gọi endpoint truy vấn instance, liệt kê pattern; chọn
   pattern → phát tín hiệu tô sáng lên bản đồ kèm vòng bán kính ε.
7. Kiểm tra hiệu năng vẽ với Philadelphia 9.928 điểm; chuyển sang canvas renderer
   của Leaflet nếu DOM chậm.

## Success Criteria

- [x] Chọn Philadelphia → thấy toàn bộ điểm trên nền phố OSM, màu theo feature
- [x] Chạy job, thấy tiến trình, bấm Hủy → job dừng, UI trở về trạng thái rảnh
- [x] Bảng pattern hiện số instance từng feature; số của rare feature tô đỏ
- [x] Kéo slider ngưỡng rare → tập số tô đỏ đổi ngay, không phát sinh job mới
- [x] Click một nhà hàng → panel hiện pattern nó tham gia; chọn pattern → hàng xóm
      đồng tham gia được tô sáng và vòng ε hiện ra
- [x] Dataset chỉ có X/Y (fixture Toronto khi có, hoặc CSV upload ở Phase 4) →
      hiển thị scatter, các chức năng còn lại hoạt động
- [x] Pattern suy diễn hiển thị dấu riêng, không hiện WPI sai

## Risk Assessment

- **Vẽ 10k marker DOM gây giật.** Tín hiệu: kéo/zoom trễ thấy rõ. Phản ứng:
  `preferCanvas` của Leaflet, rồi mới tính cụm; không giảm số điểm hiển thị vì
  bản đồ đầy đủ là giá trị chính.
- **Tile OSM cần mạng.** Tín hiệu: demo offline mất nền bản đồ. Phản ứng: nêu rõ
  trong README rằng nền bản đồ cần internet; scatter vẫn chạy offline. Không nhúng
  tile để tránh vấn đề bản quyền và dung lượng.
- **Bảng pattern quá dài** (Toronto 647 pattern). Tín hiệu: cuộn vô tận, khó chỉ ra
  pattern hiếm khi trình bày. Phản ứng đã định: sắp mặc định theo WPI giảm dần và
  phân trang/cuộn ảo. Không thêm bộ lọc rare — người dùng đã chốt là cột số instance
  tô đỏ là đủ; chỉ mở lại nếu thực tế trình bày cho thấy không đủ.
