# Brainstorm — Co-located Spot Explorer (app end-user thứ 2)

Date: 2026-08-16
Status: contract chấp nhận, số liệu data đã xác minh, sẵn sàng plan
Advisory: chạy dưới kongming (--advice), 5 vòng counsel đã tích hợp

## Bối cảnh & vấn đề gốc

`spatial_web` hiện tại = **Co-location Pattern Explorer** cho persona *nhà đầu
tư* (Investor/Mining view). Người dùng muốn thêm một app **end-user** để "đứng
một vị trí → xem địa điểm quanh đó nên ghé, chỉ hiện khoảng cách + rating".

Chẩn đoán gốc (đã verify): app "chưa đúng" **không** vì chọn nhầm thành phố, mà
vì **pipeline trích xuất cũ chọn nhầm tầng feature**. `prepare_yelp_recommender.py`
lấy top-20 category *gốc* (Restaurants, Food, Shopping...) — đều phổ biến — và
**loại thẳng** mọi business không thuộc top-20 khỏi mining input. Rare cuisine
(Cajun/Creole, Cheesesteaks, Vietnamese...) chưa bao giờ tới miner → chính hiện
tượng rare-feature co-location của luận văn bị giết ở khâu trích xuất.

## Ràng buộc lịch sử (không được vi phạm)

Hội đồng (bảo vệ thử 11/08) **chấp nhận Cauchy weighting** và quyết định **bỏ
toàn bộ POI recommendation** (B1/B2/B3/M1, CoLocScore, đánh giá top-k,
`/api/recommend*`) — xem `brainstorm-260811-2341-colocation-mining-webapp.md`.
App mới **không tái nhập** scope này. Ground-truth next-POI của Yelp (review kế
theo thời gian) đo sở thích toàn thành phố qua nhiều tuần (median 2.028 m, chỉ
13% trong 500 m) → không phù hợp làm "dự đoán chặng kế". App mới định khung là
**khám phá (discovery)**, không phải **dự đoán (prediction)**.

## Contract

**Outcome** — App end-user thứ 2, riêng biệt: người dùng đứng ở một vị trí trên
bản đồ, xem các POI ăn/chơi quanh đó, **nhóm theo cụm loại hình đồng vị
(co-location)** do miner C++ tìm ra, mỗi POI hiện khoảng cách + rating + popup
đặc điểm. Co-location là engine ngầm quyết *loại hình nào đáng chú ý*; jargon
(rare/WPI/κ) được ẩn. Dùng lại engine C++ và tri thức pattern của luận văn.

**Constraints**
- Engine = miner clique-based C++ có sẵn (`server/engine`). **Không** viết engine
  mới. Trần thực dụng ~25–30 feature/thành phố (clique nổ tổ hợp; phải **thử
  runtime thật** ở ε thực dụng — 20 feature/ε=150 m đã abort >20 phút).
- **Không** tái nhập `recommender.py` / `/api/recommend*` / model top-k.
- Prevalence là đại lượng toàn cục → mine trước; view là truy vấn rẻ.
- **Hai khoảng cách tách biệt**: ε mining (cố định per-run, theo mật độ POI, đổi =
  re-mine) vs **bán kính khám phá** (view-only, user chỉnh, **không bao giờ**
  truyền làm `eps_m` vào miner).
- `attributes` (giá, giờ, takeout...) **chỉ hiển thị**, không vào thuật toán.
- Feature = cuisine/leisure chi tiết, single-label **most-specific**, floor
  count ≥ 30 (khớp `DEFAULT_MIN_COUNT`, ổn định WPI và κ).
- Chỉ dùng **business data** cho mining (đúng tín hiệu cung/địa lý);
  user/interaction data (review/tip/checkin, 8.6 GB) **không** copy về — chỉ cần
  nếu tới bước evaluation.

**Non-goals**
- POI top-k prediction / đánh giá next-POI / cá nhân hóa theo user history.
- Baseline + ground-truth + metrics evaluation: **stretch goal đã hoãn**, baseline
  **chưa chốt** (không mặc định DBSCAN). Thiết kế để *cắm được sau*, **không xây**.
- Bịa tên cụm semantic/LLM (chỉ hiển thị danh sách feature).
- Trajectory/itinerary planning; personalization.
- Đụng vào Investor/Mining view hiện có (persona nhà đầu tư = giữ nguyên).

**Acceptance criteria**
1. Pipeline mới trích **Philadelphia + New Orleans** ra co-location instances,
   feature = cuisine chi tiết single-label, floor ≥ 30, ≤ ~30 feature/thành phố;
   **miner C++ chạy trong thời gian chấp nhận** ở ε thực dụng (đo thật).
2. Đứng một vị trí → thấy POI food/leisure quanh đó trong **bán kính khám phá
   chỉnh được**; mỗi POI có khoảng cách + rating; popup đặc điểm hiện cái POI
   *có*, thiếu = **"không rõ"** (không render thành "Không").
3. Nhóm loại hình đồng vị hiển thị bằng **danh sách feature** ("Wine Bars + Tapas
   + Gelato"), kèm pattern hỗ trợ diễn đạt thường (jargon ẩn).
4. Kéo bán kính khám phá **không bao giờ** kích hoạt re-mine.
5. Không endpoint/feature nào tuyên bố "dự đoán POI kế tiếp".

## Persona chốt

| | Persona A (app MỚI) | Persona B (đã có) |
|---|---|---|
| Ai | Người khám phá ăn/chơi tại chỗ | Nhà đầu tư / chọn mặt bằng |
| Đơn vị | POI + cụm loại hình đồng vị | Điểm / khu vực nên mở loại hình |
| App | App end-user mới, tối giản | Investor/Mining view (spatial_web) |
| Chia sẻ | Công thức WPI/Cauchy + engine C++ (KHÔNG chung pipeline feature) | |

Literature bảo chứng: co-location trong LBS = truy vấn "gần A thường có B"
(Pharmacy→ATM, Yu IJGIS 2017); urban functional zone via POI co-location là
sub-field đã có.

## Bằng chứng data (đã xác minh, business.json 150k POI)

- Ground-truth next-POI: median 2.028 m, 13% ≤500 m, 77% query bất khả đạt →
  bỏ khung prediction là đúng.
- κ (Global Pairwise Dispersion, đại lượng của chính engine) đo độ phân tán
  feature — **dùng κ, bỏ Gini** (κ tính trên nhãn đơn, tránh cạm bẫy multi-label;
  là đại lượng thuật toán nên bảo vệ được).
- Feature (κ per-city, nhãn đơn, ≥30): **Philadelphia κ=2.08, 71 feature, 7.329
  food POI**; **New Orleans κ=1.73, 24 feature, 3.208 food POI**.
- Rare-cuisine bản sắc (đắt cho luận văn): Philadelphia = **Cheesesteaks(148)**,
  Soul Food, Vietnamese, Korean; New Orleans = **Cajun/Creole(253), Jazz &
  Blues, Southern, Festivals**.
- Vocabulary chung Phil∩NOLA (≥30 cả hai) = **20 cuisine** → bảng κ so sánh
  định lượng; vocabulary riêng mỗi thành phố (~25–30 có chủ đích) giữ bản sắc.
- Popup: 91% POI có `attributes`, 85% có `hours`. Coverage: giá 57%, takeout 40%,
  wifi 38%, delivery 37%, good-for-kids 36%, outdoor 32%.

## Pipeline trích xuất mới (định nghĩa lại)

```
business.json (chỉ business data)
  → lọc business food/leisure (có ≥1 root ăn/chơi)
  → vocabulary = cuisine/leisure chi tiết (loại broad root), ~25–30 feature
     có chủ đích: phổ biến vừa + rare bản sắc; floor per-city ≥ 30; ≤ trần engine
  → gán nhãn ĐƠN most-specific (heuristic: tag global-count thấp nhất trong vocab)
  → co-location instances (feature, id, lat/lon) cho Philadelphia + New Orleans
  → miner C++ (ε thực dụng, min_prev) → patterns + κ  [THỬ RUNTIME THẬT]
  → [khe cắm evaluation — chưa xây]
```

Khác pipeline cũ: (a) tầng feature = cuisine chi tiết, không phải 20 root; (b)
giữ, không loại, business ngoài top-N (gán most-specific); (c) 2 thành phố chọn
khách quan bằng κ + bản sắc, không phải "nhiều instance nhất".

## 4 quyết định thiết kế (go, kèm điều chỉnh)

1. **Popup đặc điểm** — hiện giá / đang-mở (tính request-time) / takeout /
   outdoor / good-for-kids / alcohol / wifi / ambience. **Bỏ NoiseLevel.** Thiếu
   attribute = "không rõ", KHÔNG phải "Không". Chỉ hiển thị, ngoài thuật toán.
2. **Tên cụm** — hiển thị bằng **danh sách feature**, không bịa nhãn semantic/LLM.
   Cụm hiện 2–3 loại → gọi **"nhóm loại hình đồng vị"**, KHÔNG "khu/district"
   (over-promise). *Tạm thời*: nếu pattern về sau sinh ≥ nhiều instance/kích
   thước lớn hơn, người dùng sẽ cân nhắc bỏ tính năng đặt tên này.
3. **Extensibility (eval)** — thiết kế để cắm, chưa xây. Seam = giữ cached
   job-result (patterns/instances/params) tách khỏi UI state (popup, bán kính,
   cụm chọn). Template có sẵn = `rare_labeling.py` + `/result`. Không viết
   `EvalModule`/`metrics.py` rỗng.
4. **Hai khoảng cách** — tách. Bán kính view **không** ràng ≥ ε (không giải được
   cụm-cụt vì cụm nối chuỗi qua grid); thay bằng **chú thích** "cụm định nghĩa ở
   Xm, đang xem Ym". Bán kính view chỉ lọc trên instance đã mine, không re-mine.

## Danh sách use-case → feature (deliverable)

| # | Use-case | Feature | Trạng thái |
|---|---|---|---|
| UC1 | Đứng một vị trí, xem POI ăn/chơi quanh đó | Bản đồ Leaflet + pin POI lọc food/leisure (tái dùng `leaflet-map.jsx`) | Mới |
| UC2 | POI được nhóm theo cụm loại hình đồng vị | Hiển thị nhóm từ pattern (danh sách feature, 2–3 loại) | Mới (reuse area-mode `recommendation.py`) |
| UC3 | Xem chi tiết một địa điểm | Popup: tên, khoảng cách, rating + đặc điểm (thiếu="không rõ") | Mới |
| UC4 | Hiểu vì sao loại hình/cụm được làm nổi | Hiển thị pattern hỗ trợ + độ mạnh, diễn đạt thường (jargon ẩn) | Reuse `supporting-patterns` |
| UC5 | Chỉnh "quanh đây bao xa" theo nhu cầu đi bộ | Núm bán kính khám phá (view-only, tách khỏi ε) + chú thích | Mới |
| UC6 | (Nghiên cứu, ẩn) chọn thành phố, xem tham số/κ/pattern | Chế độ nghiên cứu: chọn dataset Phil/NOLA, mining view | Reuse |
| UC7 | (Stretch) đánh giá co-location vs baseline | Khe cắm eval đọc job-result thô | Chưa xây (extensible) |

## Rủi ro & xếp hạng (bảo vệ luận văn)

1. **Framing "district" over-promise cụm 2–3 loại** — đã sửa bằng từ ngữ.
2. **Attribute thiếu render thành "Không"** — bug correctness, phải "không rõ".
3. **Trần engine**: Philadelphia 71 feature > trần → phải cắt ~25–30 có chủ đích;
   **bắt buộc thử runtime thật** trước khi chốt (rủi ro kỹ thuật lớn nhất).
4. Gộp 2 khoảng cách (bug hiện tại) — phải tách trước khi gọi là "explorer".

## Bước tiếp theo (handoff → plan)

1. Plan pipeline trích xuất mới + vocabulary có chủ đích (Phil + NOLA).
2. **Thử runtime miner C++** trên vocabulary nháp để chốt số feature + ε.
3. Plan app end-user (UC1–UC5) reuse Leaflet + area-mode; giữ Investor/Mining.
4. Ghi seam extensibility cho eval (1 dòng design note).

## Câu hỏi chưa giải quyết

- Số feature + ε cuối cùng: **chỉ biết sau khi thử runtime engine thật**.
- Vocabulary ~25–30 chọn cuisine nào cụ thể (cân bằng phổ biến vs rare bản sắc) —
  chốt ở bước plan sau khi có kết quả runtime.
- Baseline cho evaluation stretch: chưa chốt (không mặc định DBSCAN).
- App mới: repo/thư mục riêng hay route riêng trong spatial_web — chốt ở plan.
