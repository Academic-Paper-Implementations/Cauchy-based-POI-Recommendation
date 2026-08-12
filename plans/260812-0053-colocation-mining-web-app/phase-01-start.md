---
phase: 1
title: "C++ engine — Cauchy, portability, JSON output"
status: complete
priority: P1
effort: "1-2d"
dependencies: []
---

# Phase 1: C++ engine — Cauchy, portability, JSON output

## Overview

Vendor miner C++ tuần tự vào `spatial_web/server/engine/`, thay hai hàm trọng số
cho đúng bài báo, làm nó build được trên Linux, và bổ sung xuất JSON ở mức
instance — thứ bắt buộc để tô sáng bản đồ.

## Requirements

**Functional**
- κ theo định nghĩa Global Pairwise Dispersion: trung bình mọi tỷ lệ tần suất cặp.
- Trọng số Cauchy `ω = 1 + ((r−1)/κ)²`, `r = cnt(τ)/cnt(τ_min)`, trả về `RI = 1/ω`.
- Xuất JSON: pattern, kích thước, WPI khi có, cờ suy diễn, và **danh sách instance
  tham gia theo từng feature**.
- Nhận tham số qua file config; báo lỗi rõ khi thiếu dataset thay vì âm thầm dùng
  mặc định.
- Thoát sạch khi bị kill (không để lại file kết quả dở dang).

**Non-functional**
- Build được bằng `g++ -O2 -std=c++17` trên cả Windows (MSYS2 UCRT) lẫn Linux.
- Không phụ thuộc TBB, không đa luồng — giữ đúng bản tuần tự trong bài báo.

## Architecture

Nguồn vendor từ `D:/01_learning/ai_ml/spatial_data_mining/Maximal-Clique-HashMap-Algorithm`
(bản tuần tự). **Không** dùng `GP-parallel-processing` — đó là thử nghiệm TBB song song khác.

Luồng giữ nguyên: load CSV → đếm feature → κ → neighbor graph → maximal clique
hash-map → hàng đợi ứng viên → `minePCPs`. Chỉ thay công thức và tầng xuất kết quả.

Điểm quan trọng cho tầng trên: `deducePrevalentSubsets` chấp nhận tập con theo
Lemma 2 mà không tính WPI. JSON phải phân biệt rõ pattern **đã tính WPI** và
pattern **suy diễn**, để API không hiển thị WPI sai hoặc lọc lại nhầm.

Định danh: `data_loader.cpp:40-41` đọc `Instance` như `int` rồi dựng lại
`id = Feature + số`. JSON phải xuất đúng cặp `(feature, số)` để tầng API nối
ngược về `business_id`.

## Related Code Files

- Create: `server/engine/` — vendor toàn bộ `src/`, `include/`, `CMakeLists.txt`
- Create: `server/engine/PROVENANCE.md` — nguồn gốc, commit/ngày vendor, các thay đổi
- Modify: `server/engine/src/utils.cpp` — thay `calculateDispersion` + `calcRareIntensity`
- Modify: `server/engine/src/main.cpp` — portable memory, xuất JSON, mã lỗi
- Reference: scratchpad `mcr/utils-paper.cpp` — bản vá đã chạy đúng 647 pattern, dùng làm nền

## Implementation Steps

1. Vendor nguồn C++ vào `server/engine/`, ghi `PROVENANCE.md`.
2. Thay `calculateDispersion` bằng trung bình tỷ lệ cặp (bỏ nhánh log hiện tại):
   `κ = 2/(m(m−1)) · Σ_{i<j} cnt(τ_j)/cnt(τ_i)`, feature sắp tăng dần.
3. Thay `calcRareIntensity` bằng Cauchy: `r = cnt/cnt_min`, `z = (r−1)/κ`,
   `RI = 1/(1+z²)`. Giữ sàn `MIN_INTENSITY` để `1/RI` ở tầng trên không chia cho 0.
4. Bọc đo peak memory trong `#ifdef _WIN32`; nhánh Linux đọc `VmHWM` từ
   `/proc/self/status`. Bỏ `#pragma comment(lib, ...)` (chỉ MSVC hiểu).
5. Thêm xuất JSON cạnh báo cáo text: đường dẫn lấy từ khóa config mới
   `json_output_path`. Nội dung: tham số chạy, κ, số instance, thời gian, đếm
   feature, và mảng pattern gồm `features`, `size`, `wpi` (null nếu suy diễn),
   `deduced` (bool), `participating` (map feature → danh sách số instance).
6. Đổi hành vi khi thiếu dataset: thoát khác 0 kèm thông báo, thay vì rơi về
   `data/sample_data.csv`.
7. Dựng và chạy đối chứng Toronto — xem Success Criteria.
8. **Đo hai mốc** phục vụ Open Questions của plan: (a) Philadelphia ở ε=150 m mất
   bao lâu; (b) tỷ lệ thời gian giữa giai đoạn enumerate clique và giai đoạn mine
   (thêm mốc thời gian tạm vào `main.cpp` nếu cần). Ghi kết quả vào plan.

## Success Criteria

- [x] `g++ -O2 -std=c++17 server/engine/src/*.cpp -Iserver/engine/include` build sạch
- [x] Toronto `version_03.csv`, ε=120 m, minprev=0.2 → κ = **7.8580**, **647 pattern**
- [x] Phân bố size khớp `{2:108, 3:214, 4:202, 5:97, 6:24, 7:2}`
- [x] JSON xuất ra parse được, mỗi pattern có `participating` và cờ `deduced`
- [x] Chạy với dataset không tồn tại → exit khác 0, không âm thầm dùng mặc định
- [x] Đã ghi số đo Philadelphia ε=150 m và tỷ lệ clique/mine vào plan Open Questions

## Risk Assessment

- **Kích thước JSON.** `participating` trên Philadelphia có thể lớn. Tín hiệu:
  file vượt ~50 MB. Phản ứng đã định: xuất `participating` dưới dạng chỉ số
  instance thay vì chuỗi, và nén khi phục vụ; không cắt bớt dữ liệu.
- **Thời gian mine ở ε lớn không chấp nhận được** (đã thấy: >20 phút ở 300 m).
  Tín hiệu: bước 8 cho thấy ε=150 m vẫn quá lâu. Phản ứng đã định (quyết định
  validation 2026-08-12): **giữ 100% instance**, hạ ε mặc định, và dựa vào cache
  đĩa của Phase 2 để lần chạy sau tức thì. `percentage_instances` vẫn phơi ra cho
  người dùng tự chỉnh nhưng mặc định là 1. Không giới hạn kích thước pattern vì
  tính đầy đủ là điểm mạnh của thuật toán trên xuống.
- **Vendor làm lệch bản gốc.** Tín hiệu: repo gốc thay đổi sau này. Phản ứng:
  `PROVENANCE.md` ghi rõ ngày và danh sách thay đổi để đối chiếu lại.
