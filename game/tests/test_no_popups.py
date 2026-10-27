"""During a match nothing may open a window or tab (Gordon 10/26: Shift is PASS, clicks throw, and Shift+click on a link opens a window).
In Chromium and WebKit at 1920x1080 this test:
  - Shift+clicks the site chip spot on the very first frame after START and after RESUME (before any poll could hide the chip);
  - asserts the match really reaches phase 'play', then holds Shift, Ctrl and Meta and left/middle clicks every corner, the center and the chip spot;
  - Shift+clicks the chip while paused (chip visible) and asserts the click is refused;
  - asserts PASS (Shift and E), THROW (LMB, also with Shift held) and CATCH (RMB) still reach the game;
  - asserts destroy() removes the guard listeners and a remount adds exactly one set back;
  - asserts 0 popups, 1 page, and the main frame never navigated.
Run: python3 tests/test_no_popups.py (PC: python3 game/tests/test_no_popups.py)"""
import functools, json, threading, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).resolve()
ROOT = HERE.parents[2] if HERE.parent.parent.name == 'game' else HERE.parents[1]
ED = 'pc' if HERE.parent.parent.name == 'game' else 'mobile'
NATIVE = ED == 'pc'
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
W, H = 1920, 1080
CHIP = (1781 + 64, 1015 + 27)
SPOTS = [(4, 4), (W - 5, 4), (4, H - 5), (W - 5, H - 5), (W // 2, H // 2), CHIP, (W - 40, H - 30)]
# counts live capture-phase mouse guard listeners on document, and records game input edges the moment each event has been handled
INIT = """
(() => {
  window.__guards = 0; const T = new Set(['mousedown', 'click', 'auxclick', 'contextmenu']); const live = new Set();
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const cap = (o) => o === true || (o && o.capture === true);
  EventTarget.prototype.addEventListener = function (t, f, o) { if (this === document && T.has(t) && cap(o) && !live.has(t + '|' + (f && f.__id || (f.__id = Math.random())))) { live.add(t + '|' + f.__id); window.__guards = live.size; } return add.call(this, t, f, o); };
  EventTarget.prototype.removeEventListener = function (t, f, o) { if (this === document && T.has(t) && cap(o) && f && f.__id) { live.delete(t + '|' + f.__id); window.__guards = live.size; } return rem.call(this, t, f, o); };
  window.__edges = [];
  const rec = (e) => { const g = window.FBGame && FBGame._game && FBGame._game(); if (!g || !g.edge) return; for (const k of ['pass', 'throw', 'catch']) if (g.edge[k]) window.__edges.push(k + ':' + e.type + (e.shiftKey ? '+shift' : '')); };
  window.__rec = () => { add.call(window, 'keydown', rec); add.call(window, 'mousedown', rec); };   // added after the game's own listeners so it sees their edges
})();
"""
GO = "(()=>{const g=FBGame._game(); if(g.phase==='brief') g.briefGo=true; if(g.phase==='rps'&&g.rpsPick==null) g.rpsPick=0; if(g.phase==='handshake') g.finishHandshake(); return g.phase})()"
res = {}
try:
    with sync_playwright() as p:
        for eng in ('chromium', 'webkit'):
            b = getattr(p, eng).launch(); ctx = b.new_context(viewport={'width': W, 'height': H}); popups = []; errs = []; navs = []
            pg = ctx.new_page(); ctx.on('page', lambda x: popups.append(x.url)); pg.on('popup', lambda x: popups.append('popup:' + x.url)); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.add_init_script(f"try{{localStorage.setItem('fbg-edition','{ED}')}}catch(e){{}}"); pg.add_init_script(INIT)
            url = f'http://127.0.0.1:{srv.server_port}/play/'
            pg.goto(url); pg.wait_for_function('window.FBGame && FBGame._game() && FBGame.state()', timeout=120000); pg.wait_for_timeout(1000)
            pg.on('framenavigated', lambda f: navs.append(f.url) if f == pg.main_frame else None)
            r = {'guards0': pg.evaluate('window.__guards')}
            # first frame after START: Shift+click the chip spot and a corner right away
            pg.click('.fbg-card .fbg-quick'); pg.keyboard.down('Shift'); pg.mouse.click(*CHIP); pg.mouse.click(W - 40, H - 30); pg.keyboard.up('Shift')
            seen = []
            for i in range(300):
                ph = pg.evaluate(GO); seen.append(ph)
                if ph == 'play': break
                pg.wait_for_timeout(150)
            r['reachedPlay'] = pg.evaluate('FBGame.state().phase') == 'play'
            # input still works: E and Shift pass, LMB throws (also with Shift held), RMB catches
            pg.evaluate('window.__edges = []; window.__rec()')
            pg.mouse.move(W // 2, H // 2 + 120)
            pg.keyboard.press('e'); pg.wait_for_timeout(120); pg.keyboard.press('Shift'); pg.wait_for_timeout(120)
            if NATIVE:   # PC: the mouse throws and catches
                pg.mouse.click(W // 2, H // 2 + 120); pg.wait_for_timeout(120)
                pg.keyboard.down('Shift'); pg.mouse.click(W // 2 + 60, H // 2 + 120); pg.keyboard.up('Shift'); pg.wait_for_timeout(120)
                pg.mouse.click(W // 2, H // 2 + 120, button='right'); pg.wait_for_timeout(120)
            else:        # mobile edition on a desktop: J throws, K catches (the mouse is not a throw button there)
                pg.keyboard.press('j'); pg.wait_for_timeout(120)
                pg.keyboard.down('Shift'); pg.keyboard.press('J'); pg.keyboard.up('Shift'); pg.wait_for_timeout(120)
                pg.keyboard.press('k'); pg.wait_for_timeout(120)
            ed = pg.evaluate('window.__edges'); r['edges'] = ed
            ev = 'mousedown' if NATIVE else 'keydown'
            r['inputOK'] = any(x.startswith('throw:' + ev) for x in ed) and any(x.startswith('catch:' + ev) for x in ed) and ('throw:%s+shift' % ev) in ed and sum(x.startswith('pass:keydown') for x in ed) >= 2
            # modified clicks everywhere during play
            clicks = 0
            for mod in ('Shift', 'Control', 'Meta'):
                pg.keyboard.down(mod)
                for (x, y) in SPOTS:
                    for btn in ('left', 'middle'):
                        pg.mouse.click(x, y, button=btn); clicks += 1
                pg.keyboard.up(mod)
            r['clicks'] = clicks
            # paused: the chip is visible, but a Shift+click on it is refused
            pg.evaluate('FBGame.pause()')
            try: pg.wait_for_function("!document.getElementById('home').hidden", timeout=3000)
            except Exception: pass
            r['pauseState'] = pg.evaluate('FBGame.state().paused')
            r['chipOnPause'] = pg.evaluate("!document.getElementById('home').hidden")
            pg.keyboard.down('Shift'); pg.mouse.click(*CHIP); pg.keyboard.up('Shift'); pg.wait_for_timeout(300)
            # first frame after RESUME
            pg.evaluate('FBGame.resume()'); pg.keyboard.down('Shift'); pg.mouse.click(*CHIP); pg.mouse.click(W - 5, H - 5); pg.keyboard.up('Shift')
            pg.wait_for_timeout(1500)
            r['phaseEnd'] = pg.evaluate('FBGame.state().phase')
            # destroy removes the guards, a remount adds exactly one set back
            r['guardsLive'] = pg.evaluate('window.__guards')
            pg.evaluate('FBGame.destroy()'); r['guardsAfterDestroy'] = pg.evaluate('window.__guards')
            pg.evaluate("FBGame.mount(document.getElementById('game'), { edition: '%s', native: %s, fill: true })" % (ED, 'true' if NATIVE else 'false')); pg.wait_for_timeout(800)
            r['guardsAfterRemount'] = pg.evaluate('window.__guards')
            r['listenersOK'] = r['guardsLive'] > r['guardsAfterDestroy'] and r['guardsAfterRemount'] == r['guardsLive']
            r.update({'popups': popups, 'pages': len(ctx.pages), 'mainNavs': navs, 'mainUrl': pg.url == url, 'errors': errs[:2]})
            res[eng] = r
            b.close()
    print(json.dumps(res, indent=1))
    bad = [e for e, r in res.items() if r['popups'] or r['pages'] != 1 or r['errors'] or r['mainNavs'] or not r['mainUrl'] or not r['reachedPlay'] or not r['inputOK'] or not r['listenersOK'] or not r['chipOnPause']]
    print('PASS' if not bad else 'FAIL ' + ', '.join(bad)); sys.exit(1 if bad else 0)
finally:
    srv.shutdown()
