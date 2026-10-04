# AdS CFT

Cosmic Flight Trainer.

The home screen selects your pilot. Use arrow keys to move between pilots; selection wraps at either end, and Tab also reaches the selected pilot and launch controls. Launch Flight or Enter opens five briefing popups over the visible game, one paragraph per popup. The opening reads ‘The year is 2126 AD, or 98 AAGI.’ Enter or the × dismisses the current paragraph and opens the next; the last dismissal starts flight. Next/Begin Flight buttons and Escape also advance the briefing. Longer paragraphs scroll inside the popup on smaller screens; the close and continue controls remain visible. Ship clocks stay stopped while you read.

The retro launch screen lets you select a pilot and enable an original procedural synth score. Audio starts on a user gesture; the cockpit Sound button mutes it.

A self-contained browser flight simulator in the universal cover of global AdS4. [Play AdS CFT](https://henrywlin.github.io/ads-cft/), or run `python -m http.server 8080 --directory dist` and visit http://localhost:8080. Requires WebGL 2. No build or dependencies are required.

Choose an arcade pilot at launch or in the header: Juan Maldacena, Steven Gubser, Igor Klebanov, Alexander Polyakov, or Edward Witten. The generated pixel-art portraits follow photographs from the [Maldacena](https://www.ias.edu/scholars/maldacena), [Klebanov](https://phy.princeton.edu/people/igor-klebanov), [Polyakov](https://phy.princeton.edu/people/alexander-polyakov), and [Witten](https://www.ias.edu/scholars/witten) institutional pages, plus the Gubser photograph supplied by the user. Traffic includes original rocket hulls plus Discovery-inspired spines and command spheres, Dune-inspired carriers, and Star Trek-inspired saucer/nacelle hulls. Every traffic hull uses the same exact null-worldtube geometry.

Controls: W/S forward/reverse burn; arrow keys pitch/yaw; Q/E roll; F or a click fires a laser; Space brakes relative to a local static observer; P pauses; R resets ships, lasers and clocks. Dragging the view steers. The header camera button switches between chase and cockpit views; chase shows your rocket. Clickable controls appear automatically on phones and touch devices, and the keyboard icon toggles them on any screen. Hold steering, thrust, reverse, brake or roll; hold FIRE for repeated shots. Multiple simultaneous touches are supported and releasing or cancelling a touch stops its action. Pause and camera controls are next to the flight buttons. The controls sit below the scene in portrait and beside it in short landscape views. Thrust acceleration and time warp are adjustable in the instrument panel.

## Geometry

The metric is `ds² = −(1+r²/L²)c²dt² + dr²/(1+r²/L²) + r²dΩ₂²`. Dimensionless engine units set c=L=1. The display scale is L/c=30 seconds.

The ambient embedding has signature (−,−,+,+,+) and `X·X=−1`. The player's proper clock drives the simulation; global time is unwrapped from the embedding's timelike plane. Traffic is evaluated at that global time, with nonzero conserved angular momentum. Coasting is exact: `X(s)=A cos(s)+B sin(s)`. Rocket acceleration uses second-order boost–geodesic–boost splitting, with maximum proper step 0.004. The ship's frame is Fermi–Walker transported under burns and parallel transported in free fall. There is no artificial velocity damping.

Two of the 72 ships follow exact circular geodesics at r=10L and r=20L, highlighted in gold on the orbital map. At radius R=r/L, these have local speed `β=R/√(1+R²)`, specific energy `E/(mc²)=1+R²`, specific angular momentum `h/(cL)=R²`, and angular frequency c/L. Their proper and global clocks advance equally. Finite-energy massive ships remain inside the conformal boundary.

For a unit rest-frame viewing direction d, every pixel constructs the exact past null ray `Y(λ)=X+λK`, where `K=−U+d_i E_i`. The boundary endpoint is `normalize(K.xyz)`. This includes observer aberration and AdS optical curvature without numerical ray marching. The 6,000 stars are fixed points sampled uniformly on S2, the spatial conformal boundary. The boundary spacetime is R×S2; an S3 hemisphere is the bulk optical spatial geometry.

Moving ships are extended geodesic-adapted Fermi hulls. Their spatial Fermi embedding coordinates are `Y·C_i`. Ellipsoidal hull/wing intersections reduce to quadratic equations along each null ray, including the retarded emission event. Exact enclosing-sphere silhouettes, transformed into the observer frame, accelerate visibility checks. Each hit computes its frequency ratio `ω_observed/ω_emitted`. Boundary frequency uses the conformal time convention, with gain `1/(X₁K₀−X₀K₁)`. Absolute proper frequencies cannot be assigned to static emitters at infinity.

The boundary reflects specularly at the optical hemisphere's equator. Unfolded optical null paths are great circles `q(δ)=Q cos(δ)+D sin(δ)` on S3; taking the absolute value of the hemisphere coordinate implements every reflection without a cutoff. Future-directed laser rays use this same geometry, with exact direct and reflected intersections against moving traffic hulls. Impacts are scheduled in global time, destroy the first surviving hull hit and absorb the pulse. Pulses missed on the first circuit can continue around the cavity. Camera rays include reflected traffic images and light-travel delay before a destruction is seen. Once the direct destruction reaches the observer, the game shows a large 1.6-second blast with a shock ring and debris, then removes every image of that ship. This final cleanup is a gameplay convention: an ideal reflecting cavity could retain its older light.

The chase camera is a comoving observer offset from the player's center. The visible player rocket is a current-frame osculating hull proxy, keeping its nose, exhaust and controls coherent during turns and acceleration. Its self-image is a gameplay display convention rather than a delayed photograph of the actual accelerated hull. The camera remains an AdS observer, and traffic hull intersections retain analytic, retarded null optics. Laser heads and their thick luminous tracers show the current pulse position along the optical path as an arcade visibility aid. Glow, the immediate muzzle flash, explosion particles and their display durations are stylized. Launch pulses arm after clearing the player's hull, then can strike it on a later passage.

## Physical limits

This is a test-body simulation: ships do not gravitate, consume fuel, or collide mechanically with each other. Laser absorption destroys traffic without modeling its recoil, material response or self-gravity. Hull geometry, colors, exposure, and illumination are stylized. Frequency ratios and ray geometry are computed from the metric; the visual color/exposure response is artistic rather than a full spectral radiative-transfer model. The GPU uses 32-bit floats, while flight uses JavaScript doubles. Very large radius or gamma can exhaust precision, in which case the game pauses with an explicit notice.

Click the orbital map or press M to open a larger version; M or Escape closes it. It shows the same global-time positions, traffic orbits, outer orbiters and laser paths at higher display resolution. Opening the map pauses flight input and advancement until it closes. The orbital map is a simultaneous global-time x/z projection of the conformal ball. Both camera views use retarded traffic positions; the chase view uses the current-frame proxy for the player ship. The metric and approximations are also documented in the game's physics dialog.

## Browser rendering

The floating-point ship texture explicitly uses a high-precision sampler, avoiding precision loss on WebGL implementations such as Safari's Metal backend. The star atlas is limited to 2048 pixels across; overlay pixel density is capped to reduce mobile memory use. The renderer adapts its resolution when GPU frames run slowly, without changing the geodesic calculation. It ignores idle/paused/background gaps, keeps a viewport-based minimum resolution on hardware GPUs, and restores detail after sustained fast frames. The Graphics selector also offers fixed High and Performance settings. Software renderers retain a conservative Auto budget. Overlay effects update independently of the GPU queue. While the WebGL context is lost, flight clocks stop and controls are cleared; input and firing stay disabled until restoration. The renderer rebuilds its shaders and textures before flight resumes. Fullscreen includes the map and all dialogs.

## Verification

Run `node tests/physics.mjs`, `node tests/lasers.mjs`, `node tests/resolution.mjs`, `node tests/music.mjs`, and `node tests/traffic.mjs`. The rendering checks cover idle-time rejection, minimum detail, recovery after slow frames, and fixed quality presets. The checks cover free geodesic conservation, accelerated tetrad constraints, integration convergence, circular outer orbits, retarded light cones, exact boundary frequency/time formulas, clock rates, specular reflections, direct/reflected hull impacts, chronological absorption, and immediate absorption inside a hull. Browser validation covers rendering, steering/burns, pause, reset, time warp, keyboard controls, pilot selection, audio, both cameras, laser firing, player game over/retry, expanded orbital maps and a mobile viewport.

With Playwright installed and the local server running, `node tests/browser.cjs chromium` or `node tests/browser.cjs webkit` checks actual rendered pixels and pilot paint changes, exhaust visibility, live engine audio and release, laser/explosion audio waveforms and their event triggers, visible combat effects, destruction and reset, tap-target sizes, simultaneous touch controls, held fire, touch cancellation, portrait/landscape layout and graphics-context restoration. Combat audio waveforms use OfflineAudioContext so a slow software GPU cannot make a short sound expire before it is sampled. Its deterministic target is injected only in the browser's intercepted test response; production assets have no test hooks. `tests/regressions.cjs` checks modified browser shortcuts, form-focus releases, fullscreen dialogs (Chromium), destroyed orbit removal, old returning tracer visibility, absorbed-shot history cleanup, graphics-loss clock freezing/recovery and exact fatal-hit timing. `tests/intro.cjs` checks all five popups, Enter/×/Escape progression, repeated-key protection, backdrop clicks and mobile readability. `tests/traffic-browser.cjs` checks autonomous firing, separate scoring, pause/reset, visible green tracers, map colors and the CRT treatment. Run these scripts with `chromium` or `webkit` after starting the server. Linux WebKit checks exercise Safari's engine, but do not run Apple's Metal driver on a physical Mac.

The game feature-detects the proposed document-scoped WebMCP API and exposes state read-back, launch, pilot selection, camera switching, laser firing and pause/time-warp configuration where supported. Native WebMCP validation is unavailable in the QA browser; ordinary browser controls are validated directly.

## Engine feedback and pilot colors

The Global velocity gauge measures optical spatial distance per global time: `v/c = sqrt((dρ/dt)² + sin²ρ |dΩ/dt|²)` in c=L=1 units. This equals the local static-observer β already used by the Lorentz factor; it is not a coordinate radial speed. The acceleration control changes thrust, never L.

Each pilot selects a distinct rocket paint: Maldacena cyan, Gubser orange, Klebanov violet, Polyakov pink, Witten green. Switching pilots updates the ray-traced hull immediately, including while paused. Thrust strength controls a flickering exhaust plume, white-hot core, nozzle glow and drifting sparks; reverse and brake burns direct the exhaust oppositely to the acceleration. This immediate feedback shares the current comoving frame with the player hull proxy. No finite-fuel model is introduced.

Procedural Web Audio provides a continuous filtered engine rumble with smooth attack/release, a descending laser sweep and a longer noise/sub-bass explosion. A separate effects bus keeps these audible against the original arcade score. If scheduling is interrupted, missed beats are skipped; resuming does not allocate a backlog of expired voices. Sound on/off controls both music and effects. Releasing thrust, pausing, opening a dialog, losing focus or hiding the tab cuts the engine sound. Audio starts only through a user gesture and supports Safari’s AudioContext.

## GitHub Pages

This repository includes the complete browser game in `dist/` and the numerical tests in `tests/`. It has no build step.

Publish the static assets to the `gh-pages` branch:

```sh
sh scripts/publish-pages.sh
```

In **Settings → Pages**, choose **Deploy from a branch**, then select **gh-pages** and **/ (root)**. The public game will be at https://henrywlin.github.io/ads-cft/. Repeat the command after committing changes to the game on `main`.

The bundled Press Start 2P font is distributed under its [SIL Open Font License](dist/arcade-font-LICENSE.txt). Portraits are generated arcade artwork based on the public reference photographs credited above.

## Relativistic colors

The view computes gravitational and Doppler frequency ratios on every ray. Redshift now visibly favors red and suppresses blue; blueshift does the reverse. The forward-light readout reports the exact ratio for the central viewing direction, using the boundary's conformal-time spectrum as the reference; it includes gravity as well as motion. The stronger RGB tint and exposure remain artistic broadband display responses, not a full spectral radiative-transfer calculation.

Returning pulses can destroy your rocket. Launch pulses arm after clearing the hull; player collisions are evaluated analytically on every exact free-drift segment of the split rocket integrator. The first hull absorbs the shot, including traffic that would otherwise block a returning pulse. A fatal hit stops the clocks, plays an explosion and shows GAME OVER; Enter, R or FLY AGAIN restarts with the selected pilot.

Laser particles now display the current pulse position as an arcade visibility aid, avoiding the chase camera’s several-second retarded-image delay. Null propagation, boundary reflections and collision times retain the metric-based calculation; surrounding ships and stars keep their relativistic optics.

Collision termination now clips the free-drift step at the actual laser-hit event, keeping the final global clock equal to the impact time. Large coasting advances also unwrap every global-time circuit. Absorbed pulses retain only recent map history; active pulses remain physical hazards. The tracer budget prioritizes the nearest visible live pulses, so an older returning shot stays visible after many newer shots. Destroyed vessels no longer leave orbital curves on the map. Browser modifier shortcuts do not fire lasers or reset flight, and focusing a settings input releases held controls.

Ten randomly selected traffic ships now fire green laser pulses at irregular global-time intervals; player pulses remain pink. Emissions and impacts are processed chronologically, so destroyed ships cannot fire and traffic hits never count toward your score. The emitting hull is immune only to its outbound crossing; reflected pulses can hit their source. Traffic pulses can destroy your rocket. Reset restores the fleet and firing schedule.

The scene uses a six-bit RGB display palette with subtle ordered dithering and static CRT scanlines. These are display treatments: rendering resolution, null rays, frequency calculations and controls remain unchanged.
