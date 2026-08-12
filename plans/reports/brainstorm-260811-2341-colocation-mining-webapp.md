# Brainstorm — Co-location Mining Web App (thesis software)

Date: 2026-08-11, updated 2026-08-12 after empirical verification
Status: contract accepted, verification done, ready for planning

## Pivot context

Nhóm đã bảo vệ thử; hội đồng chấp nhận Cauchy weighting và thuật toán cải tiến.
Quyết định: **bỏ toàn bộ POI recommendation**, làm web app mining co-location,
engine là thuật toán thật của luận văn.

## Contract

**Outcome** — Web app một trang, một process / một Docker image. Người dùng nạp
dataset không gian (Feature, InstanceID, lat/lon hoặc X/Y, thuộc tính số như
rating/checkin), chỉnh ε và minprev, chạy miner clique-based + Cauchy WPI thật,
hiển thị prevalent co-location patterns với rare feature được làm nổi bật; click
một instance trên bản đồ OSM → liệt kê và tô sáng các instance lân cận cùng tham
gia pattern prevalent với nó.

**Constraints**
- Engine = `Maximal-Clique-HashMap-Algorithm` (C++ tuần tự, đúng bài báo), vá hai
  hàm trọng số, gọi qua subprocess từ FastAPI.
- Prevalence là đại lượng toàn cục → mine toàn dataset trước; click là truy vấn.
- Chỉ dataset có lat/lon mới lên bản đồ thật.
- Mining là tác vụ dài (xem Runtime) → bắt buộc job có tiến trình và hủy được.
- Giữ đơn-origin: FastAPI phục vụ cả API lẫn SPA đã build.

**Non-goals**
- POI recommendation: B1/B2/B3/M1, CoLocScore, đánh giá top-k, `recommender.py`,
  toàn bộ `/api/recommend*`, phụ thuộc `pair_colocation_scores.csv`.
- **So sánh Cauchy vs Gaussian** (quyết định 2026-08-12). Hội đồng đã chấp nhận
  phương pháp; benchmark thuộc luận văn. Demo chỉ làm nổi bật rare feature bằng
  số lượng instance thấp.
- Dựng lại benchmark Chương 5 trong app. Tài khoản người dùng.

**Acceptance criteria**
1. Chạy Toronto `version_03.csv`, ε=120 m, minprev=0.2 → κ = 7.8580 và
   **647 pattern** (đã xác minh, xem Verification).
2. Click một điểm trên bản đồ OSM → hiện các pattern prevalent nó tham gia +
   tô sáng những hàng xóm đồng tham gia.
3. Rare feature (số instance thấp) được làm nổi bật rõ trong danh sách và trên
   bản đồ; ngưỡng chỉnh được bằng slider phân vị (mặc định 25% = Q1) kèm sàn
   `rare_min_count` (mặc định 30). Đổi ngưỡng → cập nhật tức thì, không re-mine.
4. Đổi minprev → cập nhật tức thì. Đổi ε → job re-mine có tiến trình và nút hủy.
5. `docker build` + `docker run` phục vụ toàn bộ trên một cổng.

## Verification (đã chạy thật, 2026-08-12)

Build: `g++ -O2 -std=c++17 -lpsapi` qua MSYS2 UCRT (không có cmake/MSVC trong máy).
Nguồn: `Maximal-Clique-HashMap-Algorithm/src/*` với `utils.cpp` thay bằng bản vá.

### κ và Cauchy tái hiện chính xác

`κ = 2/(m(m-1)) · Σ_{i<j} cnt(τ_j)/cnt(τ_i)` trên
`A-Joinless-Approach-.../data/Toronto_x_y_alphabet_version_03.csv`
(17.128 instance, 20 feature, hiếm nhất T=28) = **7.8580** — trùng delta ghi
trong `so sanh thuat toan.txt`.

| Biến thể | Pattern | Đối chiếu luận văn |
|---|---|---|
| **Cauchy** `ω = 1 + ((r-1)/κ)²` | **647** | **khớp (647)** |
| Gaussian `exp(z²/2)` (Eq. 3) | 512 | ≠ 616 |
| Gaussian `exp(z²)` (bản minh họa trong bài) | 589 | ≠ 616 |
| Code repo hiện tại (log-based) | 778 | ≠ 616 |

Phân bố size của Cauchy: `{2:108, 3:214, 4:202, 5:97, 6:24, 7:2}`.

Baseline Gaussian **không tái hiện được** từ code có trong máy (tập chung
507/556/613 so với kỳ vọng 581). Đây là lý do trực tiếp để bỏ màn hình so sánh.
File gốc cần tìm nếu sau này muốn khôi phục: `Code_implement_gốc.txt` trong
`D:\Desktop chính\Đồ án\Rate_feature\log\Cauchy\`.

### Runtime

| Dataset | Tham số | Kết quả |
|---|---|---|
| Toronto 17.128 inst | ε=120 m, minprev=0.2 | ~40 s |
| Philadelphia 9.928 inst | ε=300 m, minprev=0.2 | **>20 phút, đã hủy** (RAM chỉ 22 MB) |

RAM thấp → chi phí nằm ở duyệt tập con của maximal clique, không phải bộ nhớ.
Miner Python (apriori) làm việc tương đương trong 26,6 s nhưng dừng ở size 3.

### Vì sao dùng bản trên xuống (và vì sao nó đắt)

`config.py` đặt `max_pattern_size = None` và vòng lặp `while P_prev:` → Python
không giới hạn size; nó dừng ở size 3 vì tầng 4 không còn ứng viên nào vượt
ngưỡng, do sinh ứng viên chỉ từ pattern đã prevalent ở tầng trước.

WPI **không phản đơn điệu**: `ω` phụ thuộc `r = cnt(τ)/cnt(τ_min)` với `τ_min`
là feature hiếm nhất trong chính pattern. Thêm một feature rất hiếm làm đổi
`τ_min`, đẩy `r` của các feature còn lại tăng vọt, nên tập cha có thể prevalent
hơn tập con. Ví dụ với κ=7.858: `{A,B}` (5649, 5000) cho WPI 0.25, thêm T (28)
thành `{A,B,T}` cho WPI 0.30. Với ngưỡng 0.28, apriori loại `{A,B}` ở tầng 2 nên
không bao giờ sinh `{A,B,T}` — bỏ sót đúng loại pattern hiếm mà luận văn nhắm tới.

Bài báo chỉ phát biểu chiều xuống có điều kiện (Lemma 2: tập con **chứa f_min**),
không cho phép suy ngược lên. Nên duyệt trên xuống từ maximal clique là cách
đúng cho độ đo này, và đó là lý do tồn tại của đóng góp 2 — không phải tốc độ.

`Miner::queryInstances` đã soát: gộp instance từ mọi maximal clique chứa pattern.
Mỗi row instance là một clique và clique nào cũng nằm trong ít nhất một maximal
clique, nên tập thu được đúng bằng tập instance tham gia. Cơ chế lành mạnh.

## Việc phải làm trên C++

| Hạng mục | Bằng chứng | Ước lượng |
|---|---|---|
| Thay `calculateDispersion` | `utils.cpp:32-77` đang tính RMS hiệu log, bài báo là trung bình tỷ lệ | ~15 dòng (đã có bản chạy được) |
| Thay `calcRareIntensity` | `utils.cpp:81-127` đang là Gaussian log-based | ~20 dòng (đã có bản chạy được) |
| Portable hóa đo bộ nhớ | `main.cpp:20-23` dùng `windows.h`, `psapi`, `#pragma comment` | `#ifdef _WIN32`, nhánh Linux đọc `/proc/self/status` VmHWM |
| Xuất JSON instance-level | `main.cpp:91-114` chỉ ghi báo cáo text + tên pattern | ~100–150 dòng; bắt buộc để tô sáng bản đồ |
| Hủy được giữa chừng | chưa có | Server kill subprocess; C++ chỉ cần thoát sạch |
| Đóng gói | `CMakeLists.txt` có sẵn | Thêm stage build g++ vào Dockerfile |

Bản vá tham chiếu đã chạy được nằm ở scratchpad `mcr/utils-paper.cpp`.

## Ràng buộc tích hợp đã phát hiện

- **Loader làm mất danh tính gốc** — `data_loader.cpp:40-41` đọc `Instance` như
  `int` rồi dựng lại id = `Feature + số`. API phải giữ bảng ánh xạ
  `(Feature, số) → business_id` khi sinh CSV đầu vào, nếu không thì không tô
  sáng đúng điểm trên bản đồ được.
- **Config nhạy BOM** — `ConfigLoader` so khớp khóa bằng chuỗi thô; file có BOM
  làm hỏng dòng đầu và miner âm thầm rơi về `data/sample_data.csv`. Server phải
  ghi config không BOM và nên kiểm chứng lại `Dataset Path` trong output.
- **CSV đầu vào của miner** cần đúng cột `Feature, Instance, LocX, LocY`, trong
  đó `Instance` là số nguyên.

## Dữ liệu

`POI_recommend/data/yelp/philadelphia/processed/spatial_instances.csv` —
9.928 instance, 20 feature, có **cả** `latitude,longitude` **và** `X,Y` (mét).
Dataset bản đồ chính. `Toronto_x_y_alphabet_version_03.csv` (20 feature, κ=7.8580)
là dataset đối chứng thuật toán — chỉ có `LocX,LocY` nên hiển thị dạng scatter.
Lưu ý repo đang ship `Toronto_..._new_2.csv` (14 feature, κ=4.3808), **không**
phải file dùng trong luận văn.

## Tái sử dụng từ `spatial_web` hiện tại

Giữ: khung Vite + React + Tailwind + Plotly, dark theme, `.card` CSS
(`src/index.css`), mô hình FastAPI phục vụ SPA cùng origin (`server/main.py:263`),
Dockerfile multi-stage, `DataUpload.jsx`, `SpatialMap.jsx`.

Bỏ: `PoiRecommender.jsx`, `CauchyVsGaussian.jsx`, `server/recommender.py`, mọi
endpoint `/api/recommend*`, `/api/businesses`, `/api/pairs/top`.

## Rủi ro còn lại

- **R1** — ε=300 m trên dữ liệu đô thị dày là không tương tác được. Giảm tải theo
  thứ tự ưu tiên: ε mặc định thấp (~150 m) → slider `percentage_instances` (config
  đã hỗ trợ) → job hủy được. **Không** giới hạn pattern size, vì tính đầy đủ là
  điểm mạnh của thuật toán; nếu buộc phải dùng thì UI phải nói rõ.
- **R2** — `out/build/.../main.exe` sẵn có là bản MSVC Debug, Windows-only. Docker
  phải build lại từ nguồn.
- **R3** — Upload CSV tùy ý: cần quy tắc suy ra cột và phép chiếu lat/lon → mét.
- **R4** — Chưa chạy C++ và Python trên cùng dataset để đối chiếu tập pattern.
  Chỉ cần khi muốn khẳng định Python bỏ sót; không chặn việc triển khai.

## Unresolved questions

1. Thời gian chạy C++ trên Philadelphia ở ε=150 m — chưa đo, quyết định ε mặc
   định và mức lấy mẫu ban đầu.
2. Có cần giữ Toronto làm dataset đóng gói sẵn thứ hai không (đối chứng 647
   pattern), hay chỉ Philadelphia cho bản demo?
