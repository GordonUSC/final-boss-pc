"""Requires Python + Playwright Chromium. Run: python3 game/tests/test_sportsmanship.py"""
import functools, json, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/game/demo.html',wait_until='domcontentloaded');page.wait_for_function('window.__demoReady');page.wait_for_timeout(2000)
  page.add_script_tag(path=str(Path(__file__).with_name('sportsmanship-scenarios.js')))
  result=page.evaluate('runSportsmanshipScenarios()');assert not errors,errors
  page.evaluate("()=>{let g=FBGame._game();g.endMatch({win:true,msg:'Fallback scenario'});g.renderer.getContext().getExtension('WEBGL_lose_context').loseContext()}")
  page.wait_for_function("FBGame.state().phase==='unavailable'")
  page.evaluate('FBGame.pause();FBGame._game().finishHandshake()')
  assert page.locator('.fbg-reload').is_visible()
  assert page.evaluate("FBGame._game().phase==='handshake' && FBGame._game().$.ov.hidden")
  result.append({'name':'context loss during handshake keeps fallback visible and blocks result overlay','passed':True})
  print(json.dumps({'cases':result,'pageErrors':errors},indent=2));browser.close()
finally:server.shutdown()
