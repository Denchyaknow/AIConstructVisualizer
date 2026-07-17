# AIBrain: The Asterism

The Asterism is a mobile-first experiment in representing an AI as an abstract
constellation rather than a humanoid avatar. A persistent graph of stars forms
around an empty prompt aperture. States change the graph's behavior, while
one-shot events pass through it without replacing the active state.

## Run it

The project has no build step. It uses pinned browser builds of each rendering
framework from jsDelivr, so the browser needs internet access.

```bash
cd /home/edgesecure/AIBrain
python3 -m http.server 4173
```

Then open <http://localhost:4173>. Do not open the HTML files directly with a
`file://` URL; browser module imports require an HTTP server.

## Framework pages

| Page | Framework | Rendering approach |
| --- | --- | --- |
| `three.html` | [Three.js 0.185.1 / r185](https://github.com/mrdoob/three.js) | 3D shader point cloud |
| `pixi.html` | [PixiJS 8.19.0](https://github.com/pixijs/pixijs) | Holographic 2D projection |
| `tsparticles.html` | [tsParticles 4.3.2](https://github.com/tsparticles/tsparticles) | Particle-native field plus neural overlay |
| `babylon.html` | [Babylon.js 9.17.0](https://github.com/BabylonJS/Babylon.js) | Point-cloud system and emissive 3D lines |
| `regl.html` | [regl 2.1.1](https://github.com/regl-project/regl) | Direct functional WebGL draw calls |

`index.html` is the comparison and launcher page. Three.js is the canonical
interpretation; the other pages deliberately expose each framework's character.

## Controls

States blend continuously:

`Quiet`, `Listening`, `Understanding`, `Exploring`, `Resolving`, `Speaking`,
`Working`, `Creating`, `Uncertain`, and `Guarding`.

Events are temporary overlays:

`Recognition`, `Insight`, `Recall`, `Tool dispatch`, `Correction`, `Completion`,
`Boundary`, and `Reconstruct`.

The same controls are available to page JavaScript:

```js
AIBrain.setState("exploring");
AIBrain.trigger("insight");
AIBrain.getState();
AIBrain.getMetrics();
AIBrain.states;
AIBrain.effects;
```

State names and effect names are lowercase. Calls with unknown names throw an
error so integrations fail visibly instead of silently playing the wrong motion.

## Architecture

- `js/asterism-core.js` owns deterministic node generation, graph topology,
  smooth state blending, effect envelopes, signals, and color semantics.
- `js/lab.js` builds the accessible controls, installs pointer interaction,
  exposes the public API, and drives the animation frame.
- `js/renderers/` contains small adapters that translate the same live snapshot
  into each framework.
- `css/app.css` defines the responsive shell. The visualization is centered
  inside a `ResizeObserver`-driven stage and scales independently of the control
  deck.

Mobile renders 390 particles; wider screens render 620. The canvas is always
derived from its actual container bounds, capped at a 2x device pixel ratio, and
updates whenever the layout changes. `prefers-reduced-motion` reduces field
movement and disables the automatic reconstruction entrance.

## Verification snapshots

`artifacts/` contains settled browser captures for every renderer plus a full
mobile capture of the canonical Three.js page. These are review artifacts and
are not needed at runtime. Browser checks exercised all five framework pages,
state selection, layered effects, CDN loading, and the public API. The canonical
canvas was also resized live through 1180px, 820px, 430px, and 390px viewports;
at each size it matched and remained centered inside its stage with no horizontal
overflow.

## Adding a state or event

Add a state profile to `STATE_PROFILES` or an event to `EFFECTS` in
`js/asterism-core.js`. State profiles are continuous targets rather than
animation clips. New event behavior belongs in the effect loop inside
`Asterism.update()`, which allows it to blend with every state and renderer.
