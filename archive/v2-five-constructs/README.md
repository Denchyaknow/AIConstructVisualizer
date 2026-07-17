# AIBrain — Pixi Construct Collection

AIBrain is a self-contained browser study of what an abstract digital intelligence might look like if it were given a visible, responsive body. It deliberately avoids humanoid avatars. The five constructs interpret cognition as geometry, crystal refraction, organic growth, gravity, and woven semantic streams.

## Open it

Serve this folder over HTTP (ES modules do not run reliably from `file://`):

```bash
cd /home/edgesecure/AIBrain
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/`.

PixiJS 8.19.0 is loaded as an ESM bundle from jsDelivr. Google Material Symbols, Syne, and Space Mono are loaded from Google Fonts. There is no build step or package install.

## The five bodies

1. **Dodecahedral Relay** — twenty rotating spatial nodes and thirty neural routes.
2. **Shardmind** — a deterministic irregular crystal with deforming facets and refracted signals.
3. **Hyphae Intelligence** — branching memory vessels, organelles, spores, and sap-like packets.
4. **Thought Singularity** — an attention lens with capability satellites and orbital photon traffic.
5. **Semantic Loom** — five braided semantic ribbons with temporary knots of meaning.

The original multi-framework study is frozen under [`archive/v1-framework-study/`](./archive/v1-framework-study/). Its Three.js, PixiJS, tsParticles, Babylon.js, and regl pages remain runnable from that directory.

## Continuity model

All five pages use the same persistent runtime in `js/v2/core.js` and `js/v2/shell.js`:

- every live signal receives an immutable ID at startup;
- state changes retarget the existing state channels with ease-in/out interpolation;
- particle route phase, size, current position, alpha, and trail history are never rebuilt during a state change;
- fast state switches begin a new ease from the current interpolated values, so there is no snap back;
- one-shot effects are additive envelopes layered over the persistent state;
- geometry can deform continuously while particles ease toward its updated paths.

Use the debug API to verify the invariant:

```js
const before = AIBrain.getDebugSnapshot();
AIBrain.setState('exploring');
AIBrain.setState('guarding');
AIBrain.setState('creating');
const after = AIBrain.getDebugSnapshot();

console.assert(before.count === after.count);
console.assert(before.ids.join() === after.ids.join());
console.assert(after.minAlpha > 0);
```

## Realtime API

Every construct exposes the same browser API:

```js
AIBrain.setState('listening');
AIBrain.trigger('insight');
AIBrain.setPrompt({ emoji: '🧬', label: 'Synthesize the evidence' });
AIBrain.getState();
AIBrain.getPrompt();
AIBrain.getDebugSnapshot();
```

Persistent states: `quiet`, `listening`, `understanding`, `exploring`, `resolving`, `speaking`, `working`, `creating`, `uncertain`, and `guarding`.

One-shots: `recognition`, `insight`, `recall`, `dispatch`, `correction`, `completion`, `boundary`, and `pulse`. Number keys trigger the eight listed effects; Space triggers a system pulse.

## Design references

The collection uses [Google Material Symbols](https://developers.google.com/fonts/docs/material_symbols) as capability glyphs, not a Google brand mark. Its visual vocabulary was informed by Google Design's [Visualising AI](https://design.google/library/artistic-intelligence), Refik Anadol's data-driven spatial work documented by [MoMA](https://www.moma.org/calendar/exhibitions/5535), NASA's description of the [cosmic web](https://science.nasa.gov/mission/hubble/science/science-highlights/mapping-the-cosmic-web/), Nervous System's generative [Hyphae](https://n-e-r-v-o-u-s.com/projects/albums/hyphae-animations/content/hyphae-growth-of-the-vessel-pendant/) and [Dendrite](https://n-e-r-v-o-u-s.com/projects/albums/dendrite/) systems, and the geometry of a [regular dodecahedron](https://mathworld.wolfram.com/RegularDodecahedron.html).

## Layout and accessibility

- The canvas centers and re-fits the construct whenever its host resizes.
- Controls move below the canvas on tablets and phones.
- All controls are keyboard reachable and have visible focus states.
- State changes are announced through an `aria-live` region.
- `prefers-reduced-motion` lowers signal count, trail history, and animation tempo.
- The canvas has a descriptive accessible label; the operational controls remain normal DOM elements.

## File map

```text
AIBrain/
├── index.html                     # construct directory
├── dodecahedron.html
├── shardmind.html
├── hyphae.html
├── singularity.html
├── loom.html
├── css/
│   ├── index-v2.css
│   └── v2.css
├── artifacts/v2/                  # reviewed desktop and mobile captures
├── js/v2/
│   ├── core.js                    # persistence, easing, particles, trails, glyphs
│   ├── shell.js                   # Pixi runtime, UI binding, public API
│   ├── constructs/                # five independent visual bodies
│   └── pages/                     # page entry modules
└── archive/v1-framework-study/   # exact frozen v1 comparison
```
