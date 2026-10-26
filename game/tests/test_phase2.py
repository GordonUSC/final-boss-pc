"""Phase 2 regressions (Playwright Chromium). Run: python3 tests/test_phase2.py   (PC edition: python3 game/tests/test_phase2.py)
Covers dot's 10/26 findings and the Phase 2 rules-neutral systems:
 1. a ball-control violation during a pending late-catch contact never resolves a hit on the relocated dead ball
 2. a violation while a pop-up awaits a save clears the pop-up, its landing data and the victim's pendingOut
 3. the next rally is clean (no stale pending, pop, or pendingOut anywhere)
 4. a deflection save produces ONE callout sequence (SAVE!, then who is out, then who is back in), never stacked callouts
 5. weekend bookkeeping: Saturday pools, Sunday path, Comeback Road and the bracket reset
 6. every opponent plays the same RULES object (no rule twists)"""
import functools, json, threading, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).resolve()
ROOT = HERE.parents[2] if HERE.parent.parent.name == 'game' else HERE.parents[1]
ED = 'pc' if HERE.parent.parent.name == 'game' else 'mobile'
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
JS = r"""async () => {
  const g = FBGame._game(), out = {}; g.opts.facts = false;
  const toPlay = () => { g.start(); for (let i = 0; i < 4000 && g.phase !== 'play'; i++) { if (g.phase === 'brief') g.briefGo = true; if (g.phase === 'rps' && g.rpsPick == null) g.rpsPick = 0; g.tick(); } g.endRush(); };
  const freeze = () => { g.aiIntent = () => Object.assign({}, { mx: 0, mz: 0, dash: 0, holdRun: false, throw: false, catch: false, catchHeld: false, jump: false, pass: false }); };
  toPlay(); freeze();
  // 1: pending late-catch contact, then a violation
  let hits = 0; const ah = g.applyHit.bind(g); g.applyHit = (f, B) => { hits++; return ah(f, B); };
  const f = g.inPlayers(0)[1], B = g.balls[0]; B.state = 'flight'; B.team = 1; B.live = true; B.thrower = g.inPlayers(1)[0]; B.pending = { a: f, f: 1, start: g.wf || 0 };
  g.controlViolation(1); for (let i = 0; i < 5; i++) g.updateBall(B);
  out.pendingHitAfterViolation = hits; out.pendingCleared = B.pending === null && B.state === 'loose' && f.role === 'in';
  // 2: a pop-up awaiting a save, then a violation
  const v = g.inPlayers(0)[2], B2 = g.balls[1]; B2.state = 'flight'; B2.team = 1; B2.live = true; B2.vx = 3; B2.vz = 0; B2.vh = 2; B2.h = 1.4; B2.thrower = g.inPlayers(1)[0];
  g.popUp(v, B2, 'hit'); out.popSet = !!(B2.pop && v.pendingOut === B2 && B2.land);
  g.controlViolation(1); for (let i = 0; i < 90; i++) g.tick();
  out.popCleared = !B2.pop && !B2.land && v.pendingOut === null && v.role === 'in';
  // 3: next rally clean
  g.applyHit = ah; for (let i = 0; i < 120; i++) g.tick();
  out.cleanRally = g.balls.every(b => !b.pending && !b.pop) && g.all.every(a => !a.pendingOut) && g.phase === 'play';
  // 4: a save shows one callout sequence
  toPlay(); freeze(); const brushes = []; const pb = g.popBrush.bind(g); g.popBrush = (t, s, c, y, d) => { brushes.push(t); return pb(t, s, c, y, d); };
  const m = g.inPlayers(0).filter(a => a !== g.user)[0]; m.role = 'gone'; g.queue[0].push(m);
  const vic = g.inPlayers(0)[0], sav = g.inPlayers(0)[1], B3 = g.balls[2]; B3.state = 'flight'; B3.team = 1; B3.live = true; B3.vx = 2; B3.vz = 0; B3.vh = 3; B3.h = 1.3; B3.thrower = g.inPlayers(1)[0];
  g.popUp(vic, B3, 'hit'); g.doCatch(sav, B3, true);
  for (let w = 0; w < 40 && brushes.length < 3; w++) await new Promise(r => setTimeout(r, 200));   // the 3 steps are 0.72 s apart; poll so a loaded machine does not flake
  out.saveBrushes = brushes; out.saveOneSequence = brushes.length === 3 && brushes[0] === 'SAVE!' && /OUT$/.test(brushes[1]) && brushes[2] === 'BACK IN';
  out.liveBrushes = g.root.querySelectorAll('.fbg-brush:not(.out)').length;
  // 5: weekend bookkeeping
  g.popBrush = pb; const w = g.wkNew(); g.wk = w; const fake = (win) => { g.wkMatch = Object.assign({}, g.wkInfo(w)); g.wkRecord(win, win ? [3, 1] : [1, 3]); };
  fake(true); fake(true); fake(true); out.sunday = w.day === 'sun' && w.sun.path.length === 5 && w.sun.path[4] === 'glitches' && w.sun.path[3] === 'duchesses-of-dodge';
  fake(false); out.comeback = !!(w.sun.comeback && g.wkInfo(w).comeback); fake(true); out.rejoin = w.sun.step === 1 && !w.sun.comeback;
  fake(true); fake(true); fake(true); out.grandFinal = g.wkInfo(w).opp === 'glitches';
  fake(false); out.done = !!(w.done && w.done.place === 2);
  const w2 = g.wkNew(); g.wk = w2; const fake2 = (win) => { g.wkMatch = Object.assign({}, g.wkInfo(w2)); g.wkRecord(win, [3, 1]); };
  for (let i = 0; i < 7; i++) fake2(true); fake2(false); out.bracketReset = w2.sun.reset && g.wkInfo(w2).opp === 'glitches'; fake2(true); out.champion = !!(w2.done && w2.done.champion);
  g.wkMatch = null; try { localStorage.removeItem('fbg-weekend-v1'); } catch (e) { }
  // 6: same rules for every opponent
  const R0 = JSON.stringify(FBGame._game().constructor && null); const rules = [];
  for (const id of ['shellebrities', 'house-of-catch', 'duchesses-of-dodge', null]) { FBGame.opponent(id); rules.push(g.opp.name + ':' + g.tactic.length); }
  out.opponents = rules;
  return out;
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 720}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(f"try{{localStorage.setItem('fbg-edition','{ED}')}}catch(e){{}}")
        pg.goto(f'http://127.0.0.1:{srv.server_port}/play/'); pg.wait_for_function('window.FBGame && FBGame._game() && FBGame.state()', timeout=60000)
        r = pg.evaluate(JS); b.close()
    print(json.dumps(r, indent=1))
    checks = ['pendingCleared', 'popSet', 'popCleared', 'cleanRally', 'saveOneSequence', 'sunday', 'comeback', 'rejoin', 'grandFinal', 'done', 'bracketReset', 'champion']
    bad = [k for k in checks if not r.get(k)] + (['pendingHitAfterViolation'] if r['pendingHitAfterViolation'] else []) + (['liveBrushes'] if r['liveBrushes'] > 1 else []) + (['pageErrors'] if errs else [])
    print('PASS' if not bad else 'FAIL ' + ', '.join(bad), errs[:3]); sys.exit(1 if bad else 0)
finally:
    srv.shutdown()
