/*
 * CẤU HÌNH KẾT NỐI SUPABASE
 * -------------------------------------------------------------
 * Dán 2 giá trị lấy ở: Supabase → Project Settings → API
 *   - Project URL            (dạng https://xxxx.supabase.co)
 *   - anon / public key      (khóa CÔNG KHAI – an toàn khi để ở đây)
 *
 * TUYỆT ĐỐI KHÔNG dán "service_role" key vào file này.
 * Quyền ghi dữ liệu được bảo vệ bởi Row Level Security + tài khoản
 * quản trị, không phụ thuộc vào việc giấu anon key.
 */
window.SITE_CONFIG = {
  SUPABASE_URL: 'DÁN_PROJECT_URL_VÀO_ĐÂY',
  SUPABASE_ANON_KEY: 'DÁN_ANON_PUBLIC_KEY_VÀO_ĐÂY',
  BUCKET: 'photos'
};
