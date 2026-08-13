# Phase 2: Thống nhất bản đồ Leaflet, gỡ Plotly

**Status:** Done · **Phụ thuộc:** Phase 1 · **Chặn:** Phase 4
**Chạy song song được với:** Phase 3

## Context

Hiện có hai component bản đồ với hai cách tô sáng khác nhau:

- `mining-map.jsx` (Leaflet) tạo marker một lần rồi **restyle tại chỗ**
  (`mining-map.jsx:82-101`) — đúng cách.
- `SpatialMap.jsx` (Plotly) dựng lại toàn bộ trace mỗi lần đổi lựa chọn
  (`SpatialMap.jsx:19-71`, memo phụ thuộc `selected` và `neighbors`) — Toronto
  17.128 điểm phải vẽ lại toàn bộ mỗi lần click.

Đo được: chunk `SpatialMap` là **4.865 kB (1.478 kB gzip)** so với 386 kB cho
toàn bộ phần còn lại.

Phase 4 sẽ thêm **overlay khu vực khuyến nghị**. Giữ hai component nghĩa là viết
overlay đó hai lần. Đây là lý do quyết định gỡ Plotly, chứ không phải chỉ vì kích
thước bundle.

Người dùng xác nhận đường X/Y **sẽ được dùng thật**. Lưu ý: Toronto không nằm
trong Docker image (là fixture kiểm chứng ở repo anh em), nhưng **CSV upload chỉ
có X/Y cũng rơi vào đúng đường này** — nên nhánh CRS.Simple cần đúng bất kể
Toronto có được đóng gói hay không.

## Requirements

- Một component bản đồ phục vụ cả hai CRS.
- Lat/lon: `EPSG3857` + tile OSM, hành vi giữ nguyên như hiện tại.
- Chỉ X/Y: `L.CRS.Simple`, không tile, đơn vị bản đồ = mét.
- Tô sáng bằng restyle tại chỗ ở **cả hai** CRS.
- `plotly.js` và `react-plotly.js` biến mất khỏi `package.json` và bundle.

## Files

| File | Thay đổi |
|---|---|
| `src/components/leaflet-map.jsx` | **mới** — đổi tên/mở rộng từ `mining-map.jsx` |
| `src/components/mining-map.jsx` | xoá sau khi chuyển |
| `src/components/SpatialMap.jsx` | **xoá** |
| `src/App.jsx` | bỏ `lazy`/`Suspense` cho Plotly, truyền prop `crs` |
| `package.json` | gỡ `plotly.js`, `react-plotly.js` |

## Steps

1. Đổi `mining-map.jsx` → `leaflet-map.jsx`, thêm prop `crs` nhận `'latlon'`
   hoặc `'xy'` (suy từ `has_latlon` sẵn có ở `App.jsx:25`).
2. **Adapter toạ độ.** Một hàm `toLatLng(instance)`: `'latlon'` → `[lat, lon]`;
   `'xy'` → `[y, x]`. Dùng thống nhất cho marker, `fitBounds`, vòng ε.
3. **Khởi tạo map theo CRS.**
   - `'latlon'`: như hiện tại, `L.map(el, { preferCanvas: true })` + tile OSM.
   - `'xy'`: `L.map(el, { preferCanvas: true, crs: L.CRS.Simple, minZoom: -12 })`,
     **không** thêm tile layer.
   `minZoom` âm là bắt buộc: ở CRS.Simple zoom 0 thì 1 đơn vị = 1 pixel, mà
   Philadelphia trải 64.575 m và Toronto tương đương — không có zoom âm thì
   `fitBounds` không lùi đủ xa.
4. **Vòng ε.** `L.circle` nhận radius theo mét; với CRS.Simple đơn vị bản đồ
   chính là mét của ta nên dùng nguyên `radiusM`. Xác minh bằng mắt trên dữ liệu
   X/Y trước khi xoá `SpatialMap.jsx`.
5. **Zoom khi chọn điểm.** `mining-map.jsx:125` ép `zoom >= 17` — hằng số này chỉ
   đúng cho EPSG3857. Với CRS.Simple, tính mức zoom sao cho vòng ε chiếm khoảng
   1/4 khung, hoặc dùng `map.fitBounds` quanh vòng ε. Không dùng chung hằng số.
6. Bỏ `lazy`/`Suspense` ở `App.jsx:13, 267-272`; render `leaflet-map.jsx` cho cả
   hai nhánh, chỉ khác prop `crs`.
7. Gỡ hai dependency Plotly, chạy `npm install`, build lại và **ghi lại số đo**
   để đối chiếu với 4.865 kB ban đầu.
8. Dọn `center` memo chết ở `mining-map.jsx:30-38` (chỉ dùng lúc khởi tạo rồi bị
   `fitBounds` ghi đè, kèm `eslint-disable`).

## Validation

- Philadelphia: bản đồ OSM vẽ 9.928 điểm; click một điểm → hàng xóm đồng tham gia
  tô sáng, vòng ε hiện đúng. Hành vi **không đổi** so với trước.
- Dataset chỉ có X/Y: điểm vẽ đúng hình dạng không gian (không bị lật/xoay — đây
  là lỗi hay gặp khi nhầm thứ tự `[y, x]`), click → tô sáng tại chỗ, vòng ε đúng
  bán kính mét.
- Đối chứng hình dạng: so ảnh chụp nhánh X/Y mới với scatter Plotly cũ trước khi
  xoá, xác nhận cùng phân bố.
- `npm run build`: không còn chunk `SpatialMap`; ghi kích thước bundle mới.
- `npm run lint` sạch.

## Risk / Rollback

**Rủi ro chính:** tinh chỉnh zoom/bounds của CRS.Simple ở quy mô 64 km. Giảm rủi
ro bằng cách **giữ `SpatialMap.jsx` cho tới khi nhánh X/Y đã xác minh bằng mắt**;
chỉ xoá ở bước cuối. Rollback = revert commit xoá và khôi phục hai dependency.

**Đánh đổi đã chấp nhận:** mất trục toạ độ X(m)/Y(m) và gridline mà Plotly vẽ
sẵn; nền dataset X/Y sẽ trống trơn. Người dùng đã chọn phương án này. Nếu sau đó
thấy thiếu, thêm một lớp graticule là việc nhỏ và tách rời.
