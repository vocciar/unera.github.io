// UniOn Landing – basic interactions
(function(){
  // Current year in footer
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Reveal on scroll
  var observer = ('IntersectionObserver' in window) ? new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('is-visible'); observer.unobserve(e.target);} });
  }, {threshold: 0.12}) : null;

  document.querySelectorAll('.card, .gallery img, .hero__copy, .hero__media').forEach(function(el){
    el.classList.add('fade-in');
    if(observer) observer.observe(el); else el.classList.add('is-visible');
  });

  // Smooth anchor scroll
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var id = this.getAttribute('href');
      if(id.length > 1){
        var target = document.querySelector(id);
        if(target){ e.preventDefault(); target.scrollIntoView({behavior:'smooth'}); }
      }
    });
  });

  // Language auto-switch for site (home + privacy)
  try {
    var path = (location.pathname || '').toLowerCase();
    var isPrivacyEn = /\/privacy\.html$/.test(path);
    var isPrivacyIt = /\/privacy-it\.html$/.test(path);
    var isHomeEn = /^\/(index\.html)?$/.test(path);
    var isHomeIt = /^\/index-it\.html$/.test(path);

    if (isPrivacyEn || isPrivacyIt || isHomeEn || isHomeIt) {
      var stored = localStorage.getItem('siteLang') || localStorage.getItem('privacyLang');
      var navLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
      var preferIt = stored ? stored === 'it' : navLang.startsWith('it');
      if (!stored) { localStorage.setItem('siteLang', preferIt ? 'it' : 'en'); }

      // Auto-redirect according to preference
      if (preferIt && isHomeEn) { location.replace('index-it.html'); return; }
      if (!preferIt && isHomeIt) { location.replace('index.html'); return; }
      if (preferIt && isPrivacyEn) { location.replace('privacy-it.html'); return; }
      if (!preferIt && isPrivacyIt) { location.replace('privacy.html'); return; }

      // Language dropdown and toggles
      var dropdown = document.querySelector('.lang-dropdown');
      var btn = document.querySelector('.lang-button');
      var menu = document.getElementById('lang-menu');
      var setLang = function(code){
        localStorage.setItem('siteLang', code);
        if (btn){
          var badge = btn.querySelector('.badge');
          if (badge) badge.textContent = code.toUpperCase();
        }
        if (code === 'it'){
          if (isHomeEn) return location.href = 'index-it.html';
          if (isPrivacyEn) return location.href = 'privacy-it.html';
        } else {
          if (isHomeIt) return location.href = 'index.html';
          if (isPrivacyIt) return location.href = 'privacy.html';
        }
      };
      if (btn && menu){
        btn.addEventListener('click', function(){
          var expanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          menu.hidden = expanded;
        });
        document.addEventListener('click', function(e){
          if (!dropdown) return;
          if (!dropdown.contains(e.target)){
            if (btn.getAttribute('aria-expanded') === 'true'){
              btn.setAttribute('aria-expanded','false');
              if (menu) menu.hidden = true;
            }
          }
        });
        document.addEventListener('keydown', function(e){
          if (e.key === 'Escape' && btn && btn.getAttribute('aria-expanded') === 'true'){
            btn.setAttribute('aria-expanded','false');
            if (menu) menu.hidden = true;
          }
        });
        // menu items
        menu.querySelectorAll('[data-lang]').forEach(function(item){
          item.addEventListener('click', function(ev){ ev.preventDefault(); setLang(this.getAttribute('data-lang')); });
        });
        // reflect current language in badge and checked state
        var current = preferIt ? 'it' : 'en';
        var badge = btn.querySelector('.badge');
        if (badge) badge.textContent = current.toUpperCase();
        menu.querySelectorAll('[data-lang]').forEach(function(el){ el.setAttribute('aria-checked', el.getAttribute('data-lang')===current ? 'true':'false'); });
        menu.hidden = true;
      }
      // Backward compatibility with old buttons (if present)
      var enBtn = document.getElementById('lang-en');
      var itBtn = document.getElementById('lang-it');
      if (enBtn) enBtn.addEventListener('click', function(e){ e.preventDefault(); setLang('en'); });
      if (itBtn) itBtn.addEventListener('click', function(e){ e.preventDefault(); setLang('it'); });
    }
  } catch(_) {}

  // Header: sticky shadow + mobile menu
  try {
    var header = document.querySelector('.site-header');
    var toggle = document.querySelector('.menu-toggle');
    var nav = document.getElementById('primary-nav');
    if (header) {
      window.addEventListener('scroll', function(){
        if (window.scrollY > 8) header.classList.add('is-scrolled'); else header.classList.remove('is-scrolled');
      });
    }
    if (toggle && header && nav) {
      toggle.addEventListener('click', function(){
        var open = header.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true':'false');
      });
      nav.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ header.classList.remove('is-open'); toggle.setAttribute('aria-expanded','false'); }); });
    }
  } catch(_){ }
})();
