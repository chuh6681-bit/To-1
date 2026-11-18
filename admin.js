/* Trang quản trị: đăng nhập (Supabase Auth), quản lý nội dung & thành viên,
   xem trước bản nháp, lưu lên Supabase (Database + Storage). */
(function () {
  'use strict';
  var NH = window.NH, esc = NH.esc, clean = NH.clean;
  var sb = NH.sb, BUCKET = NH.BUCKET;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = { site: null, members: [], dirty: false, busy: false };
  var server = null; // ảnh chụp dữ liệu đã lưu trên Supabase (để biết cái gì bị xóa/thay)

  var ZODIAC = ['Bạch Dương', 'Kim Ngưu', 'Song Tử', 'Cự Giải', 'Sư Tử', 'Xử Nữ', 'Thiên Bình', 'Bọ Cạp', 'Nhân Mã', 'Ma Kết', 'Bảo Bình', 'Song Ngư'];
  var SOCIAL_KEYS = ['facebook', 'instagram', 'zalo', 'tiktok'];

  /* ======================= Tiện ích giao diện ======================= */
  function show(id) {
    ['view-boot', 'view-login', 'view-denied', 'view-app'].forEach(function (v) { $('#' + v).hidden = v !== id; });
  }

  var toastSeq = 0;
  function toast(type, msg, opts) {
    opts = opts || {};
    var id = opts.id || 't' + (++toastSeq);
    var el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; $('#toasts').appendChild(el); }
    var icon = { ok: '✓', err: '✕', busy: '…', info: 'ℹ' }[type] || 'ℹ';
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'err' ? 'alert' : 'status');
    el.innerHTML = '<span class="ic">' + icon + '</span><span class="msg">' + esc(msg) + '</span><button class="x" type="button" aria-label="Đóng">✕</button>';
    el.querySelector('.x').onclick = function () { el.remove(); };
    clearTimeout(el._t);
    if (type !== 'busy') el._t = setTimeout(function () { el.remove(); }, type === 'err' ? 9000 : 5000);
    return id;
  }
  function closeToast(id) { var e = document.getElementById(id); if (e) e.remove(); }

  function markDirty(v) {
    state.dirty = v !== false;
    $('#dirty-flag').hidden = !state.dirty;
  }
  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  function confirmBox(msg, okLabel, danger) {
    return new Promise(function (resolve) {
      var m = openModal('<div class="modal-card" role="alertdialog" aria-modal="true" style="max-width:480px;margin:auto">' +
        '<div class="modal-head"><h2>Xác nhận</h2></div><div class="modal-body"><p style="margin:0">' + esc(msg) + '</p></div>' +
        '<div class="modal-foot"><button class="btn" data-no type="button">HỦY</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-solid') + '" data-yes type="button">' + esc(okLabel || 'ĐỒNG Ý') + '</button></div></div>');
      m.el.querySelector('[data-no]').onclick = function () { m.close(); resolve(false); };
      m.el.querySelector('[data-yes]').onclick = function () { m.close(); resolve(true); };
      m.el.querySelector('[data-no]').focus();
    });
  }

  function openModal(html) {
    var el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = html;
    $('#modal-root').appendChild(el);
    document.body.classList.add('lb-open');
    return {
      el: el,
      close: function () { el.remove(); if (!$('#modal-root').children.length) document.body.classList.remove('lb-open'); }
    };
  }

  /* ======================= Xử lý ảnh ======================= */
  function readableError(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/row-level security|violates row-level|not authorized|permission denied|new row violates/i.test(m)) return 'Không có quyền ghi dữ liệu (phiên đăng nhập hết hạn hoặc tài khoản chưa là quản trị viên).';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Mất kết nối Internet.';
    if (/mime|not allowed/i.test(m)) return 'Loại tệp không được chấp nhận.';
    if (/size|too large|exceeded/i.test(m)) return 'Tệp vượt quá dung lượng cho phép.';
    return m;
  }

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('Không đọc được ảnh "' + file.name + '".')); };
      im.src = u;
    });
  }
  function toBlob(canvas, type, q) { return new Promise(function (r) { canvas.toBlob(r, type, q); }); }

  /** Kiểm tra loại + dung lượng, thu nhỏ & nén ảnh trước khi tải lên. */
  async function processImage(file, maxDim) {
    var okType = /^image\/(jpeg|png|webp)$/.test(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!okType) throw new Error('"' + file.name + '": chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
    if (file.size > 25 * 1024 * 1024) throw new Error('"' + file.name + '": ảnh quá lớn (tối đa 25 MB).');
    var bmp = await loadBitmap(file);
    var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    var k = Math.min(1, maxDim / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    var blob = await toBlob(c, 'image/webp', 0.85);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(c, 'image/jpeg', 0.88);
    if (!blob) throw new Error('Không xử lý được ảnh "' + file.name + '".');
    if (blob.size > 5 * 1024 * 1024) throw new Error('"' + file.name + '": ảnh sau khi nén vẫn lớn hơn 5 MB.');
    return { blob: blob, url: URL.createObjectURL(blob), ext: blob.type === 'image/webp' ? 'webp' : 'jpg', uploaded: false };
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  /* ======================= Dữ liệu ======================= */
  async function fetchServer() {
    var r = await Promise.all([
      sb.from('site_settings').select('*').eq('id', 1).maybeSingle(),
      sb.from('members').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      sb.from('member_photos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    ]);
    r.forEach(function (x) { if (x.error) throw x.error; });
    var site = r[0].data || { id: 1 };
    site.photo = site.about_photo_path ? { path: site.about_photo_path, url: NH.publicUrl(site.about_photo_path) } : null;
    var photos = r[2].data;
    var members = r[1].data.map(function (m) {
      m.avatar = m.avatar_path ? { path: m.avatar_path, url: NH.publicUrl(m.avatar_path) } : null;
      m.photos = photos.filter(function (p) { return p.member_id === m.id; })
        .map(function (p) { return { id: p.id, path: p.path, url: NH.publicUrl(p.path) }; });
      return m;
    });
    return { site: site, members: members };
  }

  function cloneData(d) {
    return {
      site: Object.assign({}, d.site),
      members: d.members.map(function (m) { return Object.assign({}, m, { photos: m.photos.map(function (p) { return Object.assign({}, p); }) }); })
    };
  }

  async function loadState() {
    server = await fetchServer();
    var c = cloneData(server);
    state.site = c.site; state.members = c.members;
    markDirty(false);
    renderAll();
  }

  /* ======================= Xác thực ======================= */
  async function boot() {
    if (!NH.configured || !sb) {
      show('view-login');
      var er = $('#login-error');
      er.hidden = false;
      er.textContent = !NH.configured
        ? 'Website chưa được kết nối Supabase. Hãy điền js/config.js trước (xem HUONG-DAN.md).'
        : 'Không tải được thư viện Supabase. Kiểm tra kết nối Internet rồi tải lại trang.';
      $('#login-btn').disabled = true;
      return;
    }
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'SIGNED_OUT') { show('view-login'); }
    });
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) await enter(); else show('view-login');
  }

  async function enter() {
    show('view-boot');
    var r = await sb.rpc('is_admin');
    if (r.error || r.data !== true) { show('view-denied'); return; }
    try {
      await loadState();
      show('view-app');
    } catch (e) {
      show('view-app');
      toast('err', 'Không tải được dữ liệu: ' + readableError(e));
    }
  }

  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#login-email').value.trim(), pass = $('#login-pass').value;
    var er = $('#login-error'); er.hidden = true;
    if (!email || !pass) { er.hidden = false; er.textContent = 'Vui lòng nhập email và mật khẩu.'; return; }
    var btn = $('#login-btn'); btn.disabled = true; btn.textContent = 'ĐANG ĐĂNG NHẬP…';
    var r = await sb.auth.signInWithPassword({ email: email, password: pass });
    btn.disabled = false; btn.textContent = 'ĐĂNG NHẬP';
    if (r.error) {
      er.hidden = false;
      er.textContent = /invalid login/i.test(r.error.message) ? 'Sai email hoặc mật khẩu.' : 'Đăng nhập thất bại: ' + readableError(r.error);
      return;
    }
    $('#login-pass').value = '';
    await enter();
  });

  async function logout() {
    if (state.dirty && !(await confirmBox('Bạn có thay đổi chưa lưu. Đăng xuất sẽ làm mất các thay đổi này. Tiếp tục?', 'ĐĂNG XUẤT', true))) return;
    markDirty(false);
    await sb.auth.signOut();
    show('view-login');
  }
  $('#btn-logout').onclick = logout;
  $('#denied-out').onclick = function () { sb.auth.signOut().then(function () { show('view-login'); }); };

  /* ======================= Tab nội dung website ======================= */
  var SITE_SECTIONS = [
    { title: 'Trang chủ', fields: [
      { k: 'group_name', l: 'Tên nhóm', t: 'text', max: 120, req: true },
      { k: 'class_name', l: 'Lớp', t: 'text', max: 80 },
      { k: 'slogan', l: 'Slogan', t: 'text', max: 200 },
      { k: 'intro_short', l: 'Giới thiệu ngắn (hiện ở trang chủ)', t: 'textarea', max: 600 }
    ] },
    { title: 'Trang Giới thiệu', fields: [
      { k: 'photo', l: 'Ảnh tập thể', t: 'photo' },
      { k: 'about_content', l: 'Nội dung giới thiệu đầy đủ', t: 'textarea', max: 6000, rows: 9, hint: 'Để trống một dòng giữa hai đoạn để tách đoạn mới.' },
      { k: 'shared_message', l: 'Thông điệp chung của các thành viên', t: 'textarea', max: 1500 }
    ] },
    { title: 'Trang Liên hệ', fields: [
      { k: 'contact_email', l: 'Email liên hệ', t: 'email', max: 200 },
      { k: 'contact_phone', l: 'Số điện thoại', t: 'text', max: 40 },
      { k: 'contact_address', l: 'Địa chỉ', t: 'textarea', max: 300, rows: 3 },
      { k: 'contact_note', l: 'Lời nhắn / lời cảm ơn', t: 'textarea', max: 800 },
      { k: 'social_facebook', l: 'Facebook chung của nhóm', t: 'text', max: 500, hint: 'Dán đường dẫn đầy đủ. Để trống nếu không có.' },
      { k: 'social_instagram', l: 'Instagram chung', t: 'text', max: 500 },
      { k: 'social_zalo', l: 'Zalo chung', t: 'text', max: 500, hint: 'Đường dẫn hoặc số điện thoại Zalo.' },
      { k: 'social_tiktok', l: 'TikTok chung', t: 'text', max: 500 }
    ] }
  ];

  function fieldHTML(f, val, pre) {
    var id = pre + f.k;
    var attrs = ' id="' + id + '" data-k="' + f.k + '"' + (f.max ? ' maxlength="' + f.max + '"' : '');
    var label = '<span>' + esc(f.l) + (f.req ? ' <b class="req">*</b>' : '') + '</span>';
    var hint = f.hint ? '<small>' + esc(f.hint) + '</small>' : '';
    var v = esc(clean(val));
    if (f.t === 'textarea') return '<label class="fld" for="' + id + '">' + label + '<textarea' + attrs + ' rows="' + (f.rows || 4) + '">' + v + '</textarea>' + hint + '</label>';
    if (f.t === 'select') return '<label class="fld" for="' + id + '">' + label + '<select' + attrs + '><option value="">— Không chọn —</option>' +
      f.opts.map(function (o) { return '<option' + (o === clean(val) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' + hint + '</label>';
    return '<label class="fld" for="' + id + '">' + label + '<input' + attrs + ' type="' + (f.t === 'date' ? 'date' : f.t === 'email' ? 'email' : 'text') + '" value="' + v + '">' + hint + '</label>';
  }

  function photoFieldHTML(label, item, key) {
    return '<div class="fld"><span>' + esc(label) + '</span><div class="photo-field">' +
      '<div class="photo-thumb" id="thumb-' + key + '">' + (item ? '<img src="' + esc(item.url) + '" alt="">' : 'Chưa có ảnh') + '</div>' +
      '<div class="photo-btns"><label class="btn btn-sm" for="file-' + key + '">' + (item ? 'ĐỔI ẢNH' : 'CHỌN ẢNH') + '</label>' +
      '<input class="sr-file" id="file-' + key + '" data-photo="' + key + '" type="file" accept="image/jpeg,image/png,image/webp">' +
      (item ? '<button type="button" class="btn btn-sm btn-danger" data-remove="' + key + '">GỠ ẢNH</button>' : '') + '</div></div>' +
      '<small>JPG, PNG hoặc WebP. Ảnh được tự thu nhỏ và nén trước khi tải lên.</small></div>';
  }

  function renderSiteTab() {
    $('#tab-site').innerHTML = SITE_SECTIONS.map(function (sec) {
      var body = sec.fields.map(function (f) {
        if (f.t === 'photo') return photoFieldHTML(f.l, state.site.photo, 'site');
        return fieldHTML(f, state.site[f.k], 's-');
      });
      // ghép các trường ngắn thành 2 cột
      return '<section class="adm-card"><h2>' + sec.title + '</h2>' + body.join('') + '</section>';
    }).join('');
  }

  $('#tab-site').addEventListener('input', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-k');
    if (!k) return;
    state.site[k] = e.target.value;
    e.target.closest('.fld').classList.remove('has-error');
    markDirty();
  });
  $('#tab-site').addEventListener('change', async function (e) {
    if (!e.target.matches || !e.target.matches('input[data-photo="site"]')) return;
    var f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { state.site.photo = await processImage(f, 1800); markDirty(); renderSiteTab(); toast('info', 'Đã chọn ảnh. Nhấn LƯU để tải lên và công khai.'); }
    catch (err) { toast('err', err.message); }
  });
  $('#tab-site').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-remove="site"]');
    if (b) { state.site.photo = null; markDirty(); renderSiteTab(); }
  });

  /* ======================= Tab thành viên ======================= */
  function renderMembersTab() {
    $('#member-count').textContent = state.members.length;
    var h = '<div class="m-toolbar"><button class="btn btn-solid btn-sm" data-act="add" type="button">+ THÊM THÀNH VIÊN</button>' +
      '<button class="btn btn-sm" data-act="import" type="button">NHẬP HÀNG LOẠT TỪ BẢNG</button></div>';
    if (!state.members.length) {
      h += '<div class="empty-list"><p><strong>Chưa có thành viên nào.</strong></p><p>Nhấn “Thêm thành viên” hoặc “Nhập hàng loạt từ bảng” để bắt đầu.</p></div>';
    } else {
      h += '<ol class="m-list">' + state.members.map(function (m, i) {
        var isNew = !server.members.some(function (s) { return s.id === m.id; });
        return '<li class="m-row' + (isNew ? ' is-new' : '') + '" data-id="' + m.id + '"><span class="m-no">' + NH.pad2(i + 1) + '</span>' +
          '<span class="m-thumb">' + (m.avatar ? '<img src="' + esc(m.avatar.url) + '" alt="">' : esc(NH.initials(m.full_name))) + '</span>' +
          '<span class="m-info"><strong>' + esc(clean(m.full_name) || '(chưa có tên)') + '</strong><span>' +
          esc(clean(m.nickname) ? 'Biệt danh: ' + m.nickname : 'Chưa có biệt danh') + ' · ' + m.photos.length + ' ảnh album' + (isNew ? ' · <mới, chưa lưu>' : '') + '</span></span>' +
          '<span class="m-btns"><button class="btn btn-sm" data-act="up" aria-label="Chuyển lên" ' + (i === 0 ? 'disabled' : '') + ' type="button">↑</button>' +
          '<button class="btn btn-sm" data-act="down" aria-label="Chuyển xuống" ' + (i === state.members.length - 1 ? 'disabled' : '') + ' type="button">↓</button>' +
          '<button class="btn btn-sm" data-act="edit" type="button">SỬA</button>' +
          '<button class="btn btn-sm btn-danger" data-act="del" type="button">XÓA</button></span></li>';
      }).join('') + '</ol>';
    }
    $('#tab-members').innerHTML = h;
  }

  $('#tab-members').addEventListener('click', async function (e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act');
    if (act === 'add') return openMemberForm(null);
    if (act === 'import') return openImport();
    var row = b.closest('.m-row'); if (!row) return;
    var id = row.getAttribute('data-id');
    var i = state.members.findIndex(function (m) { return m.id === id; });
    if (i < 0) return;
    if (act === 'edit') return openMemberForm(state.members[i]);
    if (act === 'up' || act === 'down') {
      var j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= state.members.length) return;
      var t = state.members[i]; state.members[i] = state.members[j]; state.members[j] = t;
      markDirty(); renderMembersTab();
      var nb = $('.m-row[data-id="' + id + '"] [data-act="' + act + '"]'); if (nb && !nb.disabled) nb.focus();
    }
    if (act === 'del') {
      var nm = clean(state.members[i].full_name) || 'thành viên này';
      if (await confirmBox('Xóa “' + nm + '” cùng toàn bộ ảnh và hồ sơ? Việc xóa chỉ có hiệu lực khi bạn nhấn LƯU.', 'XÓA', true)) {
        state.members.splice(i, 1); markDirty(); renderMembersTab();
        toast('info', 'Đã đánh dấu xóa “' + nm + '”. Nhấn LƯU để xác nhận xóa thật sự.');
      }
    }
  });

  var MEMBER_FIELDS = {
    basic: [
      { k: 'full_name', l: 'Họ và tên', t: 'text', max: 100, req: true },
      { k: 'nickname', l: 'Biệt danh', t: 'text', max: 60 },
      { k: 'birthday', l: 'Ngày sinh', t: 'date' },
      { k: 'zodiac', l: 'Cung hoàng đạo', t: 'select', opts: ZODIAC, hint: 'Tự chọn theo ngày sinh nếu để trống; có thể đổi tay.' }
    ],
    hobby: [
      { k: 'fav_food', l: 'Món ăn yêu thích', t: 'text', max: 300 },
      { k: 'fav_color', l: 'Màu sắc yêu thích', t: 'text', max: 300 },
      { k: 'fav_music', l: 'Thể loại nhạc yêu thích', t: 'text', max: 300 },
      { k: 'other_hobbies', l: 'Những sở thích khác', t: 'textarea', max: 600, rows: 3 }
    ],
    more: [
      { k: 'family', l: 'Gia đình (không bắt buộc)', t: 'textarea', max: 1500, rows: 3, hint: 'Để trống thì mục Gia đình tự ẩn trên hồ sơ.' },
      { k: 'dream', l: 'Ước mơ và mục tiêu', t: 'textarea', max: 1500, rows: 3 },
      { k: 'fun_facts', l: 'Những điều thú vị về tôi (không bắt buộc)', t: 'textarea', max: 2000, rows: 5, hint: 'Mỗi dòng là một điều. Để trống thì mục này tự ẩn.' }
    ],
    social: SOCIAL_KEYS.map(function (s) { return { k: 'social_' + s, l: { facebook: 'Facebook', instagram: 'Instagram', zalo: 'Zalo', tiktok: 'TikTok' }[s], t: 'text', max: 500, hint: s === 'zalo' ? 'Đường dẫn hoặc số điện thoại Zalo.' : 'Đường dẫn trang cá nhân. Để trống thì biểu tượng tự ẩn.' }; })
  };

  function zodiacOf(iso) {
    var m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return '';
    var mo = +m[1], d = +m[2];
    var cut = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22]; // ngày bắt đầu của cung kế tiếp theo tháng
    // thứ tự theo tháng 1..12: Ma Kết/Bảo Bình, Bảo Bình/Song Ngư, ...
    var names = ['Ma Kết', 'Bảo Bình', 'Song Ngư', 'Bạch Dương', 'Kim Ngưu', 'Song Tử', 'Cự Giải', 'Sư Tử', 'Xử Nữ', 'Thiên Bình', 'Bọ Cạp', 'Nhân Mã', 'Ma Kết'];
    return d < cut[mo - 1] ? names[mo - 1] : names[mo];
  }

  function openMemberForm(member) {
    var isNew = !member;
    var ed = isNew
      ? { id: uuid(), full_name: '', avatar: null, avatar_focus_y: 25, photos: [] }
      : Object.assign({}, member, { photos: member.photos.slice() });

    var sec = function (t) { return '<h3 class="sec-title">' + t + '</h3>'; };
    var grid = function (arr) { return '<div class="adm-grid2">' + arr.map(function (f) { return fieldHTML(f, ed[f.k], 'm-'); }).join('') + '</div>'; };
    var m = openModal('<div class="modal-card" role="dialog" aria-modal="true" aria-label="Hồ sơ thành viên">' +
      '<div class="modal-head"><h2>' + (isNew ? 'Thêm thành viên' : 'Sửa hồ sơ') + '</h2><button class="btn btn-sm" data-close type="button">ĐÓNG</button></div>' +
      '<form class="modal-body" novalidate>' +
      sec('Thông tin cơ bản') + grid(MEMBER_FIELDS.basic) +
      '<div id="ph-avatar"></div>' +
      sec('Sở thích') + grid(MEMBER_FIELDS.hobby) +
      sec('Gia đình, ước mơ, điều thú vị') + MEMBER_FIELDS.more.map(function (f) { return fieldHTML(f, ed[f.k], 'm-'); }).join('') +
      sec('Mạng xã hội') + grid(MEMBER_FIELDS.social) +
      sec('Album ảnh') + '<div id="ph-album"></div>' +
      '<p id="mf-error" class="form-error" role="alert" hidden></p></form>' +
      '<div class="modal-foot"><button class="btn" data-close type="button">HỦY</button><button class="btn btn-solid" data-apply type="button">ÁP DỤNG VÀO BẢN NHÁP</button></div></div>');

    function paintAvatar() {
      $('#ph-avatar', m.el).innerHTML = photoFieldHTML('Ảnh đại diện (ảnh chính)', ed.avatar, 'avatar') +
        (ed.avatar ? '<div class="fld focus-row"><span>Vị trí khung ảnh (để không cắt mất khuôn mặt)</span>' +
          '<input type="range" min="0" max="100" value="' + (+ed.avatar_focus_y || 0) + '" id="m-focus" aria-label="Vị trí khung ảnh từ trên xuống dưới"><small>Kéo để chọn phần trên ↔ dưới của ảnh được giữ lại khi ảnh bị cắt khung.</small></div>' : '');
    }
    function paintAlbum() {
      $('#ph-album', m.el).innerHTML =
        '<ul class="album-edit">' + ed.photos.map(function (p, i) {
          return '<li><img src="' + esc(p.url) + '" alt="Ảnh album ' + (i + 1) + '">' + (p.blob ? '<span class="tag-new">MỚI</span>' : '') +
            '<button type="button" data-rm="' + i + '" aria-label="Xóa ảnh ' + (i + 1) + ' khỏi album">✕</button></li>';
        }).join('') + '</ul>' +
        '<div><label class="btn btn-sm" for="file-album">+ THÊM ẢNH VÀO ALBUM</label>' +
        '<input class="sr-file" id="file-album" type="file" multiple accept="image/jpeg,image/png,image/webp"></div>' +
        '<small class="muted">' + ed.photos.length + ' ảnh trong album.</small>';
    }
    paintAvatar(); paintAlbum();

    m.el.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-k');
      if (k) {
        ed[k] = e.target.value;
        e.target.closest('.fld').classList.remove('has-error');
        if (k === 'birthday' && !clean(ed.zodiac)) {
          var z = zodiacOf(ed.birthday);
          if (z) { ed.zodiac = z; var sel = $('#m-zodiac', m.el); if (sel) sel.value = z; }
        }
      } else if (e.target.id === 'm-focus') ed.avatar_focus_y = +e.target.value;
    });
    m.el.addEventListener('change', async function (e) {
      var t = e.target;
      if (t.id === 'file-avatar') {
        var f = t.files[0]; t.value = ''; if (!f) return;
        try { ed.avatar = await processImage(f, 1600); paintAvatar(); } catch (err) { toast('err', err.message); }
      } else if (t.id === 'file-album') {
        var files = Array.prototype.slice.call(t.files); t.value = '';
        var tid = toast('busy', 'Đang xử lý ảnh…', { id: 'proc' });
        for (var i = 0; i < files.length; i++) {
          try { ed.photos.push(await processImage(files[i], 1800)); } catch (err2) { toast('err', err2.message); }
        }
        closeToast(tid); paintAlbum();
      }
    });
    m.el.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-close]')) return m.close();
      var rm = t.closest('[data-rm]');
      if (rm) { ed.photos.splice(+rm.getAttribute('data-rm'), 1); paintAlbum(); return; }
      if (t.closest('[data-remove="avatar"]')) { ed.avatar = null; paintAvatar(); return; }
      if (t.closest('[data-apply]')) {
        var err = $('#mf-error', m.el);
        if (!clean(ed.full_name)) {
          err.hidden = false; err.textContent = 'Thiếu thông tin bắt buộc: Họ và tên.';
          var inp = $('#m-full_name', m.el); inp.closest('.fld').classList.add('has-error'); inp.focus();
          toast('err', 'Thiếu thông tin bắt buộc: Họ và tên.');
          return;
        }
        for (var s = 0; s < SOCIAL_KEYS.length; s++) {
          var key = 'social_' + SOCIAL_KEYS[s], v = clean(ed[key]);
          if (v && !NH.safeUrl(NH.normalizeSocial(v, SOCIAL_KEYS[s]))) {
            err.hidden = false; err.textContent = 'Liên kết ' + SOCIAL_KEYS[s] + ' không hợp lệ.';
            $('#m-' + key, m.el).focus(); return;
          }
        }
        if (isNew) state.members.push(ed);
        else { var ix = state.members.findIndex(function (x) { return x.id === ed.id; }); if (ix >= 0) state.members[ix] = ed; }
        markDirty(); renderMembersTab(); m.close();
        toast('info', 'Đã cập nhật bản nháp. Nhấn XEM TRƯỚC để kiểm tra, rồi nhấn LƯU để công khai.');
      }
    });
    $('#m-full_name', m.el).focus();
  }

  /* ======================= Nhập hàng loạt ======================= */
  var CSV_ALIASES = {
    full_name: ['ho_ten', 'ho_va_ten', 'ten', 'full_name', 'name'],
    nickname: ['biet_danh', 'nickname'],
    birthday: ['ngay_sinh', 'sinh_nhat', 'birthday'],
    zodiac: ['cung_hoang_dao', 'cung', 'zodiac'],
    fav_food: ['mon_an', 'mon_an_yeu_thich'],
    fav_color: ['mau_sac', 'mau_yeu_thich', 'mau_sac_yeu_thich'],
    fav_music: ['am_nhac', 'the_loai_nhac', 'the_loai_nhac_yeu_thich'],
    other_hobbies: ['so_thich_khac', 'so_thich'],
    family: ['gia_dinh'],
    dream: ['uoc_mo', 'uoc_mo_muc_tieu', 'muc_tieu'],
    fun_facts: ['dieu_thu_vi', 'fun_facts'],
    social_facebook: ['facebook'], social_instagram: ['instagram'], social_zalo: ['zalo'], social_tiktok: ['tiktok'],
    avatar_file: ['anh_dai_dien', 'anh', 'avatar'],
    album_files: ['anh_album', 'album']
  };
  var CSV_HEADER = ['ho_ten', 'biet_danh', 'ngay_sinh', 'cung_hoang_dao', 'mon_an', 'mau_sac', 'am_nhac', 'so_thich_khac', 'gia_dinh', 'uoc_mo', 'dieu_thu_vi', 'facebook', 'instagram', 'zalo', 'tiktok', 'anh_dai_dien', 'anh_album'];

  function parseDelimited(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var delim = [',', ';', '\t'].map(function (d) { return [d, first.split(d).length - 1]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
  }

  function parseBirthday(s) {
    s = clean(s); if (!s) return { v: '' };
    var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s), y, mo, d;
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return { v: '', bad: true };
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { v: '', bad: true };
    return { v: y + '-' + NH.pad2(mo) + '-' + NH.pad2(d) };
  }

  function openImport() {
    var imp = { rows: [], files: {}, ready: false };
    var m = openModal('<div class="modal-card" role="dialog" aria-modal="true" aria-label="Nhập hàng loạt">' +
      '<div class="modal-head"><h2>Nhập hàng loạt từ bảng</h2><button class="btn btn-sm" data-close type="button">ĐÓNG</button></div>' +
      '<div class="modal-body">' +
      '<div class="help-box"><strong>Cách làm:</strong><ul>' +
      '<li>Bước 1: lập bảng thông tin trong Excel / Google Sheets, mỗi dòng một người, rồi xuất ra <b>CSV (UTF-8)</b>. Cột bắt buộc: <code>ho_ten</code>.</li>' +
      '<li>Cột <code>anh_dai_dien</code> ghi <b>đúng tên file ảnh</b> (ví dụ <code>an.jpg</code>). Cột <code>anh_album</code> ghi nhiều tên file, ngăn cách bằng dấu gạch đứng <code>|</code>.</li>' +
      '<li>Bước 2: chọn file CSV và chọn <b>tất cả ảnh</b> cùng lúc. Hệ thống ghép ảnh theo TÊN FILE và cho bạn kiểm tra trước khi thêm.</li>' +
      '<li>Cột <code>dieu_thu_vi</code>: ngăn cách các ý bằng dấu <code>|</code>. Ngày sinh dạng <code>dd/mm/yyyy</code>.</li></ul>' +
      '<p style="margin:.6rem 0 0"><button class="btn btn-sm" data-tpl type="button">TẢI FILE MẪU (CHỈ CÓ TIÊU ĐỀ CỘT)</button></p></div>' +
      '<label class="fld"><span>1) File CSV</span><input id="imp-csv" type="file" accept=".csv,.tsv,.txt,text/csv"></label>' +
      '<label class="fld"><span>…hoặc dán nội dung bảng (copy từ Excel)</span><textarea id="imp-text" rows="4" placeholder="ho_ten&#9;biet_danh&#9;ngay_sinh …"></textarea></label>' +
      '<label class="fld"><span>2) Chọn các file ảnh</span><input id="imp-imgs" type="file" multiple accept="image/jpeg,image/png,image/webp"></label>' +
      '<div><button class="btn btn-sm" data-check type="button">KIỂM TRA GHÉP ẢNH</button></div>' +
      '<div id="imp-report"></div></div>' +
      '<div class="modal-foot"><button class="btn" data-close type="button">HỦY</button><button class="btn btn-solid" data-go type="button" disabled>THÊM VÀO BẢN NHÁP</button></div></div>');

    m.el.addEventListener('change', function (e) {
      if (e.target.id === 'imp-imgs') {
        imp.files = {};
        Array.prototype.forEach.call(e.target.files, function (f) {
          var key = f.name.toLowerCase();
          (imp.files[key] = imp.files[key] || []).push(f);
        });
      }
      if (e.target.id === 'imp-csv' && e.target.files[0]) {
        var rd = new FileReader();
        rd.onload = function () { $('#imp-text', m.el).value = rd.result; };
        rd.readAsText(e.target.files[0], 'utf-8');
      }
    });

    function check() {
      var rep = $('#imp-report', m.el), go = $('[data-go]', m.el);
      go.disabled = true; imp.rows = [];
      var text = $('#imp-text', m.el).value;
      if (!text.trim()) { rep.innerHTML = '<p class="form-error">Hãy chọn file CSV hoặc dán nội dung bảng.</p>'; return; }
      var table = parseDelimited(text);
      var head = table[0].map(NH.slug), colOf = {};
      Object.keys(CSV_ALIASES).forEach(function (k) {
        var i = head.findIndex(function (h) { return CSV_ALIASES[k].indexOf(h) >= 0; });
        if (i >= 0) colOf[k] = i;
      });
      if (colOf.full_name === undefined) { rep.innerHTML = '<p class="form-error">Không tìm thấy cột <code>ho_ten</code> ở dòng đầu tiên.</p>'; return; }
      var used = {}, problems = 0, lines = [];
      table.slice(1).forEach(function (r, n) {
        var get = function (k) { return colOf[k] === undefined ? '' : clean(r[colOf[k]]); };
        var item = { line: n + 2, data: {}, notes: [], ok: true, avatarFile: null, albumFiles: [] };
        Object.keys(CSV_ALIASES).forEach(function (k) { if (k !== 'avatar_file' && k !== 'album_files' && k !== 'birthday') item.data[k] = get(k); });
        item.data.fun_facts = item.data.fun_facts.split('|').map(function (x) { return x.trim(); }).filter(Boolean).join('\n');
        if (!item.data.full_name) { item.ok = false; item.notes.push('<span class="imp-bad">Thiếu họ tên → bỏ qua dòng này</span>'); }
        var b = parseBirthday(get('birthday'));
        item.data.birthday = b.v;
        if (b.bad) item.notes.push('<span class="imp-bad">Ngày sinh không hợp lệ (để trống)</span>');
        var av = get('avatar_file');
        if (av) {
          var key = av.split(/[\\/]/).pop().toLowerCase(), hit = imp.files[key];
          if (!hit) item.notes.push('<span class="imp-bad">Không thấy ảnh đại diện “' + esc(av) + '”</span>');
          else if (hit.length > 1) item.notes.push('<span class="imp-bad">Có ' + hit.length + ' file trùng tên “' + esc(av) + '” – hãy đổi tên cho khác nhau</span>');
          else { item.avatarFile = hit[0]; used[key] = (used[key] || 0) + 1; item.notes.push('<span class="imp-ok">✓ ảnh đại diện: ' + esc(av) + '</span>'); }
        } else item.notes.push('Chưa có ảnh đại diện');
        get('album_files').split(/[;|]/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (nm) {
          var k2 = nm.split(/[\\/]/).pop().toLowerCase(), h2 = imp.files[k2];
          if (!h2 || h2.length > 1) item.notes.push('<span class="imp-bad">Album: không ghép được “' + esc(nm) + '”</span>');
          else { item.albumFiles.push(h2[0]); used[k2] = (used[k2] || 0) + 1; }
        });
        if (item.albumFiles.length) item.notes.push('<span class="imp-ok">✓ ' + item.albumFiles.length + ' ảnh album</span>');
        if (item.notes.some(function (x) { return x.indexOf('imp-bad') >= 0; })) problems++;
        lines.push(item);
      });
      // ảnh dùng cho nhiều người?
      var dup = Object.keys(used).filter(function (k) { return used[k] > 1; });
      var unused = Object.keys(imp.files).filter(function (k) { return !used[k]; });
      imp.rows = lines.filter(function (x) { return x.ok; });
      var html = '<div class="imp-scroll"><table class="imp-table"><thead><tr><th>Dòng</th><th>Họ tên</th><th>Kết quả ghép</th></tr></thead><tbody>' +
        lines.map(function (x) { return '<tr><td>' + x.line + '</td><td>' + esc(x.data.full_name || '—') + '</td><td>' + x.notes.join('<br>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      if (dup.length) html += '<p class="form-error">Cảnh báo: ảnh được dùng cho nhiều dòng: ' + esc(dup.join(', ')) + '. Hãy kiểm tra để tránh nhầm ảnh.</p>';
      if (unused.length) html += '<p class="muted small">Ảnh đã chọn nhưng chưa được dùng: ' + esc(unused.join(', ')) + '</p>';
      html += '<p><strong>' + imp.rows.length + '</strong> thành viên sẽ được thêm' + (problems ? ' (có ' + problems + ' dòng cần xem lại — các mục lỗi sẽ bị bỏ trống)' : '') + '.</p>';
      rep.innerHTML = html;
      go.disabled = imp.rows.length === 0;
    }

    m.el.addEventListener('click', async function (e) {
      var t = e.target;
      if (t.closest('[data-close]')) return m.close();
      if (t.closest('[data-check]')) return check();
      if (t.closest('[data-tpl]')) {
        var blob = new Blob(['﻿' + CSV_HEADER.join(',') + '\n'], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mau-thanh-vien.csv'; a.click();
        return;
      }
      if (t.closest('[data-go]')) {
        if (state.members.length + imp.rows.length > 200) { toast('err', 'Tối đa 200 thành viên.'); return; }
        var go = $('[data-go]', m.el); go.disabled = true;
        var tid = toast('busy', 'Đang xử lý ảnh…', { id: 'proc' });
        var added = 0;
        try {
          for (var i = 0; i < imp.rows.length; i++) {
            var r = imp.rows[i];
            var mem = Object.assign({ id: uuid(), avatar: null, avatar_focus_y: 25, photos: [] }, r.data);
            ['social_facebook', 'social_instagram', 'social_zalo', 'social_tiktok'].forEach(function (k) {
              var kind = k.replace('social_', ''); mem[k] = NH.normalizeSocial(mem[k], kind);
              if (mem[k] && !NH.safeUrl(mem[k])) mem[k] = '';
            });
            if (!mem.zodiac && mem.birthday) mem.zodiac = zodiacOf(mem.birthday);
            if (r.avatarFile) mem.avatar = await processImage(r.avatarFile, 1600);
            for (var j = 0; j < r.albumFiles.length; j++) mem.photos.push(await processImage(r.albumFiles[j], 1800));
            state.members.push(mem); added++;
          }
        } catch (err) {
          toast('err', err.message);
        }
        closeToast(tid);
        if (added) { markDirty(); renderMembersTab(); toast('info', 'Đã thêm ' + added + ' thành viên vào bản nháp. Hãy XEM TRƯỚC rồi nhấn LƯU.'); }
        m.close();
      }
    });
  }

  /* ======================= Xem trước ======================= */
  function buildPublicModel() {
    var s = Object.assign({}, state.site);
    SOCIAL_KEYS.forEach(function (k) { s['social_' + k] = NH.normalizeSocial(s['social_' + k], k); });
    s.about_photo_url = state.site.photo ? state.site.photo.url : '';
    var members = state.members.map(function (m) {
      var o = Object.assign({}, m);
      SOCIAL_KEYS.forEach(function (k) { o['social_' + k] = NH.normalizeSocial(m['social_' + k], k); });
      o.avatar_url = m.avatar ? m.avatar.url : '';
      o.photos = m.photos.map(function (p, i) { return { id: p.id || 'p' + i, url: p.url }; });
      delete o.avatar;
      return o;
    });
    delete s.photo;
    return { site: s, members: members };
  }

  function openPreview(thenSave) {
    try { sessionStorage.setItem('nh_draft', JSON.stringify(buildPublicModel())); }
    catch (e) { toast('err', 'Không tạo được bản xem trước: ' + e.message); return; }
    var pages = [['index.html', 'Trang chủ'], ['about.html', 'Giới thiệu'], ['members.html', 'Thành viên'], ['contact.html', 'Liên hệ']];
    var el = document.createElement('div');
    el.className = 'pv';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Xem trước');
    el.innerHTML = '<div class="pv-bar"><strong>XEM TRƯỚC — như khách truy cập (chưa lưu)</strong>' +
      '<div class="pv-tabs">' + pages.map(function (p) { return '<button class="btn btn-sm" data-pg="' + p[0] + '" type="button">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<select id="pv-member" aria-label="Xem hồ sơ thành viên"><option value="">Hồ sơ thành viên…</option>' +
      state.members.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(clean(m.full_name)) + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-sm" data-dev type="button">XEM BẢN ĐIỆN THOẠI</button>' +
      '<button class="btn btn-sm" data-back type="button">QUAY LẠI CHỈNH SỬA</button>' +
      '<button class="btn btn-solid btn-sm" data-save type="button">LƯU &amp; CÔNG KHAI</button></div>' +
      '<div class="pv-stage"><iframe title="Xem trước website" src="index.html?preview=1"></iframe></div>';
    document.body.appendChild(el);
    document.body.classList.add('lb-open');
    var frame = $('iframe', el), stage = $('.pv-stage', el);
    function close() { el.remove(); document.body.classList.remove('lb-open'); try { sessionStorage.removeItem('nh_draft'); } catch (e) { } }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-pg')) frame.src = b.getAttribute('data-pg') + '?preview=1';
      else if (b.hasAttribute('data-dev')) { var ph = stage.classList.toggle('is-phone'); b.textContent = ph ? 'XEM BẢN MÁY TÍNH' : 'XEM BẢN ĐIỆN THOẠI'; }
      else if (b.hasAttribute('data-back')) close();
      else if (b.hasAttribute('data-save')) { close(); save(); }
    });
    $('#pv-member', el).addEventListener('change', function (e) {
      if (e.target.value) frame.src = 'member.html?id=' + encodeURIComponent(e.target.value) + '&preview=1';
    });
    document.addEventListener('keydown', function esc2(ev) {
      if (!document.body.contains(el)) { document.removeEventListener('keydown', esc2); return; }
      if (ev.key === 'Escape') close();
    });
  }

  /* ======================= Lưu ======================= */
  function validate() {
    var errs = [];
    if (!clean(state.site.group_name)) errs.push('Tên nhóm (tab Nội dung website)');
    state.members.forEach(function (m, i) { if (!clean(m.full_name)) errs.push('Họ tên của thành viên số ' + (i + 1)); });
    SOCIAL_KEYS.forEach(function (k) {
      var v = clean(state.site['social_' + k]);
      if (v && !NH.safeUrl(NH.normalizeSocial(v, k))) errs.push('Liên kết ' + k + ' chung của nhóm không hợp lệ');
    });
    state.members.forEach(function (m, i) {
      SOCIAL_KEYS.forEach(function (k) {
        var v = clean(m['social_' + k]);
        if (v && !NH.safeUrl(NH.normalizeSocial(v, k))) errs.push('Liên kết ' + k + ' của thành viên số ' + (i + 1) + ' không hợp lệ');
      });
    });
    return errs;
  }

  var TEXT_COLS = ['nickname', 'zodiac', 'fav_food', 'fav_color', 'fav_music', 'other_hobbies', 'family', 'dream', 'fun_facts'];
  function memberRow(m, i) {
    var r = {
      id: m.id, sort_order: i, full_name: clean(m.full_name), birthday: clean(m.birthday) || null,
      avatar_path: m.avatar ? m.avatar.path : null,
      avatar_focus_y: Math.min(100, Math.max(0, parseInt(m.avatar_focus_y, 10) || 0))
    };
    if (m.avatar_focus_y === undefined || m.avatar_focus_y === null) r.avatar_focus_y = 25;
    TEXT_COLS.forEach(function (k) { r[k] = clean(m[k]) || null; });
    SOCIAL_KEYS.forEach(function (k) { r['social_' + k] = NH.normalizeSocial(m['social_' + k], k) || null; });
    return r;
  }
  function siteRow() {
    var s = state.site, r = { id: 1, group_name: clean(s.group_name), about_photo_path: s.photo ? s.photo.path : null };
    ['class_name', 'slogan', 'intro_short', 'about_content', 'shared_message', 'contact_email', 'contact_phone', 'contact_address', 'contact_note'].forEach(function (k) { r[k] = clean(s[k]) || null; });
    SOCIAL_KEYS.forEach(function (k) { r['social_' + k] = NH.normalizeSocial(s['social_' + k], k) || null; });
    return r;
  }
  function check(r, what) {
    if (r.error) throw new Error(what + ': ' + readableError(r.error));
    return r.data;
  }

  async function save() {
    if (state.busy) return;
    var errs = validate();
    if (errs.length) { toast('err', 'Thiếu hoặc sai thông tin: ' + errs.join('; ') + '.'); return; }
    state.busy = true; setBusy(true);
    var pid = 'savebar';
    try {
      // 1) Tải ảnh mới lên Storage
      var jobs = [];
      if (state.site.photo && state.site.photo.blob && !state.site.photo.uploaded) jobs.push({ it: state.site.photo, folder: 'site' });
      state.members.forEach(function (m) {
        if (m.avatar && m.avatar.blob && !m.avatar.uploaded) jobs.push({ it: m.avatar, folder: 'members/' + m.id });
        m.photos.forEach(function (p) { if (p.blob && !p.uploaded) jobs.push({ it: p, folder: 'members/' + m.id }); });
      });
      for (var i = 0; i < jobs.length; i++) {
        toast('busy', 'Đang tải ảnh (' + (i + 1) + '/' + jobs.length + ')…', { id: pid });
        var j = jobs[i], path = j.folder + '/' + uuid() + '.' + j.it.ext;
        var up = await sb.storage.from(BUCKET).upload(path, j.it.blob, { contentType: j.it.blob.type, cacheControl: '31536000', upsert: false });
        if (up.error) throw new Error('Tải ảnh thất bại: ' + readableError(up.error));
        j.it.path = path; j.it.uploaded = true;
      }
      if (jobs.length) toast('ok', 'Ảnh tải lên thành công (' + jobs.length + ' ảnh).', { id: 'upok' });

      toast('busy', 'Đang lưu dữ liệu…', { id: pid });
      // 2) Cài đặt chung
      var sr = await sb.from('site_settings').upsert(siteRow(), { onConflict: 'id' }).select('id');
      if (check(sr, 'Lưu nội dung website').length !== 1) throw new Error('Lưu nội dung website: không có quyền ghi.');

      // 3) Xóa thành viên đã bị gỡ
      var keep = {}; state.members.forEach(function (m) { keep[m.id] = true; });
      var delIds = server.members.filter(function (m) { return !keep[m.id]; }).map(function (m) { return m.id; });
      if (delIds.length) {
        var dr = await sb.from('members').delete().in('id', delIds).select('id');
        if (check(dr, 'Xóa thành viên').length !== delIds.length) throw new Error('Xóa thành viên: không có quyền hoặc dữ liệu chưa được xóa.');
      }

      // 4) Thêm / sửa thành viên (kèm thứ tự)
      if (state.members.length) {
        var rows = state.members.map(memberRow);
        var mr = await sb.from('members').upsert(rows, { onConflict: 'id' }).select('id');
        if (check(mr, 'Lưu thành viên').length !== rows.length) throw new Error('Lưu thành viên: số dòng lưu được không khớp.');
      }

      // 5) Album ảnh
      var keepPhoto = {}, photoRows = [];
      state.members.forEach(function (m) {
        m.photos.forEach(function (p, idx) {
          if (!p.id) p.id = uuid();
          keepPhoto[p.id] = true;
          photoRows.push({ id: p.id, member_id: m.id, path: p.path, sort_order: idx });
        });
      });
      var delPhotos = [];
      server.members.forEach(function (m) {
        if (!keep[m.id]) return; // đã xóa theo thành viên (cascade)
        m.photos.forEach(function (p) { if (!keepPhoto[p.id]) delPhotos.push(p.id); });
      });
      if (delPhotos.length) {
        var pr = await sb.from('member_photos').delete().in('id', delPhotos).select('id');
        if (check(pr, 'Xóa ảnh album').length !== delPhotos.length) throw new Error('Xóa ảnh album: dữ liệu chưa được xóa.');
      }
      if (photoRows.length) {
        var ir = await sb.from('member_photos').upsert(photoRows, { onConflict: 'id' }).select('id');
        if (check(ir, 'Lưu album ảnh').length !== photoRows.length) throw new Error('Lưu album ảnh: số dòng lưu được không khớp.');
      }

      // 6) Dọn file ảnh không còn dùng (không ảnh hưởng kết quả nếu lỗi)
      var finalPaths = {};
      if (state.site.photo) finalPaths[state.site.photo.path] = 1;
      state.members.forEach(function (m) { if (m.avatar) finalPaths[m.avatar.path] = 1; m.photos.forEach(function (p) { finalPaths[p.path] = 1; }); });
      var oldPaths = [];
      if (server.site.photo) oldPaths.push(server.site.photo.path);
      server.members.forEach(function (m) { if (m.avatar) oldPaths.push(m.avatar.path); m.photos.forEach(function (p) { oldPaths.push(p.path); }); });
      var orphans = oldPaths.filter(function (p) { return p && !finalPaths[p]; });
      if (orphans.length) { try { await sb.storage.from(BUCKET).remove(orphans); } catch (e) { /* bỏ qua */ } }

      // 7) Đọc lại từ máy chủ để chắc chắn dữ liệu đã thật sự được lưu
      var fresh = await fetchServer();
      if (fresh.members.length !== state.members.length) throw new Error('Dữ liệu đọc lại không khớp với bản nháp. Vui lòng thử lưu lại.');
      server = fresh;
      var c = cloneData(fresh); state.site = c.site; state.members = c.members;
      markDirty(false); renderAll();
      closeToast(pid);
      var msg = 'Đã lưu thành công. Khách truy cập sẽ thấy nội dung mới.';
      toast('ok', msg, { id: 'saveok' });
      if (delIds.length) toast('ok', 'Đã xóa thành công ' + delIds.length + ' thành viên.', { id: 'delok' });
    } catch (e) {
      closeToast(pid);
      toast('err', 'Lưu thất bại. ' + readableError(e) + ' Các thay đổi của bạn vẫn được giữ trong bản nháp, hãy thử lại.');
      if (window.console) console.error(e);
    } finally {
      state.busy = false; setBusy(false);
    }
  }

  function setBusy(b) {
    ['btn-save', 'btn-preview', 'btn-discard', 'btn-logout'].forEach(function (id) { $('#' + id).disabled = b; });
    $('#btn-save').textContent = b ? 'ĐANG LƯU…' : 'LƯU';
  }

  /* ======================= Khởi tạo giao diện ======================= */
  function renderAll() { renderSiteTab(); renderMembersTab(); }

  $('#btn-save').onclick = save;
  $('#btn-preview').onclick = function () {
    var errs = state.members.filter(function (m) { return !clean(m.full_name); }).length;
    if (errs) { toast('err', 'Thiếu thông tin bắt buộc: có thành viên chưa nhập họ tên.'); return; }
    openPreview();
  };
  $('#btn-discard').onclick = async function () {
    if (!state.dirty) { toast('info', 'Không có thay đổi nào cần hủy.'); return; }
    if (await confirmBox('Hủy toàn bộ thay đổi chưa lưu và quay về dữ liệu đang công khai?', 'HỦY THAY ĐỔI', true)) {
      try { await loadState(); toast('info', 'Đã hủy các thay đổi chưa lưu.'); } catch (e) { toast('err', readableError(e)); }
    }
  };
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      var k = t.getAttribute('data-tab');
      $$('.tab').forEach(function (x) { var on = x === t; x.classList.toggle('is-on', on); x.setAttribute('aria-selected', on); });
      $('#tab-site').hidden = k !== 'site'; $('#tab-members').hidden = k !== 'members';
    });
  });

  boot().catch(function (e) {
    show('view-login');
    var er = $('#login-error'); er.hidden = false; er.textContent = 'Lỗi khởi động: ' + readableError(e);
  });
})();
