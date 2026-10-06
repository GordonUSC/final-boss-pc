# Stay in the Rally — unpublished gameplay experiment

The player experience goal is to notice a dangerous boundary, see an athlete try to recover, and retain the risk of an actual overstep. Eliminations should visibly respect who went out first. A blocked ball should create an understandable second-chance catch. After competition, all teammates should participate in sportsmanship.

## Behavior and choices

- Before an illegal center/side crossing, a grounded, uncommitted player gets one balance attempt per approach: 88% at ordinary movement speed, 55% above 4.5 units/second outward speed. Success produces an 18-frame bracing pose and an inward step. Failure shows a stumble and preserves movement. Continuing toward the edge can still cause an out; there are no repeated rerolls until the player retreats at least 0.9 units. These are initial tuning values, not approved final odds.
- No rescue after crossing, while airborne, knocked back or locked in another action. Opening-rush crossing and permitted back-line ball retrieval remain legal. The existing ten-second back limit remains. Both teams now receive the same crossing calls; CPU players no longer have an invisible clamp that makes them immune.
- An elimination immediately reserves a FIFO queue position. The player still finishes their existing knockout animation, but arrival time cannot reorder the queue. A catch returns the earliest eliminated teammate, including when their animation has not finished; reentry restores their visible body and clears knockback.
- Timed blocks loft the ball; untimed successful blocks can produce a higher or lower rebound. Deflections keep the original thrower and remain live across center until floor contact. A catch by the opposing team eliminates the original thrower and restores the first teammate in the queue. The original throwing team can secure a returning deflection without friendly-fire, catch points or a free reentry. Existing body-hit/headshot rules remain. Arena-edge deflections rebound gently and stay live until the floor.
- Match end assembles each team in a single file, then moves the two lines past each other with chest-height greeting gestures. All 64 opposing pairs can exchange a greeting. Results follow automatically; View result or Enter skips the ceremony. Reduced motion shortens assembly and removes the walk into position. Rematch resets ceremony state, queues, input and ball visibility.

All work is local on `codex/boss-rush-sportsmanship`, based on player-art commit `17e06a1c3a470fd521dbd953f1498977b17ad1d2`. It has not been published. The separate arena release is live, and another actor subsequently merged shell PR #1. Remote main was verified as `dc98209b7df7488728e975846a7607437d5ca157`; any future integration must preserve that work rather than replace main with this branch.

## Validation and evidence

`python3 game/tests/test_sportsmanship.py` runs the real game in isolated Playwright Chromium. Fourteen deterministic scenario groups cover recovered and failed boundaries, both teams and sidelines, legal rush/back routes, airborne/already-crossed outs, mixed-duration knockouts and FIFO reentry, low/high blocks, live center crossing and floor transitions, enemy catches, friendly recovery, arena-edge flight, all 64 handshake pairs, reduced motion, skipping, rematch reset and context-loss protection during the ceremony.

Separate browser-input checks use ArrowRight, K, View result and Rematch. ArrowRight caused a balance recovery; K caught the lofted block, eliminated its original thrower and restored the first teammate. Screenshots and a short video show actual local engine rendering from controlled fixtures. The video is explicitly labeled STAGED QA with slowed simulation; it is not organic match footage or a frame-rate benchmark. Tests and captures never control another actor's Chrome.

Evidence is in the task workspace: `evidence/gameplay-scenarios.json`, `evidence/gameplay/real-input.json`, the arena screenshots, and the staged video/receipt. The source, generated classic bundle and bundle cache stamp are the product changes. No extra model, external art, game asset or draw call is introduced.

## Game-design review

MDA: boundary balance, FIFO restoration and live deflections create recovery decisions and rally continuity; the handshake expresses respect after a win or loss. Achievers retain match/score goals; explorers can learn rebound trajectories; socializers see the named team acknowledged; competitors face the same line rules on both sides. No online-play claim.

The essential experience is a readable team rally. The toy is catching a second-chance ball. Surprise comes from a saved edge or a lofted block. Flow retains the existing input scheme. Meaningful choice is slowing near a boundary versus a risky fast approach; there is no guaranteed save. Skill remains central, with limited explicit chance requested by Gordon. Visible bracing, stumbling, queue order and the rebound connect actions to outcomes. Sportsmanship complements the gift's team identity without gating its content.

Author critique, not user acceptance: Toy 2/3, Flow 2/3, Meaningful Choices 2/3, Juiciness 2/3, Learning 2/3, Elegance 2/3. Weakest remaining point: balance odds need a human feel test across longer matches. A full match, Windows hardware, subjective audio and reliable FPS have not been certified. This is a reviewable gameplay direction, not an approved release.
