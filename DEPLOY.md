# ✅ GOTCHA LIVE — bản mới nhất (analytics + progress)

## 🔗 Link chính thức
**https://gotcha-live-writeright.vercel.app**  ·  luyện tập: `/try`  ·  ảnh OG: `/og-image.png`
- Project Vercel: team `writeright` → **gotcha-live** (đây là bản canonical mới nhất)
- Có: web v0 + landing + ảnh OG + analytics (Vercel Web Analytics) + progress panel (localStorage)

## 🧹 Xoá các project deploy cũ (giữ mỗi gotcha-live)
Vercel → mỗi project → Settings → Delete: `gotcha-by-unicoach`, `gotcha`, `gotcha-ielts`.

## Bật Web Analytics để thu số liệu
Vercel → project `gotcha-live` → tab **Analytics** → **Enable Web Analytics** (miễn phí).
Sự kiện đã nhúng: recording_started, report_shown, error_detected (mã lỗi), recording_empty, speech_unsupported.

## Việc còn lại
1. Gắn tên miền `gotcha.unicoach.vn` vào project `gotcha-live` (Settings → Domains). Nếu gắn, sửa og:url/og:image sang domain đó rồi deploy lại 1 lần.
2. Nối Git (xem Gotcha_App/CONNECT_GIT.md) để lần sau `git push` là tự deploy — hết cảnh kéo-thả tạo project mới.
3. Test `/try` trên Chrome, cho phép micro, ghi 2 bài để thấy progress panel + streak.

---

# Deploy Gotcha web lên Vercel — 5 phút

Thư mục này đã sẵn sàng, KHÔNG cần build. Chọn 1 trong 2 cách.

## Cách A — Kéo–thả (dễ nhất, không cần cài gì)
1. Vào https://vercel.com/new
2. Đăng nhập (cùng tài khoản đã dùng cho WriteRight).
3. Chọn tab **"Deploy"** → kéo cả thư mục `gotcha-web-deploy` này thả vào,
   hoặc bấm "Browse" và chọn thư mục.
4. Bấm **Deploy**. Xong — Vercel cho bạn một link dạng `gotcha-xxx.vercel.app`.

## Cách B — Vercel CLI (nếu bạn quen dòng lệnh)
```bash
npm i -g vercel          # nếu chưa có
cd gotcha-web-deploy
vercel                   # lần đầu: đăng nhập + xác nhận; nhận link preview
vercel --prod            # đưa lên production
```

## Sau khi có link
- Mở link bằng **Chrome** (máy tính hoặc Android), cho phép micro, ghi thử 1 bài.
- `/` = trang giới thiệu · `/try` = bản luyện tập.
- Gắn tên miền riêng: Vercel → Project → Settings → Domains →
  thêm `try.gotcha.unicoach.vn` (hoặc tên bạn muốn), rồi trỏ CNAME theo hướng dẫn.

## Cập nhật sau này
Nếu sửa logic trong `Gotcha_App/packages/shared`, chạy lại
`bash Gotcha_App/apps/web/build.sh` để tạo `app.js` mới, chép đè vào thư mục này
rồi deploy lại (kéo–thả hoặc `vercel --prod`).

## Lưu ý
- Không cần biến môi trường, không cần backend — chạy tĩnh hoàn toàn.
- iPhone Safari sẽ báo chưa hỗ trợ nhận dạng giọng nói → app tự hướng người dùng sang Chrome.
