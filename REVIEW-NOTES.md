# Broadcast Arena — local PC graphics experiment

Boss Rush keeps the same game and the original roster, kit system, arena imagery and optional audio. This refinement makes the action clearer: more neutral court lighting, restrained reflections and bloom, subtle court markings, ivory ball seams and a larger YOU marker. Miami retains its distinct atmosphere.

The PC renderer now bounds pixel allocation by tier (4M Ultra, 3M High, 2M Medium, 1.2M Low), uses smaller reflection targets and a 2048 maximum shadow map, and starts Auto at High on desktop / Medium on coarse devices. Ultra remains selectable. HDR bloom is gated on float color-buffer support. GPU loss stops simulation/audio and presents the existing poster with a reload action; failed WebGL initialization exposes the same usable fallback.

The production bundle was regenerated and its cache stamp updated. `python3 game/build_bundle.py` reproduces it using the vendored Three.js library and original local textures. The previously ignored builder is included so a reviewer can reproduce changes.

Alternative considered: heavier neon effects. The Broadcast Arena treatment prioritizes spotting the ball while preserving the team's gift identity. It is experimental, not an approved release.

Receipts and actual before/after screenshots accompany this branch in the task workspace `evidence/` and `review.html`. This Mac's isolated headless-browser results are not Windows GPU certification. No push, merge or deployment.
