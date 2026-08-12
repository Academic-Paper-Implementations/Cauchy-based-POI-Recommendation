---
phase: 4
title: "CSV upload and packaging"
status: complete
priority: P2
effort: "1d"
dependencies: [2, 3]
---

# Phase 4: CSV upload and packaging

## Overview

Cho người dùng nạp dataset không gian của riêng họ, và đóng gói toàn bộ thành một
Docker image phục vụ API lẫn SPA trên một cổng.

## Requirements

**Functional**
- Upload CSV, xem trước, ánh xạ cột vào `feature`, `instance`, `x`/`lon`, `y`/`lat`.
- Có lat/lon → chiếu sang mét để miner tính khoảng cách Euclid đúng, đồng thời giữ
  lat/lon để vẽ bản đồ. Chỉ có X/Y → dùng thẳng, hiển thị scatter.
- Dataset upload dùng được với đúng luồng job như dataset đóng gói sẵn.

**Non-functional**
- Một image, một cổng 8000, không CORS.
- **Cache kết quả mining (Phase 2) phải nằm trên volume**, nếu không mọi lần chạy
  đã tốn hàng chục phút sẽ mất khi container khởi động lại. Ghi rõ trong README
  lệnh `docker run` kèm `-v` cho thư mục cache.
- Giới hạn kích thước file và số instance; báo lỗi rõ khi vượt.
- Dataset upload chỉ sống trong phiên/thư mục tạm, không lẫn vào dataset đóng gói sẵn.

## Architecture

**Phép chiếu.** Miner tính khoảng cách Euclid trên `LocX/LocY`, nên lat/lon phải
đổi sang mét. Dùng phép chiếu phẳng cục bộ quanh tâm dataset
(`x = R·(lon−lon₀)·cos(lat₀)`, `y = R·(lat−lat₀)`) — sai số không đáng kể ở quy mô
một thành phố và không thêm phụ thuộc. Ghi rõ giới hạn này trong README.

Cách này khớp với dữ liệu Philadelphia sẵn có: file đã mang cả lat/lon lẫn X/Y mét,
dùng để đối chiếu phép chiếu có đúng không.

**Docker.** Thêm stage build C++ trước stage runtime:

```
node:20-alpine     -> npm ci && npm run build           -> dist/
gcc/g++ (debian)   -> g++ -O2 -std=c++17 server/engine  -> miner binary
python:3.12-slim   -> pip install -r requirements.txt
                      copy dist/, server/, miner binary
                      uvicorn trên cổng 8000
```

## Related Code Files

- Modify: `src/components/DataUpload.jsx` — dùng lại phần đọc/preview CSV, đổi
  đích đến sang API upload
- Create: `server/upload.py` — nhận file, ánh xạ cột, chiếu toạ độ, đăng ký dataset tạm
- Modify: `server/datasets.py` — cho phép dataset tạm bên cạnh dataset đóng gói sẵn
- Modify: `Dockerfile` — thêm stage build C++
- Modify: `.dockerignore` — loại `node_modules`, `dist`, dữ liệu tạm
- Modify: `README.md` — viết lại toàn bộ theo sản phẩm mới
- Delete: `README_DEMO.md` — nội dung POI đã lỗi thời
- Modify: `package.json` — bỏ script không còn dùng nếu có

## Implementation Steps

1. `server/upload.py`: nhận multipart, đọc header, trả về preview để ánh xạ cột.
2. Chuyển đổi + chiếu toạ độ, sinh CSV chuẩn miner và bảng ánh xạ như Phase 2.
   Kiểm chứng phép chiếu bằng Philadelphia: so X/Y tự tính với X/Y có sẵn trong file.
3. Nối dataset tạm vào `datasets.py` để luồng job không phải biết nguồn gốc.
4. Sửa `DataUpload.jsx` trỏ về API mới, giữ phần preview và ánh xạ cột.
5. Viết lại `Dockerfile` ba stage; kiểm tra binary chạy được trong image Linux
   (đây là lần đầu code C++ rời Windows — xác nhận nhánh `/proc/self/status`).
6. Viết lại `README.md`: chạy dev, build, Docker, dataset, giới hạn đã biết.
   Xoá `README_DEMO.md`.
7. Chạy thử toàn tuyến từ image sạch: upload → khai phá → click bản đồ.

## Success Criteria

- [x] Upload CSV có lat/lon → lên bản đồ OSM và khai phá được
- [x] Upload CSV chỉ có X/Y → scatter và khai phá được
- [x] X/Y tự chiếu từ lat/lon Philadelphia khớp cột X/Y có sẵn trong sai số chấp
      nhận được — sai số khoảng cách từng cặp **< 1 %** (test
      `test_projection_preserves_distances_of_the_philadelphia_reference`)
- [x] `docker build -t colocation-app .` thành công từ cây nguồn sạch
- [x] `docker run -p 8000:8000` phục vụ cả SPA lẫn API; job mining chạy trong
      container — Philadelphia ε=60 m → 80 pattern, κ=3,4626 (khớp Windows),
      `peak_memory_mb=34` chứng minh nhánh `/proc/self/status` chạy đúng
- [x] File quá lớn / thiếu cột → thông báo lỗi rõ, không sập server
- [x] README phản ánh đúng sản phẩm; không còn dấu vết POI recommendation

## Risk Assessment

- **C++ chưa từng build trên Linux.** Tín hiệu: stage Docker fail, hoặc đo bộ nhớ
  trả về 0. Phản ứng: đây là lý do Phase 1 tách riêng phần portable; nếu vẫn hỏng,
  đo bộ nhớ có thể bỏ (không phải yêu cầu sản phẩm) miễn mining vẫn đúng.
- **Mining trong container chậm hơn máy thật.** Tín hiệu: cùng tham số chậm rõ rệt.
  Phản ứng: ghi số đo vào README thay vì hứa hẹn; ε mặc định đã hạ từ Phase 1.
- **Upload dữ liệu lớn làm nghẽn.** Tín hiệu: một file làm treo server. Phản ứng:
  chặn theo dung lượng và số instance ngay ở tầng nhận, trước khi chuyển đổi.
