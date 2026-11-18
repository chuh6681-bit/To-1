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
  SUPABASE_URL: 'https://nqgidoscyoddkbfpdcbo.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xZ2lkb3NjeW9kZGtiZnBkY2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMDE0MzIsImV4cCI6MjExMDU3NzQzMn0.tBaIDQkoDx1n69MLN2oovLpqWid1fS9T5GOmZN88x04',
  BUCKET: 'photos'
};
