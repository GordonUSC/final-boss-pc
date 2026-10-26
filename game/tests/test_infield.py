"""IN FIELD MOVEMENT (PC): each key moves the player the right way on the court, for a player on either side.
Run: python3 game/tests/test_infield.py"""
import functools, json, threading, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
JS = r"""(scheme) => {
  const g = FBGame._game(); g.opts.facts = false; g.setKM(scheme);
  g.start(); for (let i = 0; i < 4000 && g.phase !== 'play'; i++) { if (g.phase === 'brief') g.briefGo = true; if (g.phase === 'rps' && g.rpsPick == null) g.rpsPick = 0; g.tick(); }
  g.endRush(); g.aiIntent = () => ({ mx: 0, mz: 0, dash: 0, holdRun: false, throw: false, catch: false, catchHeld: false, jump: false, pass: false }); g.coachTick = () => {};
  const out = {};
  for (const team of [0, 1]) {
    const a = g.inPlayers(team).find(p => !p.held); g.user = a;
    for (const key of ['up', 'down', 'left', 'right']) {
      a.x = a.side * 5; a.z = 0; a.vx = a.vz = 0; a.set('idle'); a.oob = 0; a.role = 'in';
      g.keys = {}; g.keys[key] = true; const x0 = a.x, z0 = a.z;
      for (let i = 0; i < 20; i++) { g.keys[key] = true; g.tick(); }
      g.keys = {};
      out[team + ':' + key] = { toward: +(Math.abs(x0) - Math.abs(a.x)).toFixed(2), dz: +(a.z - z0).toFixed(2), side: a.side };
    }
  }
  return out;
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("try{localStorage.setItem('fbg-edition','pc')}catch(e){}")
        pg.goto(f'http://127.0.0.1:{srv.server_port}/play/'); pg.wait_for_function('window.FBGame && FBGame._game() && FBGame.state()', timeout=120000)
        inf = pg.evaluate(JS, 'infield'); std = pg.evaluate(JS, 'standard'); pg.evaluate("FBGame._game().setKM('standard')"); b.close()
    print(json.dumps({'infield': inf, 'standard': std}, indent=1))
    bad = []
    for team in (0, 1):
        r = lambda k: inf[f'{team}:{k}']
        side = r('up')['side']
        if not r('up')['toward'] > 0.3: bad.append(f'team {team} W not toward center')
        if not r('down')['toward'] < -0.3: bad.append(f'team {team} S not back')
        # facing the other team, your left is +side in z (FINAL BOSS on the left end faces +x, its left is -z)
        if not r('left')['dz'] * side > 0.3: bad.append(f'team {team} A not to the left')
        if not r('right')['dz'] * side < -0.3: bad.append(f'team {team} D not to the right')
        for k in ('left', 'right'):
            if abs(r(k)['toward']) > 0.2: bad.append(f'team {team} {k} moved along x')
    # STANDARD is unchanged: right is +x on screen, up is -z, for both teams
    for team in (0, 1):
        s = lambda k: std[f'{team}:{k}']
        if not s('up')['dz'] < -0.3 or not s('down')['dz'] > 0.3: bad.append(f'standard team {team} up/down changed')
    if errs: bad.append('page errors')
    print('PASS' if not bad else 'FAIL ' + '; '.join(bad), errs[:2]); sys.exit(1 if bad else 0)
finally:
    srv.shutdown()
