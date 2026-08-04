// Hỏi UNICOACH LMS xem email này đã có tài khoản đang hoạt động chưa.
// Dùng cho nút "Đăng nhập bằng Google": Precisely KHÔNG tự mở tài khoản cho người lạ.
const LMS = (process.env.UNICOACH_LMS_URL || "https://unicoach-bms-production.up.railway.app").replace(/\/+$/, "");

/**
 * @returns {Promise<{found:boolean, name?:string, role?:string, student_code?:string|null, offline?:boolean}>}
 *   offline=true nghĩa là KHÔNG hỏi được LMS (chưa cấu hình khóa, hoặc LMS đang lỗi/chậm)
 *   — người gọi tự quyết định, mặc định nên từ chối cho an toàn.
 */
export async function lookupLmsUser(email) {
  const apiKey = process.env.UNICOACH_API_KEY;
  if (!apiKey || !email) return { found: false, offline: true };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${LMS}/api/v1/lookup-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ email: String(email).trim().toLowerCase() }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (r.status === 404) return { found: false };
    if (!r.ok) { console.error("[lms-lookup] HTTP", r.status); return { found: false, offline: true }; }
    return await r.json();
  } catch (e) {
    console.error("[lms-lookup]", e?.message);
    return { found: false, offline: true };
  }
}
