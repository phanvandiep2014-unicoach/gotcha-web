# Gotcha — Chấm phát âm thật (Azure) · Runbook

Tính năng **"🎤 Đọc & chấm phát âm"** trong màn kết quả Thi thử: học viên đọc câu luyện,
app ghi âm (WAV 16 kHz), gửi tới `/api/pronounce`, server gọi **Azure Pronunciation
Assessment** và trả về **điểm phát âm + độ chính xác từng từ + từng âm (phoneme)**.

**Chạy được ngay ở chế độ demo** (không cần key): server trả điểm mô phỏng để test giao diện.
Khi bạn thêm key Azure, điểm trở thành **thật**.

## 1. Tạo Azure Speech resource
1. Vào **portal.azure.com** → Create resource → **Speech** (Speech Services).
2. Chọn region (vd `southeastasia`), pricing tier **F0 (Free)** để thử (hoặc S0).
3. Sau khi tạo → **Keys and Endpoint** → copy **KEY 1** và **Location/Region**.

## 2. Đặt biến môi trường trên Vercel
Project `gotcha-live` → Settings → Environment Variables:

| Tên | Giá trị |
|---|---|
| `AZURE_SPEECH_KEY` | KEY 1 của Speech resource |
| `AZURE_SPEECH_REGION` | region, vd `southeastasia` |

Không có 2 biến này → endpoint tự chạy **chế độ demo** (điểm mô phỏng).

## 3. Deploy
```bat
cd C:\Users\mento\Downloads\UNICOACH_Brand_Kit_2\gotcha-web-deploy
git add -A && git commit -m "Add real pronunciation scoring (Azure) + read-and-score coach"
git push
```

## 4. Kiểm tra
- Làm một bài **Thi thử** → tới màn kết quả → phần **Luyện âm** có nút **🎤 Đọc & chấm phát âm**.
- Bấm nút → đọc to câu luyện → bấm **⏹ Dừng & chấm** → hiện điểm phát âm, tô màu từng từ
  (xanh = tốt, vàng = tạm, đỏ = cần sửa) và danh sách **âm cần luyện**.
- Nếu chưa gắn key → góc điểm ghi "(demo)".

## 5. Kỹ thuật & chi phí
- Âm thanh: ghi **WAV 16 kHz mono** ngay trên trình duyệt (AudioContext), gửi base64 → server → Azure REST
  `.../speech/recognition/conversation/cognitiveservices/v1` với header `Pronunciation-Assessment`.
- Trả về chuẩn hoá: `pron, accuracy, fluency, completeness, prosody` (0–100), `band` (quy đổi ~IELTS),
  `words[]` (accuracy + errorType), `weakPhonemes[]`.
- **Câu ngắn (đọc kịch bản)** → audio nhỏ (~vài trăm KB), chấm nhanh & chính xác phoneme nhất; không lo giới hạn payload.
- Chi phí Azure: bậc **F0 miễn phí** ~5 giờ audio/tháng — dư cho beta; S0 tính theo giờ audio.

## 6. Quyền riêng tư (quan trọng)
- Âm thanh học viên được gửi tới Azure để chấm. Cần **thông báo & xin đồng ý** trong trang chính sách
  và ở màn hình trước khi ghi âm (đặc biệt với người dưới 18 tuổi).
- Server **không lưu** file audio (chỉ chuyển tiếp và trả điểm). Nếu muốn lưu để cải thiện mô hình,
  phải nêu rõ trong chính sách và có đồng ý.
- Có thể tự host mô hình sau này để dữ liệu không rời hạ tầng của bạn (giai đoạn sau).

## 7. Mở rộng (giai đoạn sau)
- Chấm phát âm cho **cả bài Thi thử** (Part 2 long-turn) và **quy về band Pronunciation** thật trong thẻ 4 tiêu chí
  (hiện thẻ Pronunciation vẫn là *ước tính gián tiếp*; read-&-score cho điểm thật theo từng câu luyện).
- Đổi vendor dễ dàng: chỉ cần thay phần gọi trong `/api/pronounce.js` (đã tách chuẩn hoá riêng); SpeechAce là lựa chọn thay thế.
