-- =====================================================================
--  SCHEMA CHO WEBSITE GIỚI THIỆU NHÓM  (chạy toàn bộ file này trong
--  Supabase → SQL Editor → New query → Run)
--  File này có thể chạy lại nhiều lần mà không làm mất dữ liệu.
-- =====================================================================

-- 1) Bảng danh sách quản trị viên --------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
-- Không tạo policy nào => không ai đọc/ghi được bảng này qua API công khai.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2) Cài đặt chung của website (luôn đúng 1 dòng, id = 1) --------------
create table if not exists public.site_settings (
  id               int primary key default 1 check (id = 1),
  group_name       text not null default '' check (char_length(group_name) <= 120),
  class_name       text check (char_length(class_name) <= 80),
  slogan           text check (char_length(slogan) <= 200),
  intro_short      text check (char_length(intro_short) <= 600),
  about_content    text check (char_length(about_content) <= 6000),
  about_photo_path text check (char_length(about_photo_path) <= 300),
  shared_message   text check (char_length(shared_message) <= 1500),
  contact_email    text check (char_length(contact_email) <= 200),
  contact_phone    text check (char_length(contact_phone) <= 40),
  contact_address  text check (char_length(contact_address) <= 300),
  contact_note     text check (char_length(contact_note) <= 800),
  social_facebook  text check (char_length(social_facebook) <= 500 and (social_facebook is null or social_facebook ~* '^https?://')),
  social_instagram text check (char_length(social_instagram) <= 500 and (social_instagram is null or social_instagram ~* '^https?://')),
  social_zalo      text check (char_length(social_zalo) <= 500 and (social_zalo is null or social_zalo ~* '^https?://')),
  social_tiktok    text check (char_length(social_tiktok) <= 500 and (social_tiktok is null or social_tiktok ~* '^https?://')),
  updated_at       timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- 3) Thành viên ---------------------------------------------------------
create table if not exists public.members (
  id               uuid primary key default gen_random_uuid(),
  sort_order       int  not null default 0,
  full_name        text not null check (char_length(btrim(full_name)) between 1 and 100),
  nickname         text check (char_length(nickname) <= 60),
  birthday         date,
  zodiac           text check (char_length(zodiac) <= 30),
  fav_food         text check (char_length(fav_food) <= 300),
  fav_color        text check (char_length(fav_color) <= 300),
  fav_music        text check (char_length(fav_music) <= 300),
  other_hobbies    text check (char_length(other_hobbies) <= 600),
  family           text check (char_length(family) <= 1500),
  dream            text check (char_length(dream) <= 1500),
  fun_facts        text check (char_length(fun_facts) <= 2000),
  social_facebook  text check (char_length(social_facebook) <= 500 and (social_facebook is null or social_facebook ~* '^https?://')),
  social_instagram text check (char_length(social_instagram) <= 500 and (social_instagram is null or social_instagram ~* '^https?://')),
  social_zalo      text check (char_length(social_zalo) <= 500 and (social_zalo is null or social_zalo ~* '^https?://')),
  social_tiktok    text check (char_length(social_tiktok) <= 500 and (social_tiktok is null or social_tiktok ~* '^https?://')),
  avatar_path      text check (char_length(avatar_path) <= 300),
  avatar_focus_y   int  not null default 25 check (avatar_focus_y between 0 and 100),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists members_sort_idx on public.members (sort_order, created_at);

-- 4) Album ảnh ----------------------------------------------------------
create table if not exists public.member_photos (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  path       text not null check (char_length(path) <= 300),
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists member_photos_member_idx on public.member_photos (member_id, sort_order);

-- 5) Tự cập nhật updated_at --------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch_site on public.site_settings;
create trigger trg_touch_site before update on public.site_settings
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_members on public.members;
create trigger trg_touch_members before update on public.members
  for each row execute function public.touch_updated_at();

-- 6) Row Level Security --------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.members       enable row level security;
alter table public.member_photos enable row level security;

drop policy if exists "doc_cong_khai" on public.site_settings;
drop policy if exists "doc_cong_khai" on public.members;
drop policy if exists "doc_cong_khai" on public.member_photos;
drop policy if exists "quan_tri_ghi"  on public.site_settings;
drop policy if exists "quan_tri_ghi"  on public.members;
drop policy if exists "quan_tri_ghi"  on public.member_photos;

-- Khách truy cập: chỉ ĐỌC
create policy "doc_cong_khai" on public.site_settings for select using (true);
create policy "doc_cong_khai" on public.members       for select using (true);
create policy "doc_cong_khai" on public.member_photos for select using (true);

-- Quản trị viên: thêm / sửa / xóa
create policy "quan_tri_ghi" on public.site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "quan_tri_ghi" on public.members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "quan_tri_ghi" on public.member_photos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 7) Storage: bucket ảnh công khai, tối đa 5 MB, chỉ JPG/PNG/WebP ------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "photos_admin_select" on storage.objects;
drop policy if exists "photos_admin_insert" on storage.objects;
drop policy if exists "photos_admin_update" on storage.objects;
drop policy if exists "photos_admin_delete" on storage.objects;

-- Ảnh trong bucket công khai vẫn xem được bằng đường dẫn; chỉ quản trị viên được liệt kê/ghi/xóa.
create policy "photos_admin_select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_admin());
create policy "photos_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin());
create policy "photos_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_admin())
  with check (bucket_id = 'photos' and public.is_admin());
create policy "photos_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());
