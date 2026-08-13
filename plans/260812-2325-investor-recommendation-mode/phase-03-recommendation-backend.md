# Phase 3: Backend khuyến nghị

**Status:** Done · **Phụ thuộc:** không (độc lập với Phase 1, 2) · **Chặn:** Phase 4

## Context

Hai tính năng khuyến nghị dựa trên **một ý duy nhất**:

> Một vị trí hấp dẫn với feature `B` khi các thành viên còn lại của một prevalent
> pattern chứa `B` **đã có mặt gần đó**, còn `B` thì **chưa**.

Không cần mine lại. Mọi thứ cần thiết đã có sẵn:

- `PatternIndex.participation` (`pattern_query.py:53`) — `{feature: set(number)}`
  cho từng pattern, đã cache ở `main.py:61`.
- `SpatialGrid.within()` (`pattern_query.py:34`) — truy vấn bán kính theo mét, đã
  cache ở `main.py:62`.
- Cả hai dataset đều có `x, y` mét, nên logic dùng chung không phân biệt CRS.

**Chìa khoá hiệu năng:** dataset có 20 feature → biểu diễn "feature nào có mặt"
bằng số nguyên 20 bit, và "pattern P có được hỗ trợ ở đây không" thu về một phép
`AND` + so sánh.

Số đo (`scratchpad/bench_area.py`, Philadelphia ε=80 m): 4.695 ô có instance trên
tổng 428.359 ô phủ bbox — **99,0% bbox rỗng**, và ô rỗng có điểm 0 theo định
nghĩa nên bỏ qua được mà không mất gì. Chấm điểm 20 ms ở 100 pattern, 355 ms ở
2.000. Pattern thật: Philadelphia ε=80 m ra **175**, nên chi phí vận hành nằm ở
mốc 20 ms.

**Xử lý `wpi: null`.** Pattern `deduced` không có WPI (`report_writer.cpp:203`,
bất biến ở `miner.h:20-27`). Chúng vẫn prevalent theo Lemma 2 nên WPI thật
≥ `min_prev` — thay bằng `min_prev` làm cận dưới thay vì loại bỏ. Trên dữ liệu
thật đây là nhánh hiếm (Toronto: 647/647 pattern có WPI tính thật).

## Requirements

- Hai endpoint mới, không đổi endpoint cũ.
- Khuyến nghị theo điểm: < 50 ms.
- Khuyến nghị khu vực: p95 < 500 ms trên Philadelphia ε=80 m, có cache theo
  `(result_key, feature)`.
- Khu vực xếp theo **điểm ô cao nhất**, trả kèm tổng điểm và số ô.
- Chặn upload có >64 feature riêng biệt.

## Files

| File | Thay đổi |
|---|---|
| `server/recommendation.py` | **mới** — bitmask index, chấm điểm ô, flood-fill |
| `server/main.py` | hai route mới, cache mới cạnh `_INDEX_CACHE`/`_GRID_CACHE` |
| `server/upload.py` | thêm `MAX_FEATURES = 64` và kiểm tra |
| `server/tests/test_recommendation.py` | **mới** |
| `server/tests/test_upload.py` | thêm case vượt giới hạn feature |

## Steps

1. **`FeatureBits`** — ánh xạ feature → bit, ổn định theo thứ tự sắp xếp tên.
   `mask(features)` trả int. Nếu vượt 64 feature, raise lỗi rõ ràng (đường này
   chỉ tới được nếu upload lọt qua; giữ như lưới an toàn tầng hai).
2. **`CellPresence`** — dựng một lần cho `(dataset, eps)`:
   - gán instance vào ô `(x//eps, y//eps)`, OR bit feature vào mask ô;
   - **dilation**: mask hiện dụng của một ô = OR của nó và 8 ô kề, xấp xỉ "có mặt
     trong bán kính ε". Đo được ~11 ms.
   - lưu kèm `counts[(cell, feature)]` để tính saturation.
3. **`recommend_for_point(...)`** — cho instance `(A, n)` tại `p`:
   - `nearby = grid.within(p.x, p.y, eps)` → tập feature có mặt + số lượng từng feature;
   - với mỗi ứng viên `B` xuất hiện cùng `A` trong ít nhất một pattern:
     - `S(B)` = pattern chứa cả `A` và `B`;
     - `P` là *ready* khi mọi feature trong `P \ {B}` đều có mặt trong bán kính;
     - `score(B) = Σ wpi(P)` trên các `P` ready, với `wpi ?? min_prev`;
   - trả về: `feature`, `score`, `ready_count`, `total_count`, `existing_nearby`,
     `is_rare`, và **`supporting_patterns`** (danh sách pattern ready kèm `wpi`,
     `deduced`, `features`) cho expander "Lý do" của Phase 4.
4. **`recommend_areas(...)`** — cho feature `F`:
   - `needs = [(mask(P \ {F}), wpi(P) ?? min_prev) for P in patterns if F in P]`;
   - với mỗi ô có instance, memo hoá theo mask (đo được ~52% hit):
     `score = Σ wpi where need & m == need`;
   - `saturation` = số instance của `F` trong ô;
   - **flood-fill** 8-hướng trên các ô điểm cao (đề xuất: trên phân vị 90) thành
     vùng liên thông; mỗi vùng trả `peak_score`, `total_score`, `cell_count`,
     `saturation`, `centroid`, `bbox`, và pattern hỗ trợ của ô peak;
   - **xếp theo `peak_score`** giảm dần, cắt `top`.
   - Trả `bbox` theo cả `x/y` và `lat/lon` khi dataset có lat/lon, để frontend vẽ
     được ở cả hai CRS mà không phải tự chiếu.
5. **Route.**
   - `GET /api/jobs/{job_id}/instances/{feature}/{number}/recommendations`
   - `GET /api/jobs/{job_id}/site-recommendations?feature=F&top=N`
   Dùng lại `_result_of`, `_index_for`, `_grid_for`. Thêm `_PRESENCE_CACHE` khoá
   `(dataset_id, eps_m)` và `_AREA_CACHE` khoá `(result_key, feature, top)`.
   `clear_cache` (`main.py:269`) phải xoá luôn hai cache mới.
6. **Giới hạn upload.** `MAX_FEATURES = 64` trong `upload.py` cạnh
   `MAX_INSTANCES` (`upload.py:31`). Thông báo nêu **lý do thật**: liệt kê clique
   của miner bùng nổ theo số feature, không phải giới hạn kỹ thuật của bitmask.
7. **Test.** Fixture nhỏ, dựng tay, kiểm được bằng mắt:
   - pattern ready đúng, pattern thiếu thành viên không được tính;
   - `wpi: null` được thay bằng `min_prev`;
   - saturation đếm đúng;
   - flood-fill gộp đúng ô liền kề, không gộp ô cách quãng;
   - xếp hạng theo peak khác kết quả xếp theo tổng (chứng minh cột peak có tác dụng);
   - upload 65 feature bị từ chối, 64 feature đi qua.

## Validation

- `pytest server/tests` xanh, kể cả 50 test cũ.
- Đo thật trên Philadelphia ε=80 m sau khi đã có kết quả mine trong cache: ghi
  lại thời gian lần gọi đầu và lần gọi lại cho `site-recommendations`.
- Kiểm tra thủ công một khuyến nghị: chọn một ô điểm cao, xác nhận các feature
  của pattern hỗ trợ **thật sự** nằm trong bán kính ε quanh ô đó.

## Risk / Rollback

| Rủi ro | Giảm thiểu |
|---|---|
| Số pattern chứa F vượt xa mốc đã đo | Chi phí tuyến tính theo số đó; có cache theo feature và tham số `top`. Đo lại khi đã có kết quả mine thật. |
| Dilation 8 ô kề chỉ xấp xỉ hình tròn ε | Là xấp xỉ có chủ ý, rẻ hơn nhiều lần truy vấn bán kính. Ghi rõ trong docstring. Nếu cần chính xác, đổi sang `grid.within` cho ô lọt top — chỉ vài chục ô. |
| Khuyến nghị bị hiểu là dự báo thành công kinh doanh | Trường trả về đặt tên theo cơ sở co-location; Phase 4 hiển thị pattern hỗ trợ và saturation. |

Backend thuần cộng thêm, không đổi endpoint cũ → rollback bằng gỡ route và file mới.
