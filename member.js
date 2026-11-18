/* Trang hồ sơ cá nhân + xem ảnh lớn (lightbox) */
(function () {
  'use strict';
  var NH = window.NH, esc = NH.esc, clean = NH.clean;

  function row(label, value) {
    value = clean(value);
    return value ? '<div class="hobby"><dt>' + label + '</dt><dd>' + NH.nl2br(value) + '</dd></div>' : '';
  }

  function render(d) {
    var main = document.getElementById('main');
    var id = new URLSearchParams(location.search).get('id');
    var list = d.members, idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { idx = i; break; }

    if (idx < 0) {
      main.innerHTML = '<section class="wrap section"><div class="notice"><h2>Không tìm thấy hồ sơ</h2><p>Thành viên này không tồn tại hoặc đã được gỡ khỏi danh sách.</p>' +
        '<p><a class="btn btn-solid" href="' + NH.url('members.html') + '">QUAY LẠI DANH SÁCH THÀNH VIÊN</a></p></div></section>';
      return;
    }
    var m = list[idx], name = clean(m.full_name);
    document.title = name + (clean(d.site.group_name) ? ' · ' + d.site.group_name : '');

    var hasAvatar = !!clean(m.avatar_url);
    var nick = clean(m.nickname), birth = NH.fmtDate(m.birthday), zodiac = clean(m.zodiac);

    var facts = '';
    if (birth) facts += '<div><dt>Ngày sinh</dt><dd>' + esc(birth) + '</dd></div>';
    if (zodiac) facts += '<div><dt>Cung hoàng đạo</dt><dd>' + esc(zodiac) + '</dd></div>';

    var html = '<article class="profile">' +
      '<section class="wrap p-hero' + (hasAvatar ? '' : ' no-portrait') + '">';
    if (hasAvatar) {
      html += '<figure class="p-portrait reveal"><span class="p-portrait-back" aria-hidden="true"></span><span class="p-portrait-frame">' +
        NH.photoImg(m.avatar_url, 'Ảnh đại diện của ' + name, m.avatar_focus_y) + '</span></figure>';
    }
    html += '<div class="p-intro"><p class="kicker reveal"><span class="rule"></span>Nº ' + NH.pad2(idx + 1) + ' · Hồ sơ thành viên</p>' +
      '<h1 class="p-name reveal" style="--d:70ms">' + esc(name) + '</h1>' +
      (nick ? '<p class="p-nick reveal" style="--d:130ms">“' + esc(nick) + '”</p>' : '') +
      (facts ? '<dl class="p-facts reveal" style="--d:190ms">' + facts + '</dl>' : '') +
      '<div class="reveal" style="--d:250ms">' + NH.socialsHTML(m, '') + '</div></div></section>';

    // Thân bài
    var hobbies = row('Món ăn yêu thích', m.fav_food) + row('Màu sắc yêu thích', m.fav_color) +
      row('Thể loại nhạc yêu thích', m.fav_music) + row('Những sở thích khác', m.other_hobbies);
    var dream = clean(m.dream), family = clean(m.family), facts2 = NH.lines(m.fun_facts);

    var left = '', right = '';
    if (hobbies) left += '<section class="p-block p-hobbies reveal"><h2 class="block-title">Sở thích</h2><dl class="hobby-list">' + hobbies + '</dl></section>';
    if (dream) left += '<section class="p-block p-dream reveal" style="--d:80ms"><p class="block-kicker">Ước mơ &amp; mục tiêu</p><p class="dream-text">' + NH.nl2br(dream) + '</p></section>';
    if (family) right += '<section class="p-block p-family reveal"><h2 class="block-title">Gia đình</h2><p>' + NH.nl2br(family) + '</p></section>';
    if (facts2.length) {
      right += '<section class="p-block p-fun reveal" style="--d:80ms"><h2 class="block-title">Điều thú vị về tôi</h2><ol class="fun-list">' +
        facts2.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ol></section>';
    }
    if (left || right) {
      html += '<section class="wrap p-body' + (left && right ? '' : ' single') + '">' +
        (left ? '<div class="p-col p-col-main">' + left + '</div>' : '') +
        (right ? '<div class="p-col p-col-side">' + right + '</div>' : '') + '</section>';
    }

    // Album
    var photos = (m.photos || []).filter(function (p) { return clean(p.url); });
    if (photos.length) {
      html += '<section class="wrap album"><header class="section-head reveal"><p class="kicker"><span class="rule"></span>Album ảnh</p>' +
        '<h2 class="section-title">Khoảnh khắc <em>của ' + esc(nick || name) + '</em></h2></header><ul class="album-grid">' +
        photos.map(function (p, i) {
          return '<li class="reveal" style="--d:' + ((i % 4) * 60) + 'ms"><button type="button" class="album-item" data-i="' + i + '" aria-label="Xem ảnh ' + (i + 1) + ' trong ' + photos.length + '">' +
            '<span class="mono" aria-hidden="true">·</span>' +
            '<img class="js-photo" src="' + esc(p.url) + '" alt="Ảnh ' + (i + 1) + ' của ' + esc(name) + '" loading="lazy" decoding="async" draggable="false"></button></li>';
        }).join('') + '</ul></section>';
    }

    // Điều hướng
    var n = list.length;
    var prev = list[(idx - 1 + n) % n], next = list[(idx + 1) % n];
    html += '<nav class="wrap p-nav" aria-label="Điều hướng giữa các thành viên">' +
      '<a class="btn" href="' + NH.url('member.html', { id: prev.id }) + '" rel="prev"><span aria-hidden="true">←</span> THÀNH VIÊN TRƯỚC</a>' +
      '<a class="btn btn-solid" href="' + NH.url('members.html') + '">QUAY LẠI DANH SÁCH THÀNH VIÊN</a>' +
      '<a class="btn" href="' + NH.url('member.html', { id: next.id }) + '" rel="next">THÀNH VIÊN TIẾP THEO <span aria-hidden="true">→</span></a>' +
      '</nav></article>';

    main.innerHTML = html;
    if (photos.length) setupLightbox(photos, name);
  }

  /* ---------- Lightbox ---------- */
  function setupLightbox(photos, name) {
    var cur = 0, opener = null;
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Xem ảnh lớn');
    box.innerHTML =
      '<button type="button" class="lb-btn lb-close" aria-label="Đóng ảnh">✕</button>' +
      '<button type="button" class="lb-btn lb-prev" aria-label="Ảnh trước">‹</button>' +
      '<figure class="lb-fig"><img class="lb-img" alt="" draggable="false"><figcaption class="lb-count"></figcaption></figure>' +
      '<button type="button" class="lb-btn lb-next" aria-label="Ảnh tiếp theo">›</button>';
    document.body.appendChild(box);
    var img = box.querySelector('.lb-img'), count = box.querySelector('.lb-count');

    function show(i) {
      cur = (i + photos.length) % photos.length;
      img.src = photos[cur].url;
      img.alt = 'Ảnh ' + (cur + 1) + ' của ' + name;
      count.textContent = (cur + 1) + ' / ' + photos.length;
      box.classList.toggle('single', photos.length < 2);
    }
    function open(i, el) {
      opener = el; show(i);
      box.hidden = false;
      document.body.classList.add('lb-open');
      box.querySelector('.lb-close').focus();
    }
    function close() {
      box.hidden = true; img.removeAttribute('src');
      document.body.classList.remove('lb-open');
      if (opener) opener.focus();
    }
    document.querySelectorAll('.album-item').forEach(function (b) {
      b.addEventListener('click', function () { open(+b.getAttribute('data-i'), b); });
    });
    box.querySelector('.lb-close').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', function () { show(cur - 1); });
    box.querySelector('.lb-next').addEventListener('click', function () { show(cur + 1); });
    box.addEventListener('click', function (e) { if (e.target === box || e.target.classList.contains('lb-fig')) close(); });
    box.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(cur - 1);
      else if (e.key === 'ArrowRight') show(cur + 1);
      else if (e.key === 'Tab') { // giữ focus trong hộp thoại
        var f = box.querySelectorAll('button:not([hidden])');
        var vis = Array.prototype.filter.call(f, function (x) { return x.offsetParent !== null; });
        if (!vis.length) return;
        var first = vis[0], last = vis[vis.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    var sx = null;
    box.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    });
  }

  NH.init(render);
})();
