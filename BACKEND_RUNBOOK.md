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

## 7. Mô hình dữ liệu (tối giản)
- `users(sub, email, name, picture)` — danh tính Google.
- `user_data(sub, data jsonb, updated_at)` — blob đồng bộ: `progress, prefs, duke, lasteval, lexicon`. Cơ chế **last-write-wins** theo thời gian.
- `shares(token, sub)` — token cấp quyền xem hồ sơ chỉ đọc.

## 8. Giới hạn Phase-1 (trung thực)
- Đồng bộ theo **cả-blob, last-write-wins** (đủ cho 1 người dùng nhiều thiết bị; chưa xử lý xung đột chi tiết).
- Đẩy dữ liệu lên server hiện chạy khi mở `/profile` (kéo/đẩy) và khi đăng nhập. Muốn đẩy tức thì sau mỗi buổi Thi thử/Trò chuyện thì thêm gọi `pushLocal` ở cuối các màn đó (một dòng) — để Phase-2.
- Chưa có RLS/row-level security nâng cao; quyền truy cập dựa trên phiên cookie đã xác minh. Đủ cho beta; nếu scale lớn cân nhắc Supabase RLS hoặc thêm rate-limit.
- Bảo mật cookie: `HttpOnly; Secure; SameSite=Lax`. Đổi `SESSION_SECRET` sẽ đăng xuất mọi phiên.
