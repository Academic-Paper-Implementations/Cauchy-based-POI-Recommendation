---
title: "Investor Recommendation Mode"
description: "Tách Investor/Mining view, thêm khuyến nghị feature theo điểm và khuyến nghị khu vực theo feature, thống nhất bản đồ về Leaflet, sửa layout và scroll cho desktop."
status: completed
priority: P1
effort: ""
completed: 2026-08-13
tags: [frontend, leaflet, fastapi, recommendation, desktop]
created: 2026-08-12
---

# Investor Recommendation Mode

## Overview

Mở rộng app từ "trình khám phá thuật toán" thành công cụ có hai chế độ. **Mining
view** giữ nguyên bằng chứng thuật toán hiện có (κ, WPI, deduced, bảng pattern
đầy đủ). **Investor view** trả lời hai câu hỏi của chủ đầu tư: *tại điểm này nên
đầu tư feature nào* và *chọn feature X thì khu vực nào phù hợp*. Cả hai đường bản
đồ (lat/lon và chỉ X/Y) chạy trên một component Leaflet duy nhất.

Hợp đồng và số đo: [brainstorm report](../reports/brainstorm-260812-2314-investor-recommendation.md).
Bối cảnh lỗi frontend: [review report](../reports/review-260812-2258-frontend-review.md).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Panel cuộn trong khung của nó; bảng 1.000+ dòng không kéo dài trang | P1 |
| 2 | Một component bản đồ cho cả hai CRS; gỡ Plotly khỏi bundle | P1 |
| 3 | Click điểm → bảng feature nên đầu tư, có expander "Lý do" | P1 |
| 4 | Chọn feature → danh sách khu vực xếp theo điểm ô cao nhất + overlay trên bản đồ | P1 |
| 5 | Chặn upload có >64 feature riêng biệt, kèm cảnh báo runtime | P2 |
| 6 | Focus indicator, nhãn liên kết, slider có debounce, Vitest | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Layout, scroll và ranh giới lỗi](./phase-01-layout-and-failure-boundaries.md) | Done |
| 2 | [Phase 2: Thống nhất bản đồ Leaflet, gỡ Plotly](./phase-02-unify-leaflet-map.md) | Done |
| 3 | [Phase 3: Backend khuyến nghị](./phase-03-recommendation-backend.md) | Done |
| 4 | [Phase 4: Tách Investor/Mining view](./phase-04-investor-mining-modes.md) | Done |
| 5 | [Phase 5: Tương tác, a11y và kiểm thử](./phase-05-interaction-a11y-tests.md) | Done |

Thực thi: [session report](../reports/cook-260813-0734-investor-recommendation-mode.md).

Phụ thuộc: 1 → 2; 1 → 4; 3 độc lập, **chạy song song được với 2**; 4 phụ thuộc 2 và 3; 5 phụ thuộc 4.

## Decisions

Bốn quyết định người dùng chốt ngày 2026-08-12, sau khi đo:

1. **Hai chế độ**, toggle ở header. Mining view **giữ nguyên**, chỉ nhận sửa
   layout/scroll từ Phase 1 — không thêm tính năng.
2. **Thống nhất Leaflet**, `L.CRS.Simple` cho dữ liệu chỉ có X/Y, gỡ
   `plotly.js` + `react-plotly.js`.
3. **Xếp hạng khu vực theo điểm ô cao nhất (peak)**, bảng hiện cả cột tổng điểm
   và số ô để người dùng tự đổi thứ tự.
4. **Chặn ở upload khi >64 feature riêng biệt.** Lý do gốc không phải bitmask:
   liệt kê clique của miner bùng nổ theo số feature, nên chặn sớm bảo vệ cả miner
   lẫn tầng khuyến nghị.

Từ vựng thuật toán trong Investor view: **ẩn mặc định**, mỗi dòng có expander
nhãn **"Lý do"** mở ra pattern hỗ trợ kèm WPI và nhãn deduced.

## Cost evidence

Đo trên Philadelphia thật (9.928 instance, 20 feature), `scratchpad/bench_area.py`:

| ε | Ô phủ bbox | Ô có instance | Distinct mask | Dilation |
|---|---|---|---|---|
| 60 m | 761.527 | 5.454 | 2.247 | 14 ms |
| 80 m | 428.359 | 4.695 | 2.270 | 11 ms |
| 100 m | 274.150 | 4.171 | 2.211 | 10 ms |

Chấm điểm lưới: 20 ms ở 100 pattern, 89 ms ở 500, 355 ms ở 2.000. Flood-fill
thêm 1–3 ms.

**Đối chiếu với số pattern thật** (Execution Log của plan trước): Philadelphia
ε=80 m ra **175 pattern**, Toronto ε=120 m ra **647**. Số pattern chứa một
feature cụ thể còn nhỏ hơn nữa. Nên chi phí vận hành thực tế nằm ở mốc **20 ms**,
không phải mốc 355 ms. Tiêu chí p95 < 500 ms có biên rất rộng.

`deduced` gần như luôn rỗng trên dữ liệu thật (Toronto: 647/647 pattern có WPI
tính thật), nên nhánh thay `min_prev` cho `wpi: null` là đường hiếm, không phải
rủi ro trung tâm.

## Success Criteria

- [x] Bảng pattern cuộn trong card; chiều cao trang không vượt viewport ở cả hai mode — xác minh trên trình duyệt (Philadelphia 175 pattern, Toronto 647). Bảng phân trang 50 dòng/trang nên không bao giờ có 1.000 dòng cùng lúc; cơ chế cuộn là thứ được xác minh.
- [x] Bản đồ chiếm đủ chiều cao panel ở cả hai mode và cả hai CRS — ảnh chụp Philadelphia (EPSG3857) và Toronto (CRS.Simple)
- [x] `plotly.js` và `react-plotly.js` biến mất khỏi `package.json` và khỏi bundle build — chunk 4.865 kB biến mất, tổng JS 5.253 kB → 400 kB, build 32 s → 4,8 s
- [x] Click điểm trong Investor view → bảng feature xếp hạng có Score / Hỗ trợ / Đã có, expander "Lý do" mở ra pattern hỗ trợ — xác minh trên cả hai dataset
- [x] Chọn feature → danh sách khu vực xếp theo peak, có cột tổng điểm và số ô, vẽ overlay trên bản đồ — xác minh, overlay vẽ dưới marker
- [x] p95 thời gian server cho khuyến nghị khu vực < 500 ms trên Philadelphia ε=80 m — **đo được 10 ms** (Toronto ε=120 m, 647 pattern: 36 ms)
- [x] Upload CSV có >64 feature riêng biệt bị từ chối kèm thông báo nêu lý do runtime — phủ bởi pytest ở tầng `parse_upload`
- [x] Mọi input/select có nhãn liên kết (`htmlFor`/`id`) và quy tắc `:focus-visible` thay cho `ring:` không hợp lệ — xác minh bằng đọc mã, **chưa** xác minh bằng mắt khi tab qua form
- [x] Vitest phủ poll state machine, hai panel khuyến nghị, nhánh CRS — 25 test
- [x] `npm run lint`, `npm run build`, `npm test`, pytest đều xanh — 25 Vitest + 73 pytest

## Open Questions

Không còn. Bốn câu hỏi mở của brainstorm đã được trả lời và ghi ở mục *Decisions*.

<!-- slug: investor-recommendation-mode -->
