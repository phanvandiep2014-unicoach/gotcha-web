# Gotcha Backend — Runbook (đọc 5 phút)

Backend là **serverless functions** nằm ngay trong project web này (thư mục `/api`), cùng domain
với trang tĩnh → không CORS, phiên đăng nhập dùng cookie httpOnly an toàn. **App vẫn chạy
bình thường ở chế độ local nếu chưa dựng backend** — backend chỉ bật thêm: đăng nhập Google
được xác minh phía server, đồng bộ dữ liệu đa thiết bị, và link hồ sơ chia sẻ cho giáo viên.

## 1. Cần chuẩn bị
- Một **Postgres** (chọn 1): **Vercel Postgres** (dễ nhất, cùng dashboard), **Neon**, hoặc **Supabase**.
  → lấy chuỗi kết nối `postgres://...` (connection string).
- **Client ID Google** đã tạo: `76480342321-...apps.googleusercontent.com`.

## 2. Đặt biến môi trường trên Vercel
Project `gotcha-live` → **Settings → Environment Variables**, thêm 3 biến (Production + Preview):

| Tên | Giá trị |
|---|---|
| `GOOGLE_CLIENT_ID` | `76480342321-b2s9g70uk51nnfi7h8lhnjrpco4sfleq.apps.googleusercontent.com` |
| `SESSION_SECRET` | một chuỗi ngẫu nhiên dài (vd chạy `openssl rand -base64 32`) |
| `DATABASE_URL` | chuỗi kết nối Postgres của bạn |

*(Tuỳ chọn: `PGSSL=disable` nếu DB không dùng SSL — Neon/Supabase/Vercel đều để mặc định SSL, không cần đặt.)*

## 3. Tạo bảng
API tự tạo bảng ở lần gọi đầu. Hoặc chạy tay file `schema.sql` trên DB (users, user_data, shares).

## 4. Deploy
Vì đã có `package.json`, Vercel sẽ tự `npm install` (`pg`, `google-auth-library`) và build functions.
```bat
cd C:\Users\mento\Downloads\UNICOACH_Brand_Kit_2\gotcha-web-deploy
git add -A && git commit -m "Add backend: auth verify + sync + teacher share"
git push
```

## 5. Kiểm tra nhanh sau deploy
- `https://<domain>/api/auth/me` → trả `{"user":null}` (chưa đăng nhập) = backend sống.
- Vào `/profile` → đăng nhập Google → reload trang/khác máy vẫn thấy dữ liệu (đồng bộ).
- Bấm **Chia sẻ hồ sơ** → nhận link `/api/share/xxxx` (chỉ đọc) đưa cho giáo viên.

## 6. Các endpoint
| Method | Path | Việc |
|---|---|---|
| POST | `/api/auth/google` | Xác minh ID token Google → tạo phiên (cookie) |
| GET | `/api/auth/me` | Người dùng hiện tại (hoặc null) |
| POST | `/api/auth/logout` | Xoá phiên |
| GET/PUT | `/api/data` | Kéo/đẩy blob dữ liệu của người dùng (đồng bộ) |
| POST | `/api/share` | Tạo link hồ sơ chỉ đọc |
| GET | `/api/share/:token` | Trang hồ sơ chỉ đọc cho giáo viên |
| POST | `/api/pronounce` | Chấm phát âm (Azure) — **có tính hạn mức** |
| GET | `/api/quota` | Số phút nói còn lại của phiên hiện tại |
| POST/GET/DELETE | `/api/recordings` | Bản ghi học viên chủ động giữ lại (S3/R2) |

## 6c. Lưu bản ghi âm trên S3 / Cloudflare R2

Học viên **tự bấm "Giữ lại"** cho từng bài — không có bản ghi nào tự động được lưu. Đây là điều kiện để làm được thẻ "Trước–Sau" và để có dữ liệu hiệu chuẩn band.

**Biến môi trường** (thiếu bất kỳ cái nào thì tính năng tự tắt êm, app vẫn chạy bình thường):

| Tên | Ví dụ | Ghi chú |
|---|---|---|
| `S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | R2: lấy ở Cloudflare → R2 → Manage API Tokens |
| `S3_BUCKET` | `precisely-recordings` | Bucket **riêng tư**, không bật public access |
| `S3_REGION` | `auto` | R2 dùng `auto`; S3 dùng vùng thật, vd `ap-southeast-1` |
| `S3_ACCESS_KEY_ID` | | |
| `S3_SECRET_ACCESS_KEY` | | |
| `S3_RETENTION_DAYS` | `180` | Chỉ là con số hiển thị — **phải đặt lifecycle rule ở bucket** |
| `S3_MAX_BYTES` | `8388608` | 8 MB ≈ 4 phút WAV 16 kHz mono |

**Ba điều đã được ép trong code:**

- **Khoá đối tượng không lộ danh tính**: `rec/<hmac 16 ký tự của sub>/<năm>/<tháng>/<uuid>.wav`. Ai xem được danh sách bucket cũng không thấy email hay mã học viên. Đổi `SESSION_SECRET` sẽ đổi hash — bản ghi cũ vẫn phát được vì khoá lưu trong CSDL, nhưng bản mới rơi vào thư mục khác.
- **Phát lại qua URL ký sẵn hết hạn sau 10 phút**, ký lúc đọc chứ không lưu sẵn trong CSDL (URL lưu trong CSDL thì hoặc hết hạn trong bảng, hoặc thành link công khai vĩnh viễn).
- **Xoá là xoá thật** — xoá cả object lẫn dòng CSDL, để câu "xoá bản ghi bất cứ lúc nào" trên trang chủ là sự thật.

⚠️ **Vẫn phải đặt lifecycle rule ở bucket** cho đúng `S3_RETENTION_DAYS`. Code không tự dọn: thứ gì phải chạy mới xoá được thì sớm muộn cũng ngừng chạy.

**Về phần ký SigV4:** tự viết trong `api/_lib/sigv4.js` thay vì dùng `@aws-sdk/client-s3` (vài MB cho đúng hai thao tác, cộng vào thời gian khởi động nguội của mỗi lần upload). Chữ ký đã được **đối chiếu với thư viện độc lập `aws4` v1.13.2** và khớp tuyệt đối ở 4 ca (body nhỏ, body 1 MB, body rỗng, khoá có ký tự lạ) — kết quả ghim thành test vector trong `apps/web/test/sigv4.test.ts`. Dù vậy, **hãy thử upload thật một lần** sau khi cấu hình: ký sai chỉ trả về 403 trơ trọi, và log của endpoint có in nội dung lỗi từ bucket (vùng sai và khoá sai đều ra 403, chỉ nội dung mới phân biệt được).

## 6b. ⚠️ Hạn mức phút nói — đọc trước khi đổi bất cứ thứ gì

`/api/pronounce` **tiêu tiền thật**: khoảng **11đ mỗi giây** âm thanh gửi tới Azure. Trước 31/08/2026 endpoint này không kiểm tra gì cả — không phiên, không origin, không giới hạn — nghĩa là bất kỳ ai biết URL cũng chạy được hoá đơn Azure của bạn. Nay có bốn lớp chặn:

1. **Cùng origin** — POST từ site khác bị từ chối (403).
2. **Giới hạn độ dài** — mỗi lần chấm tối đa `PRECISELY_MAX_CLIP_SECONDS` giây (mặc định 130, vừa đủ Part 2).
3. **Hạn mức theo tài khoản** — bảng `speech_usage`, gói lấy từ trường `plan` trong phiên.
4. **Sandbox theo IP** — khách chưa đăng nhập được `PRECISELY_SANDBOX_SECONDS` giây/ngày (mặc định 60), và **tất cả khách cộng lại** không vượt `PRECISELY_SANDBOX_DAILY_CAP_SECONDS` (mặc định 3600 ≈ 40.000đ/ngày).

Bảng gói nằm ở **một chỗ duy nhất**: `api/_lib/quota-rules.js` → `PLANS`. Luật thuần tuý ở file đó, phần đọc/ghi CSDL ở `api/_lib/quota.js`. Có **24 test** ở `apps/web/test/quota.test.ts` — chạy `npm test` sau mỗi lần đổi bảng giá.

**Bộ đếm cố tình fail-open:** nếu CSDL hỏng, request vẫn được chấm và lỗi được ghi log. Khoá cửa một học viên đã trả tiền tệ hơn là chi thêm vài nghìn đồng. Nếu đổi ý, sửa ở `checkQuota`.

**Biến môi trường tuỳ chọn:**

| Tên | Mặc định | Việc |
|---|---|---|
| `PRECISELY_MAX_CLIP_SECONDS` | `130` | Trần độ dài mỗi lần chấm |
| `PRECISELY_SANDBOX_SECONDS` | `60` | Hạn mức khách chưa đăng nhập, mỗi IP mỗi ngày |
| `PRECISELY_SANDBOX_DAILY_CAP_SECONDS` | `3600` | Trần chi tiêu ngày cho toàn bộ khách vãng lai |

Chưa đặt `AZURE_SPEECH_KEY` thì endpoint chạy chế độ demo và **không trừ hạn mức** — vì không tốn tiền.

## 7. Mô hình dữ liệu (tối giản)
- `users(sub, email, name, picture)` — danh tính Google.
- `user_data(sub, data jsonb, updated_at)` — blob đồng bộ: `progress, prefs, duke, lasteval, lexicon`. Cơ chế **last-write-wins** theo thời gian.
- `shares(token, sub)` — token cấp quyền xem hồ sơ chỉ đọc.
- `speech_usage(sub, period, seconds)` — đồng hồ đo phút nói. `sub` có thể là `lms:<mã>`, Google sub, `ip:<hmac>` (khách vãng lai) hoặc `sandbox:all` (tổng ngày). `period` là `trial`, `YYYY-MM` hoặc `YYYY-MM-DD`. **Không** có khoá ngoại tới `users` vì khách chưa đăng nhập cũng phải đếm được.

## 8. Giới hạn Phase-1 (trung thực)
- Đồng bộ theo **cả-blob, last-write-wins** (đủ cho 1 người dùng nhiều thiết bị; chưa xử lý xung đột chi tiết).
- Đẩy dữ liệu lên server hiện chạy khi mở `/profile` (kéo/đẩy) và khi đăng nhập. Muốn đẩy tức thì sau mỗi buổi Thi thử/Trò chuyện thì thêm gọi `pushLocal` ở cuối các màn đó (một dòng) — để Phase-2.
- Chưa có RLS/row-level security nâng cao; quyền truy cập dựa trên phiên cookie đã xác minh. Đủ cho beta; nếu scale lớn cân nhắc Supabase RLS hoặc thêm rate-limit.
- Bảo mật cookie: `HttpOnly; Secure; SameSite=Lax`. Đổi `SESSION_SECRET` sẽ đăng xuất mọi phiên.
