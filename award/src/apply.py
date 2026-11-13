#!/usr/bin/env python3
"""Build index.html with the landing page from the plain app page (repeatable).
usage: python3 -I apply.py <plain index.html> <output index.html>"""
import sys, re
src, dst = sys.argv[1], sys.argv[2]
here = '/home/claude/award/lp/'
s = open(src, encoding='utf-8').read()
css = open(here + 'lp.css', encoding='utf-8').read()
html = open(here + 'lp.html', encoding='utf-8').read()

def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:80])
    s = s.replace(a, b)

# head: decide before the first paint whether this visit opens on the landing page, and load the two faces without blocking
rep('<link rel="icon" href="data:,">\n', '''<link rel="icon" href="data:,">
<meta name="description" content="京都の先斗町・鴨川・祇園白川を、ドバトの目で歩いて飛ぶブラウザ作品。街は国土交通省 PLATEAU の 3D 都市モデル（京都市・2025 年度）の LOD3 建築物から再構成しています。">
<script>
// a visit with a query string, with #play, or a reload during play goes straight to the simulation; any other visit opens on the landing page
(function () { var direct = location.search.length > 1 || location.hash === '#play'; try { direct = direct || sessionStorage.getItem('hato.play') === '1'; } catch (e) { } if (!direct) document.documentElement.classList.add('lp'); })();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" media="print" onload="this.media='all'">
''')
rep('--serif: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif; }', '--serif: "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif; color-scheme: dark; }')
rep('</style>\n</head>', css + '</style>\n</head>')
rep('<body data-mode="cine">\n', '<body data-mode="cine">\n' + html)
# the simulation's own page
rep('<span>時刻（京都・11月12日）</span>', '<span>時刻（京都・10月中旬）</span>')
rep('''  <p id="diag" class="fine"></p>''', '''  <p class="fine"><a href="./" id="toLp" style="color:inherit">紹介ページへ戻る</a></p>
  <p id="diag" class="fine"></p>''')
# scripts: the watchdog starts with the simulation, and the simulation starts either at once or from the landing page
i0 = s.index('<script>\n// show a readable message if the scripts or data cannot be loaded'); i1 = s.index('</body>')
s = s[:i0] + '''<script>
// show a readable message if the scripts or data cannot be loaded
(function () { var err = document.getElementById('err'), show = function (m, weak) { if (document.body.classList.contains('ready') || (weak && err.textContent)) return; err.textContent = m; err.style.display = 'block'; };
  window.addEventListener('error', function (e) { var t = e.target; if (!window.__hatoBooted || (t && t !== window && t.tagName && t.tagName !== 'SCRIPT')) return; // a font, picture or film that fails to load is not a reason to stop
    show('エラー: ' + (e.message || (t && t.src) || '読み込みに失敗しました')); }, true);
  window.addEventListener('unhandledrejection', function (e) { if (!window.__hatoBooted) return; show('エラー: ' + (e.reason && e.reason.message || e.reason)); });
  window.__hatoWatch = function () { setTimeout(function () { if (!window.__app) show('スクリプトを読み込めませんでした。ページを再読み込みしてください。', true); }, 12000); };
  if (!window.WebGL2RenderingContext) show('このブラウザは WebGL2 に対応していません。'); })();
</script>
<script>
// landing page -> simulation. The module is added only when the simulation is wanted.
(function () { var d = document, H = d.documentElement, lp = d.getElementById('lp'), vp = d.querySelector('meta[name=viewport]'), GAME_VP = vp.getAttribute('content');
  function boot(go) { if (window.__hatoBooted) return; window.__hatoBooted = true;
    if (go) { window.__hatoGo = true; // pressed on the landing page: unlock sound inside this press, and skip the simulation's own title
      try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) { var c = new AC(), b = c.createBuffer(1, 1, 22050), n = c.createBufferSource(); if (c.resume) c.resume(); n.buffer = b; n.connect(c.destination); n.start(0); window.__hatoAC = c; } } catch (e) { }
      try { sessionStorage.setItem('hato.play', '1'); } catch (e) { }
      try { history.replaceState(null, '', '#play'); } catch (e) { } }
    if (lp) { var vs = lp.querySelectorAll('video'); for (var k = 0; k < vs.length; k++) { try { vs[k].pause(); vs[k].removeAttribute('src'); vs[k].load(); } catch (e) { } } }
    H.classList.remove('lp'); vp.setAttribute('content', GAME_VP); if (lp && lp.parentNode) lp.parentNode.removeChild(lp); // the landing page is done: free its pictures and video decoders before the 3D data arrives
    var s = d.createElement('script'); s.type = 'module'; s.src = './js/main.js'; d.body.appendChild(s); window.__hatoWatch(); }
  window.__hatoBoot = boot;
  var back = d.getElementById('toLp'); if (back) back.addEventListener('click', function (e) { e.preventDefault(); try { sessionStorage.removeItem('hato.play'); } catch (err) { } try { history.replaceState(null, '', location.pathname); location.reload(); } catch (err) { location.replace(location.pathname); } });
  if (!H.classList.contains('lp') || !lp) { boot(false); return; }
  vp.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
  if (!window.WebGL2RenderingContext) { var nt = d.getElementById('lpNote'); if (nt) nt.textContent = 'このブラウザは WebGL 2 に対応していないため、作品は動きません。下の動画でご覧ください。'; }
  else if (!('DecompressionStream' in window)) { var nt2 = d.getElementById('lpNote'); if (nt2) nt2.textContent = 'このブラウザは DecompressionStream に対応していないため、作品は動きません。下の動画でご覧ください。'; }
  lp.addEventListener('click', function (e) { var t = e.target.closest ? e.target.closest('[data-go],[data-to]') : null; if (!t) return; e.preventDefault();
    if (t.hasAttribute('data-go')) boot(true); else { var el = d.getElementById(t.getAttribute('data-to')); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  addEventListener('hashchange', function () { if (location.hash === '#play') boot(false); });
  // While the page is read, the 3D data is fetched in the background, so that the simulation starts sooner once it is asked for: all of it on a desktop
  // or on Wi-Fi, the first 4 MB on other phones, nothing when the visitor asked to save data. js/util.js takes over whatever has arrived or is on its way.
  var con = navigator.connection || {}, pre = window.__hatoPre = {};
  function preload(path) { try { var url = new URL(path, d.baseURI).href; if (pre[url] || !window.fetch || !window.ReadableStream) return; var o = pre[url] = { n: 0, total: 0, cb: null, chunks: [] };
      o.p = fetch(url).then(function (res) { if (!res.ok || !res.body) throw new Error('preload ' + res.status); o.total = +res.headers.get('content-length') || 0; var rd = res.body.getReader();
        return (function pump() { return rd.read().then(function (r) { if (r.done) return o.chunks; o.chunks.push(r.value); o.n += r.value.length; if (o.cb) o.cb(o.n); return pump(); }); })(); });
      o.p.catch(function () { delete pre[url]; }); } catch (e) { } }
  if (!con.saveData && window.WebGL2RenderingContext) { var phone = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent), all = !phone || con.type === 'wifi' || con.type === 'ethernet';
    var early = function () { if (window.__hatoBooted) return; preload('d/nav.txt'); preload('t/b.txt'); if (all) preload('d/core.txt'); };
    if (d.readyState === 'complete') setTimeout(early, 2500); else addEventListener('load', function () { setTimeout(early, 2500); }); }
  // say what the press will cost on this connection: with the read-ahead most of the 21 MB is already here, a phone not known to be on Wi-Fi has only the first 4 MB, and a visitor saving data has none of it
  (function () { var ph = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent), wide = !ph || con.type === 'wifi' || con.type === 'ethernet';
    var t = con.saveData ? 'データ節約の指定があるため先読みはしません。押してから約 21 MB を読み込みます。音が出ます。' : wide ? '' : 'スマートフォンでは、押してから約 17 MB を読み込みます（先読みと合わせて約 21 MB）。音が出ます。'; if (!t) return;
    var ns = lp.querySelectorAll('.lp-screen .note'); for (var k = 0; k < ns.length; k++) ns[k].textContent = (k === 0 ? '押すと、この街がブラウザの中で動きはじめます。' : '') + t;
    var bs = lp.querySelectorAll('.lp-screen[data-go]'); for (var j = 0; j < bs.length; j++) bs[j].setAttribute('aria-label', '作品をはじめる。' + t); })();
  // the opening screen plays footage of the simulation: silent, only while it is in view, and not at all when the visitor asked for less motion or less data, or is known to be on a mobile network (the footage is 1.8 MB on a phone)
  var v = lp.querySelector('.lp-screen video'), calm = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || con.saveData || con.type === 'cellular' || /^(slow-2g|2g|3g)$/.test(con.effectiveType || '');
  if (v && !calm) { var play = function () { var p = v.play(); if (p && p.catch) p.catch(function () { }); }; v.muted = true; v.src = Math.min(innerWidth, innerHeight) < 600 ? v.getAttribute('data-src-s') : v.getAttribute('data-src'); play();
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { for (var k = 0; k < es.length; k++) { if (es[k].isIntersecting) play(); else v.pause(); } }, { root: lp, threshold: 0.15 }).observe(v); }
})();
</script>
''' + s[i1:]
import os
open(dst + '.tmp', 'w', encoding='utf-8').write(s); os.replace(dst + '.tmp', dst)
print('index.html', len(s))
