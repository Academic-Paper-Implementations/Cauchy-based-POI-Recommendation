---
title: "Colocation Mining Web App"
description: "Refactor spatial_web into a co-location mining app driven by the thesis C++ clique miner with Cauchy WPI, with an OpenStreetMap explorer."
status: complete
priority: P1
effort: ""
tags: [thesis, cpp, fastapi, react, leaflet]
created: 2026-08-12
---

# Colocation Mining Web App

## Overview

Chuyển `spatial_web` từ demo POI recommendation thành web app khai phá
co-location: nạp dataset không gian, chạy **miner clique-based + Cauchy WPI thật
bằng C++**, hiển thị prevalent pattern với rare feature làm nổi bật, và cho phép
click một instance trên bản đồ OpenStreetMap để xem nó tham gia pattern nào cùng
những hàng xóm nào.

Hợp đồng và bằng chứng thực nghiệm: [brainstorm report](../reports/brainstorm-260811-2341-colocation-mining-webapp.md).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Engine C++ đúng bài báo (κ trung bình tỷ lệ, Cauchy WPI), build được trên Linux, xuất JSON instance-level | P1 |
| 2 | Mining chạy như job có tiến trình và hủy được, không chặn UI | P1 |
| 3 | Bản đồ OSM: click instance → pattern tham gia + tô sáng hàng xóm đồng tham gia | P1 |
| 4 | Bảng pattern hiện số instance từng feature, số của rare feature tô đỏ; ngưỡng chỉnh tức thì bằng phân vị | P2 |
| 5 | Upload CSV của người dùng | P2 |
| 6 | Một Docker image, một cổng | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: C++ engine — Cauchy, portability, JSON output](./phase-01-start.md) | Complete |
| 2 | [Phase 2: Backend job runner and API](./phase-02-backend-job-runner-and-api.md) | Complete |
| 3 | [Phase 3: Frontend map and pattern explorer](./phase-03-frontend-map-and-pattern-explorer.md) | Complete |
| 4 | [Phase 4: CSV upload and packaging](./phase-04-csv-upload-and-packaging.md) | Complete |

Phụ thuộc: 1 → 2 → 3; 4 phụ thuộc 2 và 3.

## Correction to the accepted contract

Hợp đồng brainstorm giả định ba tầng chi phí điều khiển, với **minprev cập nhật
tức thì**. Soát `miner.cpp` cho thấy giả định này **sai**:

`minePCPs` chấp nhận tập con qua `deducePrevalentSubsets` (miner.cpp:45-48) theo
Lemma 2 — subset chứa `f_min` của một pattern prevalent thì cũng prevalent — và
**không tính WPI cho chúng**, đồng thời loại chúng khỏi hàng đợi duyệt
(miner.cpp:50-56). Nên trong kết quả có nhiều pattern không mang giá trị WPI, và
đổi minprev làm đổi cả tập chấp nhận lẫn đường duyệt.

Kết luận: **minprev là tham số job, không phải bộ lọc hậu kỳ.**

| Điều khiển | Chi phí thực tế |
|---|---|
| Ngưỡng rare (phân vị) | Tức thì — chỉ gán nhãn ở tầng hiển thị |
| minprev | **Mine lại** (sửa so với hợp đồng) |
| ε | Mine lại |

Không cố lách bằng cách mine ở minprev thấp rồi lọc lên: các pattern suy diễn
không có WPI nên lọc lại sẽ sai. Cũng không sửa C++ để tính WPI cho mọi tập con —
làm vậy là vứt bỏ chính tối ưu hoá đang được tuyên bố là đóng góp.

Hệ quả UI: một nút "Chạy khai phá" nhận cả ε lẫn minprev. Tối ưu khả dĩ về sau là
cache hash-map clique theo ε (clique chỉ phụ thuộc ε), nhưng chỉ đáng làm nếu đo
được giai đoạn enumerate clique chiếm phần lớn thời gian — xem Phase 1 bước đo.

## Success Criteria

- [x] Toronto `version_03.csv`, ε=120 m, minprev=0.2 → κ=7.8580 và **647 pattern**
- [x] Philadelphia hiển thị trên bản đồ OSM; click một điểm → hiện pattern nó tham
      gia và tô sáng hàng xóm đồng tham gia
- [x] Job mining báo tiến trình và hủy được giữa chừng
- [x] Chạy lại cùng bộ tham số → trả từ cache đĩa, không mine lại
- [x] Bảng pattern hiện số instance từng feature; số của rare feature tô đỏ
- [x] Ngưỡng rare đổi tức thì, không mine lại
- [x] Upload CSV có lat/lon → lên bản đồ; chỉ có X/Y → scatter
- [x] `docker build` + `docker run -p 8000:8000` phục vụ API lẫn SPA trên một cổng
- [x] Không còn code POI recommendation trong repo

## Validation Log

### Session 1 — 2026-08-12

**Verification Results**
- Claims checked: 28 (22 đường dẫn file, 6 tham chiếu dòng)
- Verified: 28 | Failed: 0 | Unverified: 0
- Tier: Standard (4 phase)
- Đã xác nhận: `main.py:263` mount SPA, `miner.cpp:45-48` + `50-56`
  deduce/filter subset, `data_loader.cpp:40-41` Instance là int,
  `main.cpp:20-23` phụ thuộc Windows API, `index.css:26` `.card`

**Decisions**
1. **Vendor C++**: chép vào `server/engine/`, kèm `PROVENANCE.md`. Tự chứa, Docker
   build một lệnh. Chấp nhận code bị nhân bản so với repo thuật toán gốc.
2. **Lưu kết quả**: cache trên đĩa theo `(dataset, ε, minprev, sample_pct)`, sống
   qua restart. Bắt buộc vì một lần mine có thể mất hàng chục phút.
3. **Khi mining chậm**: giữ **100% instance**, hạ ε mặc định, dựa vào cache.
   `percentage_instances` vẫn cho chỉnh nhưng mặc định 1. Không giới hạn kích
   thước pattern.
4. **Rare feature trong UI**: **không** tô sáng trên bản đồ. Bảng pattern thêm cột
   **số instance của từng feature**, số của rare feature **tô đỏ**. Không bộ lọc,
   không sắp xếp theo rare. Lý do người dùng nêu: nhìn `T: 28` đỏ cạnh `A: 5649`
   là hiểu ngay, không cần thêm điều khiển.

**Propagation**
- Phase 1: sửa mục giảm rủi ro — bỏ "mặc định lấy mẫu <1", thay bằng giữ đầy đủ
  + dựa vào cache (mâu thuẫn với Decision 3 nếu giữ nguyên)
- Phase 2: thêm yêu cầu cache đĩa, bước tra cache trước khi chạy, hai tiêu chí
  nghiệm thu về cache; giới hạn dataset đóng gói còn Philadelphia
- Phase 3: bỏ tô sáng rare trên bản đồ và bộ lọc/sắp xếp; thêm cột số instance
  từng feature với rare tô đỏ; sửa mục rủi ro bảng dài
- Phase 4: thêm ghi chú cache cần volume để không mất khi container khởi động lại

### Whole-Plan Consistency Sweep

Đã đọc lại `plan.md` và cả 4 phase sau khi lan quyết định.

- "Ba tầng chi phí điều khiển" trong hợp đồng brainstorm đã được thay bằng hai
  tầng ở mục *Correction*; Phase 3 mô tả đúng một nút "Chạy khai phá" nhận cả ε
  lẫn minprev. Không còn chỗ nào nói minprev lọc tức thì.
- Toronto: `plan.md` Open Questions, Phase 2 bước 2, Phase 3 tiêu chí nghiệm thu
  đều thống nhất là **fixture kiểm chứng, không đóng gói vào image**. Phase 1 vẫn
  dùng Toronto để đối chứng 647 pattern — đúng vai trò fixture.
- `percentage_instances`: Phase 1 (mặc định 1) và Phase 3 (có slider) không mâu
  thuẫn — phơi ra cho người dùng nhưng mặc định đầy đủ.
- Nhãn rare vẫn do Phase 2 `rare_labeling.py` sinh ra; Phase 3 chỉ đổi cách hiển
  thị. Không phần nào mồ côi.

Không còn mâu thuẫn chưa giải quyết.

## Open Questions

Cả hai câu hỏi đã đo xong trong Phase 1 — không còn câu hỏi mở.

**1. Thời gian chạy Philadelphia — đã đo.** 9.928 instance, minprev=0.2, một lõi:

| ε | Tổng | Clique | Mine | Pattern |
|---|---|---|---|---|
| 40 m | 0,7 s | 0,17 s | 0,43 s | 27 |
| 60 m | 2,2 s | 0,26 s | 1,89 s | 80 |
| 80 m | 7,3 s | 0,84 s | 6,38 s | 175 |
| 100 m | 62,9 s | — | — | — |
| 120 m | 185,8 s | — | — | — |
| 150 m | **>20 phút, đã hủy** — vẫn ở giai đoạn enumerate clique | — | — | — |

Quyết định: **ε mặc định = 80 m**, `percentage_instances` mặc định **1.0** (giữ
đủ 100% instance đúng như Decision 3). ε=150 m không dùng làm mặc định được.

**2. Tỷ lệ clique/mine — đã đo, và tỷ lệ này không ổn định.**

| Chạy | Clique | Mine |
|---|---|---|
| Philadelphia ε=40–80 m | 11–26 % | 74–87 % |
| Toronto ε=120 m | 52 % (20,6 s) | 47 % (18,8 s) |
| Philadelphia ε=150 m | ~100 % (nổ tổ hợp) | chưa tới |

Kết luận: **không cache clique theo ε.** Ở ε nhỏ, mine mới là phần tốn; ở ε lớn,
clique nổ tổ hợp nên lần chạy đó vô dụng dù có cache hay không. Cache kết quả
theo đĩa của Phase 2 đã phủ đúng trường hợp cần (chạy lại cùng tham số → 0,03 s).

Đã giải quyết: **chỉ Philadelphia là dataset đóng gói sẵn.** Toronto
`version_03.csv` chỉ dùng làm **fixture kiểm chứng** (κ=7.8580, 647 pattern) trong
Phase 1 và để kiểm thử nhánh scatter; nó nằm ở repo anh em, không sao chép vào
Docker image.

## Execution Log — 2026-08-12

**Kết quả đo và kiểm chứng**

- Engine build sạch `g++ -O2 -std=c++17 -Wall -Wextra`; Toronto ε=120/minprev=0,2
  → κ=7,857958, 647 pattern, phân bố size `{2:108, 3:214, 4:202, 5:97, 6:24, 7:2}`
  — khớp fixture từng con số.
- Qua API: cùng bộ tham số Toronto trả đúng 647 pattern trong 44 s; chạy lại →
  0,03 s từ cache đĩa.
- Hủy job giữa chừng: `colocation_miner.exe` biến mất khỏi bảng tiến trình OS,
  không có mục cache nào để lại, `/result` trả 409.
- Q1 Philadelphia = 193,75 → 5 feature rare, đúng như hợp đồng.
- 50 test backend xanh; `npm run lint` và `npm run build` sạch.
- UI kiểm chứng bằng trình duyệt thật: bản đồ OSM vẽ 9.928 điểm, click một điểm →
  panel hiện pattern + hàng xóm đồng tham gia được tô sáng trong vòng ε; Toronto
  (không lat/lon) rơi đúng sang scatter.

**Phát hiện ngoài dự kiến**

1. **`deduced` gần như luôn rỗng.** Trên Toronto, cả 647 pattern đều có WPI tính
   thật (`deduced = 0`). Pattern được suy diễn theo Lemma 2 hầu như luôn được
   hàng đợi duyệt tới bằng đường khác và tính WPI riêng. Cờ `deduced` và `wpi:
   null` vẫn được xuất và UI vẫn hiển thị dấu "deduced", nhưng thực tế nó hiếm.
   Điều này **không** làm hỏng mục *Correction*: minprev vẫn đổi cả tập chấp nhận
   lẫn đường duyệt, nên vẫn phải mine lại.
2. **Giai đoạn export `participating` rất rẻ** — 0,48 s trên Toronto (1,2 % tổng),
   0,04 s trên Philadelphia ε=80 m. Rủi ro "JSON quá lớn" của Phase 1 không xảy
   ra: JSON Toronto parse được bình thường, `participating` xuất dạng số nguyên.
3. **Palette feature từng có màu đỏ**, trùng với màu dành riêng cho số của rare
   feature. Đã bỏ đỏ khỏi palette (`src/utils/feature-colors.js`).
4. **Vòng ε nhỏ hơn một pixel** ở mức zoom toàn thành phố, nên click điểm xong
   không thấy gì. Bản đồ nay tự căn về instance được chọn ở zoom ≥17.
5. **Hai lỗi tự soát ra và đã sửa** (tự review, không spawn subagent — phiên này
   cấm gọi agent):
   - `onSelect` đổi định danh mỗi lần poll job (1 s/lần) → dựng lại ~10k marker
     và `fitBounds` mỗi giây, giành quyền zoom/pan với người dùng. Đã cố định
     bằng ref (`src/App.jsx`).
   - Hai request `POST /api/jobs` đến cùng lúc đều `cancel_current()` rồi đều
     khởi động job → tiến trình miner đầu tiên không còn ai theo dõi, thành mồ
     côi chạy hàng phút. Đã bọc `submit()` bằng khoá riêng, có test đồng thời.
6. **Đã bác một lo ngại bằng số đo**: cân nhắc cache kết quả đã parse trong bộ
   nhớ vì `/result` đọc lại JSON mỗi lần kéo slider rare. Đo thật: JSON Toronto
   4,3 MB parse hết **58 ms**. Không đáng thêm tầng cache.

**Chệch khỏi kế hoạch (có chủ ý)**

- **Xoá thêm code chết ngoài danh sách Phase 3**: `DeltaConfiguration.jsx`,
  `GaussianKernelVisualization.jsx`, `PatternAnalysis.jsx`,
  `PatternComparison.jsx`, `contexts/DataContext.jsx`, `utils/spatialAnalysis.js`,
  `App.css`. Đây là bản khai phá co-location **thứ hai viết bằng JavaScript**;
  giữ lại thì repo có hai engine mâu thuẫn nhau.
- **Dùng Leaflet trực tiếp, không dùng `react-leaflet`** (đã gỡ khỏi
  `package.json`): 10k marker được tạo một lần rồi chỉ đổi style, không dựng lại
  layer mỗi lần tô sáng.
- **Upload một bước thay vì hai**: preview + chọn cột làm ở trình duyệt bằng
  `papaparse` (đã có sẵn), rồi gửi file kèm ánh xạ trong một request. Giới hạn
  dung lượng và số instance vẫn chặn ở server.
- **`report_writer.{h,cpp}` là file C++ mới** (Phase 1 chỉ nói sửa `main.cpp`):
  tách phần đo bộ nhớ theo nền tảng, báo cáo text và JSON ra khỏi driver.
- **Giết cả cây tiến trình** khi hủy job (`taskkill /T` trên Windows, `killpg`
  trên POSIX) thay vì chỉ `terminate()` tiến trình con trực tiếp.
- **Plotly nạp lười**: bundle chính giảm từ 5,3 MB xuống 386 kB, Plotly chỉ tải
  khi mở dataset không có lat/lon.

**Docker — đã kiểm chứng (bổ sung 2026-08-12, sau khi bật hypervisor)**

Ban đầu không chạy được: `hypervisorlaunchtype` trong BCD bị đặt `Off` nên
hypervisor không khởi động, kéo theo WSL2 và Docker Desktop chết — dù
`VirtualMachinePlatform`, feature WSL và VT-x trong BIOS **đều đã bật sẵn**
(thông báo lỗi của WSL đổ tại VM Platform là gây hiểu nhầm). Sau khi đặt
`bcdedit /set hypervisorlaunchtype Auto` và reboot:

- `docker build -t colocation-app .` — thành công, ba stage.
- `docker run -p 8000:8000 -v colocation-cache:/app/server/runtime` — SPA
  (`<title>Co-location Pattern Explorer`) và `/api/health` cùng phục vụ trên
  cổng 8000; `miner_available: true`, binary tại
  `/app/server/engine/bin/colocation_miner`.
- **Engine C++ chạy thật trên Linux lần đầu**: Philadelphia ε=60 m → 80 pattern,
  κ=3,4626 — **trùng khớp con số chạy trên Windows**.
- `peak_memory_mb = 34` (khác 0) → nhánh `/proc/self/status` VmHWM **hoạt động
  đúng**, không phải chỉ compile được.
- Chỉ Philadelphia có trong image; Toronto vắng mặt đúng như thiết kế.
- Cache trong container: chạy lại cùng tham số → `from_cache=true`, 0,02 s.
- Truy vấn instance trong container trả về pattern kèm hàng xóm và khoảng cách.
- Chậm hơn máy thật một chút như dự đoán: 3,1 s trong container so với 2,2 s
  trên Windows ở cùng ε=60 m.

<!-- slug: colocation-mining-web-app -->
