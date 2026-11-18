/* Hàm tiện ích dùng chung (không phụ thuộc Supabase) */
(function () {
  'use strict';
  var NH = (window.NH = window.NH || {});

  NH.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** Chuỗi sạch: không bao giờ trả về null/undefined/"null"/"undefined". */
  NH.clean = function (v) {
    if (v == null) return '';
    var s = String(v).trim();
    return s === 'null' || s === 'undefined' ? '' : s;
  };

  /** Chỉ cho phép http(s). Trả về '' nếu không hợp lệ. */
  NH.safeUrl = function (u) {
    u = NH.clean(u);
    if (!u) return '';
    try {
      var x = new URL(u);
      return /^https?:$/.test(x.protocol) ? x.href : '';
    } catch (e) {
      return '';
    }
  };

  /** Chuẩn hóa liên kết mạng xã hội người dùng gõ tay. */
  NH.normalizeSocial = function (v, kind) {
    v = NH.clean(v);
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    var digits = v.replace(/[^0-9]/g, '');
    if (kind === 'zalo' && /^[0-9+ .\-]{8,16}$/.test(v)) return 'https://zalo.me/' + digits;
    if (/^@?[A-Za-z0-9._]+$/.test(v)) {
      var h = v.replace(/^@/, '');
      if (kind === 'instagram') return 'https://www.instagram.com/' + h;
      if (kind === 'tiktok') return 'https://www.tiktok.com/@' + h;
      if (kind === 'facebook') return 'https://www.facebook.com/' + h;
    }
    return 'https://' + v.replace(/^\/+/, '');
  };

  NH.pad2 = function (n) { return n < 10 ? '0' + n : String(n); };

  NH.fmtDate = function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(NH.clean(iso));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  };

  NH.paragraphs = function (t) {
    return NH.clean(t).split(/\r?\n\s*\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  };
  NH.lines = function (t) {
    return NH.clean(t).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  };
  NH.nl2br = function (t) { return NH.esc(t).replace(/\r?\n/g, '<br>'); };

  NH.initials = function (name) {
    var w = NH.clean(name).split(/\s+/).filter(Boolean);
    if (!w.length) return '·';
    var a = w[w.length - 1].charAt(0);
    var b = w.length > 1 ? w[0].charAt(0) : '';
    return (b + a).toUpperCase();
  };

  /** Bỏ dấu tiếng Việt + chuẩn hóa thành khóa (dùng cho tên cột CSV, tên file). */
  NH.slug = function (s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  };

  var PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
  NH.isPreview = PREVIEW;

  /** Tạo URL nội bộ; giữ chế độ xem trước. */
  NH.url = function (page, params) {
    var q = [];
    Object.keys(params || {}).forEach(function (k) { q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); });
    if (PREVIEW) q.push('preview=1');
    return page + (q.length ? '?' + q.join('&') : '');
  };

  NH.SOCIALS = [
    { key: 'facebook', label: 'Facebook' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'zalo', label: 'Zalo' },
    { key: 'tiktok', label: 'TikTok' }
  ];

  NH.icons = {
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/></svg>',
    zalo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5C6.8 2.5 2.5 6 2.5 10.4c0 2.4 1.2 4.5 3.2 6-.1 1-.6 2.1-1.5 3.1 1.8-.1 3.2-.8 4.1-1.4 1 .3 2.1.4 3.2.4 5.2 0 9.5-3.5 9.5-7.9S17.2 2.5 12 2.500z"/><text x="12" y="12.6" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="6.5" fill="#FFF8E9">Zalo</text></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>'
  };

  /** Danh sách mạng xã hội CÓ liên kết hợp lệ từ một object (prefix 'social_'). */
  NH.socialList = function (obj) {
    var out = [];
    NH.SOCIALS.forEach(function (s) {
      var href = NH.safeUrl(obj && obj['social_' + s.key]);
      if (href) out.push({ key: s.key, label: s.label, href: href });
    });
    return out;
  };

  NH.socialsHTML = function (obj, cls) {
    var list = NH.socialList(obj);
    if (!list.length) return '';
    return '<ul class="socials ' + (cls || '') + '">' + list.map(function (s) {
      return '<li><a class="social-btn" href="' + NH.esc(s.href) + '" target="_blank" rel="noopener noreferrer" aria-label="' +
        s.label + '" title="' + s.label + '">' + NH.icons[s.key] + '</a></li>';
    }).join('') + '</ul>';
  };
})();
