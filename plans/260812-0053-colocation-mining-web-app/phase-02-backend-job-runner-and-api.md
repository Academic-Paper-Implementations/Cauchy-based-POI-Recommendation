---
phase: 2
title: "Backend job runner and API"
status: complete
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 2: Backend job runner and API

## Overview

Gỡ toàn bộ code POI recommendation, thay bằng tầng chạy miner: đăng ký dataset,
chuyển sang định dạng CSV của miner kèm bảng ánh xạ định danh, chạy job có tiến
trình và hủy được, rồi phục vụ kết quả cho frontend.

## Requirements

**Functional**
- Liệt kê dataset đóng gói sẵn kèm siêu dữ liệu (số instance, feature, có lat/lon hay không).
- Chạy mining bất đồng bộ: tạo job, xem trạng thái/tiến trình, hủy, lấy kết quả.
- Gán nhãn rare theo phân vị (mặc định 25% = Q1) + sàn `rare_min_count` (mặc định 30);
  tính ở tầng API từ số đếm feature, đổi tức thì, **không** mine lại.
- Truy vấn theo instance: trả về các pattern instance đó tham gia, kèm hàng xóm
  trong bán kính ε cùng tham gia pattern đó.
- Phục vụ SPA đã build cùng origin (giữ mô hình hiện có).

**Non-functional**
- Ghi file config cho miner **không BOM**, và kiểm chứng lại `Dataset Path` trong
  output trước khi tin kết quả.
- Job bị hủy phải kill tiến trình con, không để lại tiến trình mồ côi.
- Chỉ một job mining chạy tại một thời điểm; job mới thay job cũ sau khi hủy sạch.
- **Cache kết quả trên đĩa** theo khóa `(dataset, ε, minprev, sample_pct)`. Yêu cầu
  trùng khóa trả về ngay, không chạy lại miner, và sống qua restart server — bắt
  buộc vì một lần mine có thể mất hàng chục phút. Cần lệnh/endpoint dọn cache.

## Architecture

```
POST /api/jobs           -> tạo job mining (dataset_id, eps_m, min_prev, sample_pct)
GET  /api/jobs/{id}      -> trạng thái: queued|running|done|cancelled|failed + tiến trình
DELETE /api/jobs/{id}    -> hủy, kill tiến trình con
GET  /api/jobs/{id}/result?rare_percentile=&rare_min_count=
                         -> pattern + nhãn rare (gán lại tức thì theo tham số)
GET  /api/datasets       -> danh sách dataset đóng gói sẵn
GET  /api/datasets/{id}/instances -> điểm để vẽ bản đồ (lat/lon hoặc x/y)
GET  /api/jobs/{id}/instances/{feature}/{number}
                         -> pattern mà instance tham gia + hàng xóm đồng tham gia
```

**Ánh xạ định danh.** Miner đọc `Instance` như `int` và dựng lại `id = Feature + số`
(`data_loader.cpp:40-41`). Khi sinh CSV đầu vào, backend giữ bảng
`(feature, số) → {business_id, lat, lon, thuộc tính}` để nối ngược kết quả về
điểm trên bản đồ. Bảng này thuộc về dataset đã chuẩn bị, không phải job.

**Truy vấn hàng xóm.** Không cần miner xuất neighbor graph. Với instance được
click, backend tự quét toạ độ trong bán kính ε (dataset chỉ ~10k điểm nên quét
tuyến tính là đủ; dùng lưới ô vuông nếu cần) rồi giao với tập `participating` của
từng pattern. Cách này giữ JSON của miner nhỏ.

**Tiến trình.** Miner không báo tiến trình theo phần trăm. Job chỉ báo giai đoạn
và thời gian trôi qua, suy từ stdout của miner và mốc thời gian; không bịa phần
trăm giả.

## Related Code Files

- Delete: `server/recommender.py`
- Modify: `server/main.py` — bỏ mọi endpoint `/api/recommend*`, `/api/businesses`,
  `/api/pairs/top`; giữ mô hình phục vụ SPA cùng origin (`server/main.py:263`)
- Create: `server/datasets.py` — đăng ký dataset, chuyển đổi CSV, bảng ánh xạ
- Create: `server/mining_job.py` — vòng đời job, subprocess, hủy
- Create: `server/rare_labeling.py` — ngưỡng phân vị + sàn
- Create: `server/pattern_query.py` — truy vấn theo instance, tìm hàng xóm
- Modify: `server/requirements.txt` — thêm phụ thuộc nếu cần

## Implementation Steps

1. Xoá `recommender.py` và mọi endpoint POI trong `main.py`; giữ `/api/health`.
2. `datasets.py`: đăng ký **Philadelphia là dataset đóng gói sẵn duy nhất**
   (`spatial_instances.csv`, có lat/lon + X/Y). Sinh CSV chuẩn miner
   (`Feature, Instance, LocX, LocY`, `Instance` là số nguyên) + bảng ánh xạ, cache
   theo dataset để không sinh lại mỗi lần.
   Toronto `version_03.csv` chỉ đăng ký khi phát hiện file ở repo anh em, dùng làm
   fixture kiểm thử nhánh chỉ-có-X/Y; không sao chép vào image (xem Phase 4).
3. `mining_job.py`: tra cache đĩa theo `(dataset, ε, minprev, sample_pct)` trước;
   trúng thì trả kết quả ngay. Trượt thì ghi config tạm không BOM, chạy
   `server/engine` binary bằng `subprocess`, theo dõi trạng thái, hủy bằng
   terminate rồi kill nếu ngoan cố. Đọc JSON kết quả khi xong; đối chiếu
   `Dataset Path` trong output với đường dẫn đã yêu cầu, sai thì đánh dấu job
   `failed`. Chỉ ghi cache khi job kết thúc thành công — job bị hủy không được
   để lại cache dở.
4. `rare_labeling.py`: tính phân vị trên số đếm feature, áp sàn, trả về tập rare.
   Thuần hàm, không đụng job.
5. `pattern_query.py`: với `(feature, số)`, lọc pattern có instance đó trong
   `participating`; với mỗi pattern, tìm instance của các feature còn lại vừa nằm
   trong `participating` vừa trong bán kính ε của điểm được click.
6. Nối các endpoint trong `main.py`; giữ nguyên phần mount SPA ở cuối.
7. Viết kiểm thử: chuyển đổi dataset giữ đúng ánh xạ; config sinh ra không BOM;
   hủy job không để lại tiến trình con; gán nhãn rare khớp Q1=193.75 trên Philadelphia.

## Success Criteria

- [x] Không còn tham chiếu nào tới POI recommendation trong `server/`
- [x] `POST /api/jobs` với Toronto ε=120 m, minprev=0.2 → job xong, trả về 647 pattern
- [x] Hủy job đang chạy → tiến trình con biến mất khỏi bảng tiến trình OS
- [x] Đổi `rare_percentile` trên cùng một job → nhãn đổi, không chạy lại miner
- [x] Query instance trả về pattern kèm hàng xóm đồng tham gia, mọi id nối được
      về `business_id` trên Philadelphia
- [x] Config sinh ra không có BOM; dataset sai → job `failed` chứ không im lặng
- [x] Chạy lại cùng bộ tham số → trả về từ cache, không sinh tiến trình miner mới
- [x] Hủy job giữa chừng → không để lại mục cache nào cho bộ tham số đó

## Risk Assessment

- **Tiến trình con mồ côi.** Tín hiệu: `main.exe`/binary còn sống sau khi hủy hoặc
  sau khi tắt server. Phản ứng: theo dõi PID trong job, kill ở cả đường hủy lẫn
  shutdown hook; kiểm thử bắt buộc phủ trường hợp này.
- **Rơi về dataset mặc định trong im lặng.** Đã gặp thật khi config dính BOM.
  Phản ứng: đối chiếu `Dataset Path` trong output, coi lệch là lỗi job.
- **Một job tại một thời điểm là quá hạn chế** nếu sau này cần nhiều người dùng.
  Tín hiệu: có yêu cầu chạy song song. Phản ứng: chuyển sang hàng đợi có giới hạn;
  chưa làm bây giờ vì phạm vi là demo luận văn.
