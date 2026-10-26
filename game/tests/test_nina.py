"""Coach Nina Fiore's plays (STRATEGY.md, 2026-10-26): DELAY, SMALL X, WIDE X, the rush plan. Run: python3 tests/test_nina.py (PC: python3 game/tests/test_nina.py)"""
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
JS = r"""() => {
  const g = FBGame._game(), out = {}; g.opts.facts = false;
  const toPlay = () => { g.start(); for (let i = 0; i < 4000 && g.phase !== 'play'; i++) { if (g.phase === 'brief') g.briefGo = true; if (g.phase === 'rps' && g.rpsPick == null) g.rpsPick = 0; g.tick(); } g.endRush(); };
  const hold = (a) => { const b = g.balls.find(x => x.state !== 'held'); if (!b) return; if (b.holder) { b.holder.held = null; } g.give(a, b); b.cleared = true; };
  toPlay();
  const M = g.inPlayers(0).filter(a => a !== g.user).slice(0, 3); M.forEach(hold); const foes = g.inPlayers(1);
  M[0].rt.acc = 0.6; M[1].rt.acc = 0.93;
  // DELAY: the follow ball (about 1 s later) goes to the more ACCURATE thrower, both on one key player
  g.ninaPlan('delay', M.slice(0, 2), foes); const D = g.ninaCalled;
  out.delay = D.follow === M[1] && D.follow.ai.plan.s.at - D.lead.ai.plan.s.at === 60 && D.lead.ai.plan.s.target === D.follow.ai.plan.s.target;
  // SMALL X on one player: same instant, left and right shoulder (or shin), never head height, no-look; the third holder pump-fakes with the release
  g.ninaPlan('xone', M, foes); const X = g.ninaCalled, [a, b] = X.throwers;
  out.xone = a.ai.plan.s.at === b.ai.plan.s.at && a.ai.plan.s.target === b.ai.plan.s.target && a.xAim.side === -b.xAim.side && (X.h === 1.3 || X.h === 0.3) && X.h < 1.6 && a.noLook && b.noLook && M[2].ai.plan.k === 'pumpAt';
  { const pc0 = (g.aiStats || {}).ninaPumpCover || 0; g.aiIntent(M[2]); g.frame = M[2].ai.plan.at; g.aiIntent(M[2]); out.pumpCover = ((g.aiStats || {}).ninaPumpCover || 0) > pc0 && M[2].state === 'pump'; }
  // WIDE X: never on known catchers
  for (const f of foes) f.rt.catch = 0.9;
  out.wideNeverCatchers = g.ninaWidePair(foes) === null && g.ninaPlan('xwide', M.slice(0, 2), foes) === false;
  // WIDE X on two dodgers next to each other: the corner and the wing, throws crossing
  for (const f of foes) { f.rt.catch = 0.45; f.rt.foot = 0.8; }
  const c = foes[0], w = foes[1]; c.x = 7.5; c.z = -(4.6); w.x = 6.6; w.z = -(3.2); for (const f of foes.slice(2)) { f.x = 4; f.z = 2 + Math.random(); }
  M[0].z = -3; M[1].z = 3; M.forEach(m => { if (!m.held) hold(m); m.ai.plan = null; });
  const ok = g.ninaPlan('xwide', M.slice(0, 2), foes), W = g.ninaCalled;
  out.wide = ok && W.targets.includes(c) && W.targets.includes(w) && W.throwers[0].ai.plan.s.target.z > W.throwers[1].ai.plan.s.target.z && W.throwers.every(m => m.noLook);
  // ball control: with 2 balls against their 2, no play (two throws would hand them every ball)
  toPlay(); for (const x of g.balls) { if (x.holder) { x.holder.held = null; x.holder = null; } x.state = 'loose'; x.x = 0.02; }
  const F = g.inPlayers(0).filter(a => a !== g.user), E = g.inPlayers(1); hold(F[0]); hold(F[1]); hold(E[0]); hold(E[1]);
  g.ninaCool = 0; const save = Math.random; Math.random = () => 0.01; out.controlRule = g.ninaCall(0, F.slice(0, 2)) === false; Math.random = save;
  // the rush: game 1 protects; from game 2 the one-ball play only for a team whose rushers were faster; the strongest arm throws it
  g.gameNo = 1; g.rushWins = [3, 0]; g.ninaRushStart(); out.rushGame1Protect = !g.rushPlay[0] && !g.rushPlay[1];
  g.gameNo = 2; g.ninaRushStart(); out.rushGame2 = g.rushPlay[0] && !g.rushPlay[1];
  for (const x of g.balls) { if (x.holder) { x.holder.held = null; x.holder = null; } x.state = 'loose'; } g.rushT = 10; const R = g.inPlayers(0).filter(a => a !== g.user && !a.held).slice(0, 2); R[0].rt.power = 0.6; R[1].rt.power = 0.94; for (const r of R) { hold(r); g.ninaRushPick(r); }
  out.rushOneBall = g.rushOne[0] === R[1] && R[1].rushThrow;
  // rushed balls go behind the attack line to the corners
  const r0 = R[0]; r0.held.cleared = false; r0.x = -1; r0.z = 1.0; r0.rushCarry = true; r0.rushThrow = false; const it = g.ninaHold(r0, { mx: 0, mz: 0 });
  out.rushToCorner = !!it && it.mx < 0 && it.mz > 0;
  // in play: run AI matches and count the calls
  g.simAll = true; g.userIntent = () => g.aiIntent(g.user); g.dead = true; const s0 = Object.assign({}, g.aiStats || {});
  for (let m = 0; m < 2; m++) { g.dead = false; g.start(); g.dead = true; for (let i = 0; i < 36000 && g.phase !== 'result' && g.phase !== 'handshake'; i++) { if (g.phase === 'brief') g.briefGo = true; if (g.phase === 'rps' && g.rpsPick == null) g.rpsPick = 0; g.tick(); } }
  g.dead = false; const st = g.aiStats || {}, d = (k) => (st[k] || 0) - (s0[k] || 0);
  out.inPlay = { delay: d('nina_delay'), xone: d('nina_xone'), xwide: d('nina_xwide'), rushOneBall: d('rushOneBall'), rushToCorner: d('rushToCorner'), pumpCover: d('ninaPumpCover'), heldForControl: d('ninaHeldForControl'), ballsDelay: d('ninaBall_delay'), ballsX: d('ninaBall_xone') + d('ninaBall_xwide') };
  out.playsInPlay = out.inPlay.delay > 0 && out.inPlay.xone + out.inPlay.xwide > 0 && out.inPlay.rushToCorner > 0;
  return out;
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 720}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(f"try{{localStorage.setItem('fbg-edition','{ED}')}}catch(e){{}}")
        pg.goto(f'http://127.0.0.1:{srv.server_port}/play/'); pg.wait_for_function('window.FBGame && FBGame._game() && FBGame.state()', timeout=120000)
        r = pg.evaluate(JS); b.close()
    print(json.dumps(r, indent=1))
    bad = [k for k in ('delay', 'xone', 'pumpCover', 'wideNeverCatchers', 'wide', 'controlRule', 'rushGame1Protect', 'rushGame2', 'rushOneBall', 'rushToCorner', 'playsInPlay') if not r.get(k)] + (['pageErrors'] if errs else [])
    print('PASS' if not bad else 'FAIL ' + ', '.join(bad), errs[:3]); sys.exit(1 if bad else 0)
finally:
    srv.shutdown()
