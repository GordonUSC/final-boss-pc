"""Post-match card (Coach Nina Fiore), attributed events, playful scouting note and Commissioner Jake Mason (dot's brief, 2026-10-26).
Checks, in Chromium and WebKit:
  - attribution plumbing over 2 simulated matches: unique event ids, valid kinds, catch events == team catches, save events == team saves
    (a save is one event, never also a catch), every event carries actor, team, game and frame;
  - wording: personal play -> "Your Play of the Match"; team totals only -> "Your Match Highlight" and "Your team"; loss wording;
    zero data -> the missing-data line; priority double > save > catch back > catch > out, ties to the earliest;
  - next step: the confirmed next weekend opponent's authored tell and counter; otherwise a Fiore rule;
  - scouting: off before match 5, on for an exceptional win at 5, 5-match cooldown, off for a non-exceptional match, never with Jake;
    Jake on every third completed match;
  - the card: shows first, SEE RESULTS focused at once, Escape skips to results, reopening results does not count the match again,
    reduced motion = still card and a still image, no em or en dashes, fits at 1920x1080 and iPhone SE landscape.
Run: python3 tests/test_postmatch.py (PC: python3 game/tests/test_postmatch.py)"""
import functools, json, threading, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).resolve()
ROOT = HERE.parents[2] if HERE.parent.parent.name == 'game' else HERE.parents[1]
ED = 'pc' if HERE.parent.parent.name == 'game' else 'mobile'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else None
import subprocess, re
def receipt():
    """dot 10/26: every receipt names the commit and the bundle ?v= tag it ran against (dirty = uncommitted changes in the tree)."""
    sha = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(['git', '-C', str(ROOT), 'status', '--porcelain', '--untracked-files=no'], capture_output=True, text=True).stdout.strip())
    m = re.search(r'game\.bundle\.js\?v=([\w.-]+)', (ROOT / 'play' / 'index.html').read_text())
    return {'edition': ED, 'commit': sha + ('+dirty' if dirty else ''), 'v': m.group(1) if m else None}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()

LOGIC = r"""() => {
  const g = FBGame._game(), out = {};
  const ev = (kind, x) => Object.assign({ id: ++g.mseq, kind, t: g.frame + g.mseq, game: 1, actor: 'ME', num: '1', team: 0, you: true }, x);
  const fresh = (n) => { localStorage.setItem('fbg-post-v1', JSON.stringify({ n: n || 0, scoutAt: 0 })); };
  const prep = () => { g.wkMatch = null; g.resetMatch(); g.over = false; g.mlog = []; g.mseq = 0; g.stats = { hits: 0, catches: 0, power: 0, kos: 0, bestCombo: 0, headshots: 0, backIn: 0, blocks: 0 }; };
  // 1. attribution over real simulated matches
  g.simAll = true; g.userIntent = () => g.aiIntent(g.user); const all = []; let cat = 0, sav = 0, catEv = 0, savEv = 0;
  for (let m = 0; m < 2; m++) { g.dead = false; g.wkMatch = null; g.start(); g.dead = true; for (let i = 0; i < 36000 && g.phase !== 'result' && g.phase !== 'handshake'; i++) { if (g.phase === 'brief') g.briefGo = true; if (g.phase === 'rps' && g.rpsPick == null) g.rpsPick = 0; g.tick(); }
    const L = g.mlog || []; all.push(...L.map(e => Object.assign({ m }, e))); cat += g.stats.catches; sav += (g.stats.saves || 0);
    catEv += L.filter(e => e.kind === 'catch' || e.kind === 'catchBack' || e.kind === 'save').length; savEv += L.filter(e => e.kind === 'save').length; }
  g.dead = false; g.simAll = false; g.userIntent = null;
  const ids = new Set(all.map(e => e.m + ':' + e.id));
  out.sim = { events: all.length, uniqueIds: ids.size === all.length, kindsOK: all.every(e => ['double', 'save', 'catchBack', 'catch', 'out'].includes(e.kind)),
    fieldsOK: all.every(e => e.actor && e.team === 0 && e.game >= 1 && typeof e.t === 'number' && typeof e.you === 'boolean'), cat, catEv, sav, savEv, youEvents: all.filter(e => e.you).length };
  out.simOK = out.sim.events > 0 && out.sim.uniqueIds && out.sim.kindsOK && out.sim.fieldsOK && cat === catEv && sav === savEv;
  // 2. wording
  prep(); fresh(0); g.mlog.push(ev('out', { victims: ['KELP'] }), ev('catchBack', { out: 'CORAL', back: 'DUKE' })); let p = g.buildPost({ win: true });
  out.personalWin = p.hlHead === 'Your Play of the Match' && /CORAL out and brought DUKE back in/.test(p.hl) && /^You brought a teammate back in\. That contribution matters\.$/.test(p.strength) && p.basis === 'you';
  prep(); fresh(0); g.stats.catches = 3; g.stats.backIn = 2; p = g.buildPost({ win: false });
  out.teamLossText = [p.strength, p.hl, p.hlHead, p.basis];
  out.teamLoss = p.hlHead === 'Your Match Highlight' && /^Your team: 3 catches, 2 teammates back in\.$/.test(p.hl) && /^A tough result, but your team brought 2 teammates back in\.$/.test(p.strength) && p.basis === 'team';
  prep(); fresh(0); g.mlog.push(ev('catch', { out: 'A' }), ev('catch', { out: 'B' }), ev('catch', { out: 'C' })); p = g.buildPost({ win: false });
  out.lossCatches = /^A tough result, but your 3 catches still count\.$/.test(p.strength);
  prep(); fresh(0); p = g.buildPost({ win: false });
  out.noData = p.strength === "One result doesn't define you. Let's focus on your next opportunity." && /No highlights were recorded/.test(p.hl) && p.hlHead === 'Your Match Highlight';
  prep(); fresh(0); g.mlog.push(ev('out', { victims: ['X'] }), ev('save', { saved: ['ROSA'], out: 'SCALES' }), ev('double', { victims: ['P', 'Q'] }), ev('double', { victims: ['R', 'S'] })); p = g.buildPost({ win: true });
  out.priority = p.top === g.mlog[2].id && /your throw put P and Q out together/.test(p.hl);
  prep(); fresh(0); g.mlog.push(ev('catch', { out: 'Z', you: false })); g.stats.catches = 1; p = g.buildPost({ win: true });
  out.aiNotYou = p.hlHead === 'Your Match Highlight' && /^Your team/.test(p.strength);
  // 3. next step: a confirmed next weekend opponent, else a Fiore rule
  prep(); fresh(0); localStorage.removeItem('fbg-weekend-v1'); g.wk = null; FBGame.weekend(); g.startWeekendMatch(); g.phase = 'play'; g.over = false; g.mlog = [];
  g.endMatch({ win: true, msg: 'x' }); const ni = g.wkInfo(g.wk), nt = ni ? (ni.opp === 'glitches' ? null : ni.opp) : null; p = g.pm;
  out.nextOpp = { kind: p.nextKind, next: p.next, opp: ni && ni.opp };
  out.nextScoutOK = p.nextKind === 'scout' && !!ni && p.next.indexOf('Next up: ') === 0;
  g.finishHandshake(); g.wkMatch = null;
  prep(); fresh(0); p = g.buildPost({ win: true }); out.fioreStep = p.nextKind === 'fiore' && p.next.length > 20;
  // 4. scouting and Jake cadence
  const exc = () => { g.mlog.push(ev('catchBack', { out: 'A', back: 'B' }), ev('save', { saved: ['C'], out: 'D' }), ev('out', { victims: ['E'] })); };
  const seq = []; fresh(0);
  for (let i = 1; i <= 11; i++) { prep(); exc(); const q = g.buildPost({ win: true }); seq.push([q.n, q.scout, q.jake]); }
  out.cadence = seq;
  out.scoutRule = seq[3][1] === false && seq[4][1] === true && seq[5][1] === false && seq[8][1] === false && seq[9][1] === true && seq.every(r => !(r[1] && r[2]));
  out.jakeRule = seq[2][2] === true && seq[5][2] === true && seq[0][2] === false && seq[1][2] === false;
  prep(); fresh(4); g.mlog.push(ev('out', { victims: ['E'] })); p = g.buildPost({ win: true }); out.scoutNeedsExceptional = p.n === 5 && !p.scout;
  prep(); fresh(4); exc(); p = g.buildPost({ win: false }); out.scoutNeedsWin = !p.scout;
  return out;
}"""

UI = r"""async (mode) => {
  const g = FBGame._game(), out = {};
  localStorage.setItem('fbg-post-v1', JSON.stringify({ n: mode === 'scout' ? 4 : 2, scoutAt: 0 }));   // the 3rd match: Jake; the 5th, exceptional: the scouting note
  g.wkMatch = null; g.start(); for (let i = 0; i < 400 && g.phase !== 'play'; i++) { if (g.phase === 'brief') g.briefGo = true; if (g.phase === 'rps' && g.rpsPick == null) g.rpsPick = 0; await new Promise(r => setTimeout(r, 30)); }
  g.mlog.push({ id: ++g.mseq, kind: 'catchBack', t: g.frame, game: 1, actor: g.user.name, num: g.user.num, team: 0, you: true, out: 'CORAL', back: 'DUKE' });
  if (mode === 'scout') g.mlog.push({ id: ++g.mseq, kind: 'save', t: g.frame + 5, game: 2, actor: g.user.name, num: g.user.num, team: 0, you: true, saved: ['ROSA'], out: 'SCALES' }, { id: ++g.mseq, kind: 'out', t: g.frame + 9, game: 2, actor: g.user.name, num: g.user.num, team: 0, you: true, victims: ['PEARL'] });
  g.endMatch({ win: true, msg: 'Test win.' }); g.finishHandshake();
  const post = g.$.card.querySelector('.fbg-post');
  out.postShown = !!post; out.focusOnGo = document.activeElement && document.activeElement.classList.contains('fbg-post-go');
  out.still = post && post.classList.contains('still'); out.hasVideo = !!g.$.card.querySelector('video'); out.hasJakeImg = !!g.$.card.querySelector('img.fbg-jake-art');
  out.jake = !!g.$.card.querySelector('.fbg-post-jake'); out.scout = !!g.$.card.querySelector('.fbg-post-scout');
  out.disclaimer = /Fictional USA-level recognition, not official scouting, affiliation or selection\./.test(g.$.card.innerText); out.text = post ? post.innerText : '';
  out.dashes = /[–—]/.test(g.$.card.innerHTML);
  const r = (el) => el && el.getBoundingClientRect(); const go = g.$.card.querySelector('.fbg-post-go'), gr = r(go);
  out.goVisible = !!gr && gr.bottom <= innerHeight + 1 && gr.top >= 0 && gr.width >= 44 && gr.height >= 44;
  out.noHScroll = document.documentElement.scrollWidth <= innerWidth + 1;
  return out;
}"""
UI2 = r"""() => {
  const g = FBGame._game(), out = {};
  const n0 = JSON.parse(localStorage.getItem('fbg-post-v1')).n;
  g.$.card.querySelector('.fbg-post').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  out.resultsAfterEsc = !!g.$.card.querySelector('.fbg-res') && !g.$.card.querySelector('.fbg-post');
  g.showResults(); out.reopenNoPost = !g.$.card.querySelector('.fbg-post') && !!g.$.card.querySelector('.fbg-res');
  out.countOnce = JSON.parse(localStorage.getItem('fbg-post-v1')).n === n0 && (n0 === 3 || n0 === 5);
  return out;
}"""

res = {}; bad = []
try:
    with sync_playwright() as p:
        for eng in ('chromium', 'webkit'):
            b = getattr(p, eng).launch(); errs = []
            pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.add_init_script(f"try{{localStorage.setItem('fbg-edition','{ED}')}}catch(e){{}}")
            pg.goto(f'http://127.0.0.1:{srv.server_port}/play/', timeout=120000); pg.wait_for_function('window.FBGame && FBGame._game() && FBGame.state()', timeout=120000)
            r = {'logic': pg.evaluate(LOGIC)}
            for (tag, vw, vh, rm) in (('1920', 1920, 1080, False), ('SEL', 667, 375, False), ('rm', 1280, 720, True), ('scout', 1920, 1080, False)):
                ctx = b.new_context(viewport={'width': vw, 'height': vh}, reduced_motion='reduce' if rm else 'no-preference', device_scale_factor=2 if tag == 'SEL' else 1)
                q = ctx.new_page(); q.on('pageerror', lambda e: errs.append(str(e)))
                q.add_init_script(f"try{{localStorage.setItem('fbg-edition','{ED}')}}catch(e){{}}")
                q.goto(f'http://127.0.0.1:{srv.server_port}/play/', timeout=120000); q.wait_for_function('window.FBGame && FBGame._game() && FBGame.state()', timeout=120000); q.wait_for_timeout(600)
                u = q.evaluate(UI, tag); q.wait_for_timeout(3200)
                if OUT: OUT.mkdir(parents=True, exist_ok=True); q.screenshot(path=str(OUT / f'post-{ED}-{eng}-{tag}.png'))
                u.update(q.evaluate(UI2)); u['text'] = u['text'][:400]; r[tag] = u; ctx.close()
            r['errors'] = errs[:3]; res[eng] = r; b.close()
            L = r['logic']
            checks = ['simOK', 'personalWin', 'teamLoss', 'lossCatches', 'noData', 'priority', 'aiNotYou', 'nextScoutOK', 'fioreStep', 'scoutRule', 'jakeRule', 'scoutNeedsExceptional', 'scoutNeedsWin']
            for c in checks:
                if not L.get(c): bad.append(f'{eng}:{c}')
            if not (r['scout'].get('scout') and r['scout'].get('disclaimer') and not r['scout'].get('jake')): bad.append(f'{eng}:scoutUI')
            for tag in ('1920', 'SEL', 'rm', 'scout'):
                u = r[tag]
                for c in ('postShown', 'focusOnGo', 'goVisible', 'noHScroll', 'resultsAfterEsc', 'reopenNoPost', 'countOnce'):
                    if not u.get(c): bad.append(f'{eng}:{tag}:{c}')
                if u['dashes']: bad.append(f'{eng}:{tag}:dashes')
                if tag == 'rm' and (not u['still'] or u['hasVideo'] or not u['hasJakeImg']): bad.append(f'{eng}:rm:still')
                if tag != 'scout' and not u['jake']: bad.append(f'{eng}:{tag}:jake')
                if tag in ('1920', 'SEL') and (u['still'] or not u['hasVideo']): bad.append(f'{eng}:{tag}:motion')
            if errs: bad.append(f'{eng}:errors')
    print('RECEIPT', json.dumps(receipt()))
    print(json.dumps(res, indent=1)[:9000])
    print(('PASS' if not bad else 'FAIL ' + ', '.join(bad)) + ' @ ' + json.dumps(receipt())); sys.exit(1 if bad else 0)
finally:
    srv.shutdown()
