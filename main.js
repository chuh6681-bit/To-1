/* Giao diện chung + các trang công khai: Trang chủ, Giới thiệu, Thành viên, Liên hệ */
(function () {
  'use strict';
  var NH = window.NH;
  var esc = NH.esc, clean = NH.clean;
  var page = document.body.getAttribute('data-page');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var NAV = [
    ['home', 'index.html', 'TRANG CHỦ'],
    ['about', 'about.html', 'GIỚI THIỆU'],
    ['members', 'members.html', 'THÀNH VIÊN'],
    ['contact', 'contact.html', 'LIÊN HỆ']
  ];
  var TITLES = { home: 'Trang chủ', about: 'Giới thiệu', members: 'Thành viên', member: 'Hồ sơ', contact: 'Liên hệ' };

  /* ---------- Khung chung: header / footer ---------- */
  NH.mountChrome = function (site) {
    site = site || {};
    var name = clean(site.group_name);
    var activeKey = page === 'member' ? 'members' : page;
    var h = document.getElementById('app-header');
    if (h) {
      h.innerHTML =
        '<header class="site-header"><div class="masthead-rule" aria-hidden="true"></div>' +
        '<div class="wrap header-inner">' +
        '<a class="brand" href="' + NH.url('index.html') + '"><span class="brand-mark" aria-hidden="true"></span>' +
        '<span class="brand-text">' + esc(name || 'Giới thiệu nhóm') + '</span></a>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Mở menu"><span></span><span></span><span></span></button>' +
        '<nav id="primary-nav" class="primary-nav" aria-label="Điều hướng chính">' +
        NAV.map(function (n) {
          return '<a href="' + NH.url(n[1]) + '"' + (n[0] === activeKey ? ' class="is-active" aria-current="page"' : '') + '>' + n[2] + '</a>';
        }).join('') +
        '</nav></div></header>' +
        (NH.isPreview ? '<div class="preview-bar" role="status">ĐANG XEM TRƯỚC · Các thay đổi này chưa được lưu</div>' : '');
    }
    var f = document.getElementById('app-footer');
    if (f) {
      var social = NH.socialsHTML(site, 'socials-sm');
      f.innerHTML =
        '<footer class="site-footer"><div class="stripe-band" aria-hidden="true"></div><div class="wrap footer-inner">' +
        '<p class="footer-name">' + esc(name) + (clean(site.class_name) ? ' <span>· ' + esc(site.class_name) + '</span>' : '') + '</p>' +
        social +
        '<p class="footer-small">© ' + new Date().getFullYear() + (name ? ' ' + esc(name) : '') + ' · <a href="admin.html" rel="nofollow">Quản trị</a></p>' +
        '</div></footer>';
    }
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('.nav-toggle') : null;
    var header = document.querySelector('.site-header');
    if (t && header) {
      var open = header.classList.toggle('nav-open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
      t.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
      return;
    }
    if (header && header.classList.contains('nav-open') && !e.target.closest('.primary-nav')) {
      header.classList.remove('nav-open');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var header = document.querySelector('.site-header');
      if (header) header.classList.remove('nav-open');
    }
  });

  /* ---------- Chuyển trang trượt ngang ---------- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || reduced) return;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return;
    if (u.pathname === location.pathname && u.search === location.search) return; // neo # cùng trang
    e.preventDefault();
    document.body.classList.add('is-leaving');
    setTimeout(function () { location.href = u.href; }, 300);
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) document.body.classList.remove('is-leaving');
  });

  /* ---------- Hiệu ứng xuất hiện khi cuộn ---------- */
  var io = null;
  NH.observeReveal = function (root) {
    var els = (root || document).querySelectorAll('.reveal:not(.is-in)');
    if (!('IntersectionObserver' in window) || reduced) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    els.forEach(function (el) { io.observe(el); });
  };

  /* ---------- Hạn chế lưu ảnh thông thường (không chống tuyệt đối) ---------- */
  document.addEventListener('contextmenu', function (e) {
    if (e.target && e.target.tagName === 'IMG' && !e.target.closest('.admin')) e.preventDefault();
  });
  document.addEventListener('dragstart', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.preventDefault();
  });
  // Ảnh lỗi → ẩn ảnh, để lộ khung chữ cái thay thế
  document.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el.tagName === 'IMG' && el.classList.contains('js-photo')) el.classList.add('is-broken');
  }, true);

  /* ---------- Thành phần dùng lại ---------- */
  NH.photoImg = function (url, alt, focusY, extraCls) {
    url = clean(url);
    if (!url) return '';
    var y = Number.isFinite(+focusY) && focusY !== null && focusY !== '' ? +focusY : 25;
    return '<img class="js-photo ' + (extraCls || '') + '" src="' + esc(url) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async" draggable="false" style="object-position:50% ' + y + '%">';
  };

  function memberCard(m, i) {
    var name = clean(m.full_name);
    var big = i % 2 === 0;
    return '<a class="mcard ' + (big ? 'is-lg' : 'is-sm') + ' reveal" style="--d:' + ((i % 4) * 70) + 'ms" href="' +
      NH.url('member.html', { id: m.id }) + '" aria-label="Xem hồ sơ của ' + esc(name) + '">' +
      '<span class="mcard-media"><span class="mcard-frame">' +
      '<span class="mono" aria-hidden="true">' + esc(NH.initials(name)) + '</span>' +
      NH.photoImg(m.avatar_url, 'Chân dung ' + name, m.avatar_focus_y) +
      '</span></span>' +
      '<span class="mcard-meta"><span class="mcard-no">Nº ' + NH.pad2(i + 1) + '</span>' +
      '<span class="mcard-name">' + esc(name) + '</span></span></a>';
  }

  function membersSection(members, withId) {
    if (!members.length) return '<section class="wrap section"><p class="notice">Danh sách thành viên đang được cập nhật.</p></section>';
    return '<section class="section members-section"' + (withId ? ' id="thanh-vien"' : '') + '><div class="wrap">' +
      '<header class="section-head reveal"><p class="kicker"><span class="rule"></span>Thành viên</p>' +
      '<h2 class="section-title">' + members.length + ' gương mặt <em>của một tập thể</em></h2></header>' +
      '<div class="mgrid">' + members.map(memberCard).join('') + '</div></div></section>';
  }

  function stripeBand() { return '<div class="stripe-band" aria-hidden="true"></div>'; }

  /* ---------- Trang chủ ---------- */
  function renderHome(d) {
    var s = d.site, name = clean(s.group_name);
    var hasHero = name || clean(s.class_name) || clean(s.slogan) || clean(s.intro_short);
    var art = clean(s.about_photo_url)
      ? '<div class="hero-arch"><img class="js-photo" src="' + esc(s.about_photo_url) + '" alt="Ảnh tập thể ' + esc(name) + '" decoding="async" draggable="false"></div>'
      : '<div class="hero-arch hero-arch--pattern"></div>';
    var hero = hasHero
      ? '<section class="hero"><div class="wrap hero-grid"><div class="hero-copy">' +
        (clean(s.class_name) ? '<p class="kicker reveal"><span class="rule"></span>' + esc(s.class_name) + '</p>' : '') +
        (name ? '<h1 class="hero-title reveal" style="--d:80ms">' + esc(name) + '</h1>' : '') +
        (clean(s.slogan) ? '<p class="hero-slogan reveal" style="--d:160ms">' + esc(s.slogan) + '</p>' : '') +
        (clean(s.intro_short) ? '<p class="hero-intro reveal" style="--d:240ms">' + NH.nl2br(s.intro_short) + '</p>' : '') +
        '<div class="hero-cta reveal" style="--d:320ms"><a class="btn btn-solid" href="#thanh-vien">GẶP GỠ THÀNH VIÊN</a>' +
        '<a class="btn" href="' + NH.url('about.html') + '">VỀ CHÚNG TÔI</a></div></div>' +
        '<div class="hero-art reveal" style="--d:200ms" aria-hidden="' + (clean(s.about_photo_url) ? 'false' : 'true') + '">' +
        '<span class="shape shape-sand"></span><span class="shape shape-circle"></span><span class="shape shape-square"></span>' + art + '</div>' +
        '</div></section>'
      : '<section class="wrap section"><p class="notice">Website đang được cập nhật nội dung.</p></section>';
    document.getElementById('main').innerHTML = hasHero || d.members.length ? hero + stripeBand() + membersSection(d.members, true) : hero;
  }

  /* ---------- Trang giới thiệu ---------- */
  function renderAbout(d) {
    var s = d.site, name = clean(s.group_name);
    var paras = NH.paragraphs(s.about_content);
    var photo = clean(s.about_photo_url);
    var hasAny = name || clean(s.class_name) || paras.length || photo || clean(s.shared_message);
    if (!hasAny) {
      document.getElementById('main').innerHTML = '<section class="wrap section"><p class="notice">Nội dung giới thiệu đang được cập nhật.</p></section>';
      return;
    }
    var html = '<section class="page-head"><div class="wrap"><p class="kicker reveal"><span class="rule"></span>Giới thiệu</p>' +
      (name ? '<h1 class="page-title reveal" style="--d:80ms">' + esc(name) + '</h1>' : '<h1 class="page-title reveal">Giới thiệu</h1>') +
      (clean(s.class_name) ? '<p class="page-sub reveal" style="--d:140ms">' + esc(s.class_name) + '</p>' : '') +
      '</div></section>';
    html += '<section class="wrap about-grid' + (photo ? '' : ' no-photo') + '">';
    if (photo) {
      html += '<figure class="about-photo reveal"><span class="about-photo-back" aria-hidden="true"></span>' +
        '<img class="js-photo" src="' + esc(photo) + '" alt="Ảnh tập thể ' + esc(name) + '" decoding="async" draggable="false">' +
        '<figcaption>' + esc(name) + (clean(s.class_name) ? ' · ' + esc(s.class_name) : '') + '</figcaption></figure>';
    }
    if (paras.length) {
      html += '<div class="about-text reveal" style="--d:120ms">' + paras.map(function (p, i) {
        return '<p class="' + (i === 0 ? 'dropcap' : '') + '">' + NH.nl2br(p) + '</p>';
      }).join('') + '</div>';
    }
    html += '</section>';
    if (clean(s.shared_message)) {
      html += '<section class="message-block"><div class="wrap"><div class="message-inner reveal">' +
        '<span class="quote-mark" aria-hidden="true">“</span>' +
        '<p class="message-kicker">Thông điệp chung</p>' +
        '<blockquote>' + NH.nl2br(s.shared_message) + '</blockquote></div></div></section>';
    }
    document.getElementById('main').innerHTML = html + stripeBand();
  }

  /* ---------- Trang thành viên ---------- */
  function renderMembers(d) {
    document.getElementById('main').innerHTML =
      '<section class="page-head"><div class="wrap"><p class="kicker reveal"><span class="rule"></span>Thành viên</p>' +
      '<h1 class="page-title reveal" style="--d:80ms">Những gương mặt</h1>' +
      '<p class="page-sub reveal" style="--d:140ms">Chạm vào ảnh hoặc tên để xem hồ sơ từng người.</p></div></section>' +
      membersSection(d.members, false);
  }

  /* ---------- Trang liên hệ ---------- */
  function contactRow(label, valueHtml) {
    return '<div class="contact-row"><dt>' + label + '</dt><dd>' + valueHtml + '</dd></div>';
  }
  function renderContact(d) {
    var s = d.site;
    var rows = '';
    var email = clean(s.contact_email), phone = clean(s.contact_phone), addr = clean(s.contact_address);
    if (email) rows += contactRow('Email', '<a href="mailto:' + esc(email) + '">' + esc(email) + '</a>');
    if (phone) rows += contactRow('Điện thoại', '<a href="tel:' + esc(phone.replace(/[^0-9+]/g, '')) + '">' + esc(phone) + '</a>');
    if (addr) rows += contactRow('Địa chỉ', NH.nl2br(addr));
    var social = NH.socialsHTML(s, '');
    var note = clean(s.contact_note);
    var panel = rows || social
      ? '<aside class="contact-panel reveal" style="--d:140ms">' +
        (rows ? '<dl class="contact-list">' + rows + '</dl>' : '') +
        (social ? '<p class="panel-label">Theo dõi chúng mình</p>' + social : '') + '</aside>'
      : '';
    var main = '<section class="page-head"><div class="wrap"><p class="kicker reveal"><span class="rule"></span>Liên hệ</p>' +
      '<h1 class="page-title reveal" style="--d:80ms">Hãy nói chuyện với chúng mình</h1></div></section>';
    if (!note && !panel) {
      main += '<section class="wrap section"><p class="notice">Thông tin liên hệ đang được cập nhật.</p></section>';
    } else {
      main += '<section class="wrap contact-grid' + (panel ? '' : ' no-panel') + '">' +
        (note ? '<div class="contact-note reveal"><p>' + NH.nl2br(note) + '</p></div>' : '') + panel + '</section>';
    }
    document.getElementById('main').innerHTML = main + stripeBand();
  }

  /* ---------- Khởi động ---------- */
  function showError(err) {
    var msg;
    if (err && err.message === 'NOT_CONFIGURED') {
      msg = '<h2>Website chưa được kết nối Supabase</h2><p>Mở file <code>js/config.js</code> và dán Project URL cùng anon key của bạn vào (xem HUONG-DAN.md, phần 3).</p>';
    } else if (err && err.message === 'NO_LIBRARY') {
      msg = '<h2>Không tải được thư viện Supabase</h2><p>Hãy kiểm tra kết nối Internet rồi tải lại trang.</p>';
    } else {
      msg = '<h2>Không thể tải dữ liệu</h2><p>Vui lòng kiểm tra kết nối Internet rồi thử lại.</p><p><button class="btn" type="button" onclick="location.reload()">TẢI LẠI TRANG</button></p>';
      if (window.console) console.error(err);
    }
    document.getElementById('main').innerHTML = '<section class="wrap section"><div class="notice notice--error">' + msg + '</div></section>';
  }

  NH.init = async function (renderer) {
    NH.mountChrome({});
    var d;
    try { d = await NH.loadAll(); } catch (e) { showError(e); return; }
    NH.mountChrome(d.site);
    var nm = clean(d.site.group_name);
    document.title = (TITLES[page] || '') + (nm ? ' · ' + nm : '');
    try { renderer(d); } catch (e2) { showError(e2); return; }
    NH.observeReveal();
  };

  var R = { home: renderHome, about: renderAbout, members: renderMembers, contact: renderContact };
  if (R[page]) NH.init(R[page]);
})();
