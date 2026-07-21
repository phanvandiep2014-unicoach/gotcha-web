# Nối Git cho gotcha-live — runbook 5 phút (chạy trên máy bạn)

Mục tiêu: nối thư mục web này vào GitHub + Vercel, để từ nay chỉ cần `git push`
là Vercel tự deploy đúng project `gotcha-live` — hết cảnh kéo-thả tạo project mới.

Setup của bạn: GitHub user **phanvandiep2014-unicoach**, Vercel team **writeright**, project **gotcha-live**.

---

## Bước 1 — Tạo repo trên GitHub ✅ ĐÃ XONG
Repo đã tạo: https://github.com/phanvandiep2014-unicoach/gotcha-web

<details><summary>(tham khảo — đã làm rồi)</summary>
1. Mở https://github.com/new
2. Repository name: **gotcha-web** (BẠN ĐÃ TẠO XONG bước này)  (owner để nguyên phanvandiep2014-unicoach)
3. Để **Public** (site tĩnh, không có mật khẩu/khoá gì) — hoặc Private tuỳ bạn.
4. KHÔNG tích "Add README / .gitignore / license" (để repo trống).
5. Bấm **Create repository**.
</details>

## Bước 2 — Đẩy thư mục web lên GitHub (2 phút, trong CMD/PowerShell)
Mở Command Prompt, dán từng dòng:
```bat
cd C:\Users\mento\Downloads\UNICOACH_Brand_Kit_2\gotcha-web-deploy
git init
git add -A
git commit -m "Gotcha web: v0 + analytics + progress"
git branch -M main
git remote add origin https://github.com/phanvandiep2014-unicoach/gotcha-web.git
git push -u origin main
```
(Lần đầu Git có thể hỏi đăng nhập GitHub — làm theo cửa sổ hiện ra.)

## Bước 3 — Nối repo vào project gotcha-live trên Vercel (1 phút)
1. Vào https://vercel.com/writeright/gotcha-live/settings/git
2. Bấm **Connect Git Repository** → chọn **gotcha-web**.
3. Nếu Vercel hỏi cấu hình build:
   - Framework Preset: **Other**
   - Root Directory: **.**  (thư mục gốc repo)
   - Build Command: **(để trống)**
   - Output Directory: **.**
4. Save.

## Xong! Từ giờ mỗi lần sửa
```bat
cd C:\Users\mento\Downloads\UNICOACH_Brand_Kit_2\gotcha-web-deploy
git add -A
git commit -m "mô tả thay đổi"
git push
```
→ Vercel tự build và cập nhật gotcha-live. Không tạo project mới nữa.

---

## Lưu ý
- Alias `gotcha-live-writeright.vercel.app` giữ nguyên — OG image vẫn đúng, không phải sửa gì.
- Khi Claude (mình) cập nhật code lần sau, mình chỉ cần cập nhật các file trong
  thư mục này; bạn chạy 3 dòng ở "Từ giờ mỗi lần sửa" là lên sóng.
- Nếu muốn nối cả monorepo `Gotcha_App` (API + mobile) lên GitHub sau này, xem
  `Gotcha_App/CONNECT_GIT.md` — nhưng cho web thì repo `gotcha-web` này là đủ.

## Vì sao mình không tự làm bước 2 được
`git push` cần chạy trên máy bạn. Trên môi trường của Claude, thư mục nằm trên
OneDrive/Windows nên git bị khoá thao tác — đây là giới hạn kỹ thuật, không phải
thiếu sót. Bước 1 và 3 mình lái trình duyệt được, nhưng trang GitHub hôm nay bị
treo liên tục khi thao tác tự động, nên gộp luôn vào runbook cho chắc.
