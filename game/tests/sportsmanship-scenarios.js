// Run in the standalone demo after window.__demoReady. No rendered frames or wall-clock waits.
// Each fixture resets the real game and injects a seeded RNG only for boundary/block choices.
window.runSportsmanshipScenarios = () => {
  const g = FBGame._game(), results = [];
  cancelAnimationFrame(g.raf);
  const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const assert = (v, msg) => { if (!v) throw new Error(msg); };
  const idle = { mx: 0, mz: 0, dash: 0, holdRun: false, throw: false, catch: false, catchHeld: false, jump: false, pass: false };
  const reset = (seed = 1) => { g.resetMatch(); g.phase = 'play'; g.rushT = 300; g.ruleRandom = rng(seed); g.$.ov.hidden = true; g.hitstop = 0; return g.teams[0][0]; };
  const test = (name, fn) => { const evidence = fn(); results.push({ name, passed: true, evidence }); };
  test('walking player balances before center, with one chance per approach', () => {
    const a = reset(1); a.x = -0.20; a.z = 0; a.vx = 3.2; a.vz = 0; let calls = 0; const seeded = g.ruleRandom; g.ruleRandom = () => { calls++; return seeded(); };
    g.physics(a); g.rules(); assert(a.state === 'balance' && a.role === 'in', 'expected grounded save');
    for (let i = 0; i < 18; i++) { g.control(a, idle); g.physics(a); g.rules(); }
    assert(a.x < -0.20 && a.role === 'in', 'balance must move inward');
    a.vx = 3.2; for (let i = 0; i < 20 && a.role === 'in'; i++) { g.physics(a); g.rules(); }
    assert(a.role === 'gone' && calls === 1, 'holding toward line must still risk out without repeated saves');
    return { seed: 1, randomCalls: calls, finalRole: a.role };
  });
  test('running stumble can cross and be called out', () => {
    const a = reset(1337); a.x = -0.20; a.z = 0; a.vx = 6.5; a.set('run');
    g.physics(a); assert(a.stumbleT > 0 && a.state !== 'balance', 'seed must stumble');
    for (let i = 0; i < 8 && a.role === 'in'; i++) { g.physics(a); g.rules(); }
    assert(a.role === 'gone', 'failed balance should not create an invisible wall'); return { seed: 1337, outOrder: a.outOrder };
  });
  test('both teams and both sidelines get equal grounded awareness', () => {
    const evidence = [];
    for (const team of [0, 1]) for (const sign of [-1, 1]) { reset(1); const a = g.teams[team][0]; a.x = a.side * 4; a.z = sign * 4.6; a.vx = 0; a.vz = sign * 3; g.physics(a); g.rules(); assert(a.state === 'balance' && a.role === 'in', 'side save'); evidence.push({ team, sign, state: a.state }); }
    return evidence;
  });
  test('rush crossing and legal back retrieval are not blocked', () => {
    const a = reset(1); let calls = 0; g.ruleRandom = () => { calls++; return 0; }; g.rushT = 0;
    g.balls.forEach((b, i) => { b.state = 'rest'; b.rushTeam = i < 3 ? 0 : 1; });
    a.x = -0.01; a.z = 0; a.vx = 3.2; g.physics(a); g.rules(); assert(a.x > 0 && a.role === 'in', 'legal opening rush crossing');
    g.rushT = 300; a.x = -9.15; a.z = 0; a.vx = -2; a.oob = 1; g.balls[0].state = 'loose'; g.balls[0].x = -10;
    g.physics(a); g.rules(); assert(a.role === 'in' && a.oob > 0 && a.x < -9, 'back retrieval'); assert(calls === 0, 'no random saves on legal routes');
    a.oob = 600; g.control(a, idle); assert(a.role === 'gone', 'ten-second back rule remains'); return { randomCalls: calls, timedOut: true };
  });
  test('airborne and already-crossed players cannot be rescued', () => {
    for (const air of [false, true]) { const a = reset(1); a.x = air ? -0.01 : 0.20; a.z = 0; a.vx = 6.5; a.h = air ? 0.4 : 0; a.state = air ? 'air' : 'walk'; g.physics(a); g.rules(); assert(a.role === 'gone', 'illegal crossing remains out'); }
    return true;
  });
  test('FIFO reserves elimination order despite different KO durations', () => {
    const a = reset(), b = g.teams[0][1], catcher = g.teams[0][2], thrower = g.teams[1][0];
    g.eliminate(a, 'power'); g.eliminate(b, 'caught'); b.st = 50; g.koStep(b);
    assert(a.role === 'gone' && b.role === 'outline', 'animation order fixture'); assert(g.queue[0][0] === a && g.queue[0][1] === b, 'FIFO changed by arrival');
    const ball = g.balls[0]; ball.thrower = thrower; ball.team = 1; g.doCatch(catcher, ball, true);
    assert(a.role === 'returning' && a.popScale === 1 && a.h === 0 && g.queue[0][0] === b, 'catch must return first eliminated even during KO');
    a.backF = 300; g.control(a, idle); assert(a.role === 'in', 'reentry'); g.eliminate(a, 'caught'); assert(g.queue[0][1] === a, 'repeat elimination goes to back');
    return g.queue[0].map(a => ({ name: a.name, order: a.outOrder }));
  });
  const flight = (team = 1) => {
    const b = g.balls[0]; Object.assign(b, { state: 'flight', live: true, crossed: true, cleared: true, fromSide: team === 0 ? -1 : 1, team, thrower: g.teams[team][0], x: -0.02, z: 0, h: 1.2, vx: -15, vz: 0, vh: 0, grav: 6, type: 'normal' }); return b;
  };
  test('lofted block stays live over center, then dies on first floor touch', () => {
    reset(1); const defender = g.teams[0][1], b = flight(); g.give(defender, g.balls[1]); g.block(defender, b, true); const thrower = b.thrower;
    assert(b.vh === 6.5 && b.live, 'timed block loft'); g.updateBall(b); assert(b.x > 0 && b.live && b.state === 'flight' && b.thrower === thrower, 'cross-center deflection stays live');
    let ticks = 1; while (b.state === 'flight' && ticks++ < 240) g.updateBall(b);
    assert(b.state === 'loose' && !b.live && b.thrower === null && b.h === 0.22, 'floor ends catchable ball'); return { ticks, state: b.state };
  });
  test('untimed blocks can produce low and high deflections', () => {
    const heights = [];
    for (let seed = 1; seed < 20; seed++) { reset(seed); const b = flight(); g.block(g.teams[0][1], b, false); heights.push(b.vh); }
    assert(heights.includes(3) && heights.includes(6.5), 'both trajectories should occur'); return [...new Set(heights)];
  });
  test('opponent catch of blocked flight eliminates original thrower and returns FIFO teammate', () => {
    const out = reset(), defender = g.teams[0][1], catcher = g.teams[0][2], b = flight(); g.eliminate(out, 'power'); g.block(defender, b, true); const thrower = b.thrower;
    catcher.x = -3; catcher.z = 0; catcher.yaw = Math.PI / 2; catcher.catchF = g.frame; catcher.set('catchready'); b.x = catcher.x; b.z = catcher.z; b.h = catcher.scale; b.vx = -3; b.vz = 0;
    g.ballHits(); assert(b.holder === catcher && b.state === 'held', 'live loft was not caught'); assert(thrower.role === 'gone' && out.role === 'returning', 'catch penalties/reentry incorrect');
    return { originalThrower: thrower.name, returned: out.name };
  });
  test('throwing team can secure returning deflection without friendly-fire or reentry reward', () => {
    const out = reset(), thrower = g.teams[0][0], catcher = g.teams[0][2], b = flight(0); g.eliminate(g.teams[0][3], 'caught'); g.block(g.teams[1][1], b, true);
    catcher.x = -3; catcher.z = 0; catcher.catchF = g.frame; catcher.set('catchready'); b.x = catcher.x; b.z = 0; b.h = catcher.scale; const q = g.queue[0].length; g.ballHits();
    assert(b.holder === catcher && thrower.role === 'in' && g.queue[0].length === q && g.stats.backIn === 0 && g.stats.catches === 0, 'friendly recovery must not eliminate or reward'); return true;
  });
  test('deflected flight at arena edge remains catchable until floor', () => {
    reset(); const b = flight(); g.block(g.teams[0][1], b, true); b.x = 12.29; b.vx = 6; b.h = 2; g.updateBall(b); assert(b.live && b.state === 'flight' && b.vx < 0, 'arena-edge loft became dead early'); return true;
  });
  test('postmatch forms single files, greets all opposing players, then resets cleanly', () => {
    reset(); g.eliminate(g.teams[0][0], 'power'); g.teams[0][0].popScale = 0; g.endMatch({ win: true, msg: 'Fixture complete.' });
    assert(g.phase === 'handshake' && g.all.every(a => a.role === 'ceremony' && a.popScale === 1 && !a.held), 'everyone joins');
    for (let i = 0; i < 240; i++) g.handshakeTick();
    assert(g.handshake.stage === 'pass', 'assemble transition');
    for (let t = 0; t < 2; t++) { const line = g.handshake.lines[t]; assert(line.every(a => Math.abs(a.z - (t ? -0.70 : 0.70)) < 0.1), 'single-file lane'); for(let i=1;i<line.length;i++)assert(Math.abs(line[i].x-line[i-1].x)>0.70,'spacing'); }
    for (let i = 0; i < 240; i++) g.handshakeTick();
    assert(g.phase === 'result' && g.handshake.pairs.size === 64 && !g.$.ov.hidden, 'handshake pass/results'); const greetings = g.handshake.pairs.size;
    g.start(); assert(!g.handshake && g.queue.every(q => !q.length) && g.all.every(a=>a.role==='in') && g.balls.every(b=>b.mesh.visible&&b.shadow.visible&&b.glow.visible), 'rematch reset'); return { greetings };
  });
  test('reduced-motion ceremony and explicit skip finish safely', () => {
    reset(); g.rm = true; g.endMatch({ win: false, msg: 'Good game.' }); for (let i = 0; i < 285; i++) g.handshakeTick(); assert(g.phase === 'result' && g.handshake.pairs.size === 64, 'reduced-motion ceremony');
    reset(); g.endMatch({ win: true, msg: 'Skipped.' }); g.finishHandshake(); assert(g.phase === 'result', 'skip'); g.rm = false; return true;
  });
  g.resetMatch(); g.phase = 'title'; g.showTitle(); g.ruleRandom = Math.random;
  return results;
};
