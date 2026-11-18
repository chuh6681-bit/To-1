/* Kết nối Supabase + tải dữ liệu công khai */
(function () {
  'use strict';
  var cfg = window.SITE_CONFIG || {};
  var NH = (window.NH = window.NH || {});

  NH.BUCKET = cfg.BUCKET || 'photos';
  NH.configured =
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(cfg.SUPABASE_URL || '') &&
    String(cfg.SUPABASE_ANON_KEY || '').length > 30;
  NH.sb = null;

  if (NH.configured && window.supabase && window.supabase.createClient) {
    NH.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  }

  NH.publicUrl = function (path) {
    if (!path || !NH.sb) return '';
    return NH.sb.storage.from(NH.BUCKET).getPublicUrl(path).data.publicUrl;
  };

  function check(r) { if (r.error) throw r.error; return r.data; }

  /**
   * Trả về { site, members:[{..., avatar_url, photos:[{id,url}]}] }.
   * Ở chế độ xem trước (?preview=1) ưu tiên bản nháp trong sessionStorage.
   */
  NH.loadAll = async function () {
    if (NH.isPreview) {
      try {
        var d = JSON.parse(sessionStorage.getItem('nh_draft') || 'null');
        if (d && d.site && Array.isArray(d.members)) return d;
      } catch (e) { /* bỏ qua, dùng dữ liệu thật */ }
    }
    if (!NH.configured) throw new Error('NOT_CONFIGURED');
    if (!NH.sb) throw new Error('NO_LIBRARY');

    var res = await Promise.all([
      NH.sb.from('site_settings').select('*').eq('id', 1).maybeSingle(),
      NH.sb.from('members').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      NH.sb.from('member_photos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    ]);
    var site = check(res[0]) || {};
    var members = check(res[1]) || [];
    var photos = check(res[2]) || [];

    site.about_photo_url = NH.publicUrl(site.about_photo_path);
    members = members.map(function (m) {
      m.avatar_url = NH.publicUrl(m.avatar_path);
      m.photos = photos
        .filter(function (p) { return p.member_id === m.id; })
        .map(function (p) { return { id: p.id, url: NH.publicUrl(p.path) }; });
      return m;
    });
    return { site: site, members: members };
  };
})();
