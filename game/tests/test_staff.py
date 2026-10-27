"""Thank you, Sin City staff (Gordon 2026-10-27). In Chromium and WebKit:
  - three officials stand off the court (far sideline and far corners), visible in play, never in the teams; an out raises the nearest official's hand;
  - every other game break the crowd's allusion signs read THANK YOU STAFF!, the officials wave, a brush callout says so;
  - Sunday finals (winners final, grand final): the staff walk-out ribbon shows, the officials bow, Enter or Skip dismisses it at once; reduced motion is still;
  - fact card S01 exists, leads the session deck, its spot art and VO load (HTTP 200), wording has no numbers and no dashes;
  - the credits roll opens from the title, shows 8 staff with all 8 faces named as Gordon mapped them and all 8 names (alphabetical) in the thank-you line, Escape returns to the title,
    reduced motion = no roll animation; nothing on screen carries a dash.
Receipts carry the commit and the ?v tag. Run: python3 tests/test_staff.py [shots_dir] (PC: python3 game/tests/test_staff.py)"""
import functools, json, threading, sys, subprocess, re
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).resolve()
ROOT = HERE.parents[2] if HERE.parent.parent.name == 'game' else HERE.parents[1]
ED = 'pc' if HERE.parent.parent.name == 'game' else 'mobile'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else None
def receipt():
    sha = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(['git', '-C', str(ROOT), 'status', '--porcelain', '--untracked-files=no'], capture_output=True, text=True).stdout.strip())
    m = re.search(r'game\.bundle\.js\?v=([\w.-]+)', (ROOT / 'play' / 'index.html').read_text())
    return {'edition': ED, 'commit': sha + ('+dirty' if dirty else ''), 'v': m.group(1) if m else None}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()

LOGIC = r"""async () => {
  const g = FBGame._game(), out = {}, wait = (ms) => new Promise(r => setTimeout(r, ms));
  const O = g.officials || [];
  out.officials = O.length; out.notInTeams = O.every(a => !g.all.includes(a));
  out.offCourt = O.every(a => Math.abs(a.z) > 5.2 + 0.3 || Math.abs(a.x) > 9 + 0.3);
  out.jakeHead = O[0] && O[0].staffName === 'Jake Mason' && !!O[0].look.beard;
  g.wkMatch = null; g.start(); for (let i = 0; i < 300 && g.phase !== 'play'; i++) { if (g.phase === 'brief') g.briefGo = true; if (g.phase === 'rps' && g.rpsPick == null) g.rpsPick = 0; await wait(30); }
  out.visibleInPlay = O.every(a => a.root.visible);
  const foe = g.inPlayers(1)[0]; g.eliminate(foe, 'hit'); out.signal = O.some(a => a.callT > 0);
  // a game break: rotateSigns twice gives exactly one thank-you moment
  const q0 = g.qa().filter(x => x.ev === 'staffThanks').length; g.rotateSigns(); g.rotateSigns(); const q1 = g.qa().filter(x => x.ev === 'staffThanks').length;
  out.thanksOncePerTwo = q1 - q0 === 1;
  g.staffThanks(); out.signsThank = g.signs.filter(sg => /^\*a\d$/.test(sg.def.who)).every(sg => sg.def.t.join(' ') === 'THANK YOU STAFF!'); out.wave = g.staffWaveT > 0;
  return out;
}"""

# Gordon 10/27: names exactly as given, alphabetical by last name in the thank-you line; only faces Gordon mapped carry a name
# (photo order, left to right). Gordon mapped all eight.
NAMED_FACES = ['Jamell Dorton', 'Casey Flammond', 'Jake Mason', 'Brendan Tickner', 'Alexandra Bustamante', 'Chris Yeh', 'Anh Phan', 'Val Horton']
THANKS_LINE = 'With thanks to Alexandra Bustamante, Jamell Dorton, Casey Flammond, Val Horton, Jake Mason, Anh Phan, Brendan Tickner, Chris Yeh and the whole Sin City Dodgeball staff.'
res = {}; bad = []
try:
    with sync_playwright() as p:
        for eng in ('chromium', 'webkit'):
            b = getattr(p, eng).launch(); errs = []; r = {}
            for (tag, vw, vh, rm) in (('1920', 1920, 1080, False), ('SEL', 667, 375, False), ('rm', 1280, 720, True)):
                ctx = b.new_context(viewport={'width': vw, 'height': vh}, reduced_motion='reduce' if rm else 'no-preference', device_scale_factor=2 if tag == 'SEL' else 1)
                q = ctx.new_page(); q.on('pageerror', lambda e: errs.append(str(e)))
                q.add_init_script(f"try{{localStorage.setItem('fbg-edition','{ED}'); sessionStorage.removeItem('fbg-facts')}}catch(e){{}}")
                base = f'http://127.0.0.1:{srv.server_port}/'
                q.goto(base + 'play/', timeout=180000); q.wait_for_function('window.FBGame && FBGame._game() && FBGame.state()', timeout=180000); q.wait_for_timeout(600)
                print('case', eng, tag, flush=True); u = {}
                # credits from the title
                q.evaluate("(()=>{const g=FBGame._game(); if (g.picking) g.chooseEdition(g.edition||'pc'); g.showTitle();})()"); q.wait_for_timeout(300)
                u['staffButton'] = q.evaluate("!!document.querySelector('.fbg-card .fbg-staffb')")
                q.evaluate("document.querySelector('.fbg-card .fbg-staffb').click()"); q.wait_for_timeout(2500 if not rm else 400)
                c = q.evaluate("""(()=>{const L=[...document.querySelectorAll('.fbg-cr-list li')]; const names=L.map(li=>li.querySelector('b').textContent);
                  const roll=document.querySelector('.fbg-cr-roll'); const done=document.querySelector('.fbg-cr-done'); const r=done.getBoundingClientRect();
                  const para=(document.querySelector('.fbg-cr-names')||{}).textContent||''; return {names, para, n:L.length, jake:names.filter(x=>x==='Jake Mason').length, staff:names.filter(x=>x==='Sin City Staff').length, anim:getComputedStyle(roll).animationName,
                    imgs:[...document.querySelectorAll('.fbg-credits img')].every(i=>i.complete&&i.naturalWidth>0), focus:document.activeElement===done,
                    doneVisible:r.bottom<=innerHeight+1&&r.top>=0, dashes:/[\\u2013\\u2014]/.test(document.querySelector('.fbg-credits').innerText),
                    logo:/WeHo|WEHO/.test(document.querySelector('.fbg-credits').innerText)}})()""")
                u['credits'] = c
                if OUT: OUT.mkdir(parents=True, exist_ok=True); q.screenshot(path=str(OUT / f'staff-{ED}-{eng}-{tag}-credits.png'))
                q.evaluate("document.querySelector('.fbg-credits').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); q.wait_for_timeout(300)
                u['backToTitle'] = q.evaluate("!!document.querySelector('.fbg-card .fbg-quick') && !document.querySelector('.fbg-credits')")
                # fact card S01 and its media
                f = q.evaluate("""(async()=>{const g=FBGame._game(); sessionStorage.removeItem('fbg-facts'); const c=g.nextFact(); const base=g.base;
                  const ok=async(u)=>{try{const r=await fetch(u); return r.status}catch(e){return 0}};
                  return {first:c.id, text:c.text, head:c.head, spot:await ok(base+'assets/facts/spots/spot-staff-thanks'+(g.edition==='mobile'?'-384.webp':'.webp')), vo:await ok(g.sfx.base+'fact_S01.mp3')}})()""")
                u['fact'] = f
                if tag == '1920':
                    u['logic'] = q.evaluate(LOGIC); q.wait_for_timeout(1500)
                    if OUT: q.screenshot(path=str(OUT / f'staff-{ED}-{eng}-thanks.png'))
                # Sunday finals walk-out
                q.evaluate("""(()=>{const g=FBGame._game(); g.wkMatch={day:'sun', step:4, opp:'glitches', label:'SUNDAY: GRAND FINAL', short:'GRAND FINAL'}; g.setOpponent(wkTeam('glitches')); g.start();})()""")
                q.wait_for_timeout(900)
                w = q.evaluate("""(()=>{const el=document.querySelector('.fbg-staffwalk'); const g=FBGame._game(); if(!el) return {shown:false};
                   const b=el.getBoundingClientRect(); return {shown:true, still:el.classList.contains('still'), bow:g.staffBowT>0, inView:b.top>=0&&b.bottom<=innerHeight+1&&b.left>=0&&b.right<=innerWidth+1,
                   dashes:/[\\u2013\\u2014]/.test(el.innerText)}})()""")
                if OUT: q.screenshot(path=str(OUT / f'staff-{ED}-{eng}-{tag}-walkout.png'))
                q.keyboard.press('Enter'); q.wait_for_timeout(500); w['skipped'] = q.evaluate("!document.querySelector('.fbg-staffwalk') || document.querySelector('.fbg-staffwalk').classList.contains('out')")
                u['walk'] = w; r[tag] = u; ctx.close()
            r['errors'] = errs[:3]; res[eng] = r; b.close()
            for tag in ('1920', 'SEL', 'rm'):
                u = r[tag]; c = u['credits']; f = u['fact']; w = u['walk']
                if not (u['staffButton'] and c['n'] == 8 and c['jake'] == 1 and c['staff'] == 0 and c['names'] == NAMED_FACES and c['para'] == THANKS_LINE and c['imgs'] and c['focus'] and c['doneVisible'] and not c['dashes'] and not c['logo'] and u['backToTitle']): bad.append(f'{eng}:{tag}:credits')
                if (tag == 'rm') != (c['anim'] in ('none', '')): bad.append(f'{eng}:{tag}:creditsMotion')
                if not (f['first'] == 'S01' and f['spot'] == 200 and f['vo'] == 200 and not re.search(r'\d|[–—]', f['text']) and all(n in f['text'] for n in ('Alexandra Bustamante', 'Jamell Dorton', 'Casey Flammond', 'Val Horton', 'Jake Mason', 'Anh Phan', 'Brendan Tickner', 'Chris Yeh'))): bad.append(f'{eng}:{tag}:fact')
                if not (w['shown'] and w['bow'] and w['inView'] and w['skipped'] and not w['dashes'] and w['still'] == (tag == 'rm')): bad.append(f'{eng}:{tag}:walkout')
            L = r['1920']['logic']
            for k in ('notInTeams', 'offCourt', 'jakeHead', 'visibleInPlay', 'signal', 'thanksOncePerTwo', 'signsThank', 'wave'):
                if not L.get(k): bad.append(f'{eng}:logic:{k}')
            if L.get('officials') != 3: bad.append(f'{eng}:logic:officials')
            if errs: bad.append(f'{eng}:errors')
    print(json.dumps(res, indent=1)[:7000])
    print(('PASS' if not bad else 'FAIL ' + ', '.join(bad)) + ' @ ' + json.dumps(receipt())); sys.exit(1 if bad else 0)
finally:
    srv.shutdown()
