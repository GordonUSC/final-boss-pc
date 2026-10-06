# Athletic Arcade — unpublished player-art experiment

Purpose: make Boss Rush players read as an articulated dodgeball squad, with clearer identities and throws, while retaining the existing stylized cast. This is a focused art pass on the published Broadcast Arena base, commit 13f1f789a3d41b9815e8c073f5b5462b929e7d1f. It is not yet approved for publication.

Direction selected: Athletic Arcade. Continuous tapered arms, a compact shorts silhouette, a subtle head/face proportion adjustment, matte fabric, stronger chest numbers, and names positioned on the upper back. Overhand windup and airborne holding poses show the throwing hand above the shoulder; follow-through twists less deeply; ducking protects the front of the body. The existing stance-spread values now blend with the other joints.

Alternative considered: realistic athlete likenesses. That would require new approved reference material, substantially different models and more rendering cost. This pass uses only original procedural geometry and canvas artwork. No inferred race, new likeness, hair or skin changes. ROSTER and APPEAR definitions remain byte-identical, including KRAMER 31. Every kit retains its color system, with ivory/dark number ink only when needed for contrast.

Implementation: game/game.js, regenerated game/game.bundle.js, and the index.html bundle cache stamp. No game rules, collision bounds, release trajectory, input timing, roster identity, audio, arena rendering budgets or quality tiers change. The existing eight-player jersey replacement flow remains intact. The earlier draft usability PR #1 is outside this branch.

Review evidence: matching actual Chromium captures from the published baseline and this branch. Close-up scenes use a fixed diagnostic camera, cloned in-game meshes, the existing arena lights and exact pose functions, so they are not ordinary gameplay screenshots or generated illustrations. Separate gameplay captures and real keyboard checks are included. Before/after ready, back, windup (with held balls), release, duck and long-name views are available in the task's evidence/player-art directory.

Rendering: the three-player ready sample falls from 206,704 to 144,064 triangles (30.3%) with the same 34 draw calls. Existing merged meshes are retained. This is measured geometry cost, not an FPS claim. Geometry winding was inspected and outward-facing arm normals tested after the final refinement.

Validation: source identity/tuning equality; eight unchanged core gameplay methods; real opening flow, arrow movement, pause/resume; keyboard throw from an explicitly controlled ball-possession fixture; all 20 looks repaint all eight squad jerseys; both arenas; all 20 pose functions across all 16 athletes yield finite transforms; all four quality tiers; full-width Retina Ultra below 4M pixels; reduced-motion phone; context-loss reload and disabled-WebGL fallback. Build reproducibility and JavaScript syntax checked. The exact receipts are packaged separately in the task workspace.

Limits: the close-ups use a diagnostic scene; a complete match, subjective audio, Windows hardware and a reliable frame-rate benchmark are not certified. The new poses remain an exploratory aesthetic choice for Gordon to review. Published arena PR #2 is already live; this subsequent player-art branch has not been pushed or deployed.
