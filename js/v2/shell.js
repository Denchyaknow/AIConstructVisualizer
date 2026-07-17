import {
  AmbientField,
  EFFECTS,
  GlyphLayer,
  PersistentFlowField,
  PromptCore,
  STATE_PROFILES,
  StateConductor,
  clamp,
  createLayout,
  easeOutCubic,
} from './core.js';

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';

const STATE_COPY = {
  quiet: 'Quiet', listening: 'Listening', understanding: 'Understanding', exploring: 'Exploring', resolving: 'Resolving',
  speaking: 'Speaking', working: 'Working', creating: 'Creating', uncertain: 'Uncertain', guarding: 'Guarding',
};

const EFFECT_COPY = {
  recognition: 'Recognition', insight: 'Insight', recall: 'Recall', dispatch: 'Dispatch', correction: 'Correction',
  completion: 'Completion', boundary: 'Boundary', pulse: 'System pulse',
};

const EFFECT_SIGNATURE = {
  recognition: 'converging target lock',
  insight: 'radial idea burst',
  recall: 'reverse memory spiral',
  dispatch: 'outbound chevrons',
  correction: 'error scan + jitter',
  completion: 'closed circuit check',
  boundary: 'shield sphere',
  pulse: 'compressed shockwave',
};

const PROMPTS = [
  ['✦', 'Your prompt'], ['🧠', 'Reasoning'], ['🔎', 'Research'], ['💡', 'Insight'],
  ['🎨', 'Create'], ['⚡', 'Execute'], ['🛡️', 'Protect'], ['🧬', 'Synthesize'],
];

function customDefinitions(config) {
  return (config.customControls?.groups || []).flatMap(group => group.controls || []);
}

function initialConstructTuning(config) {
  const custom = config.customControls;
  const tuning = {};
  for (const definition of customDefinitions(config)) tuning[definition.id] = definition.value;
  if (custom?.palettes?.length) tuning.palette = custom.defaultPalette || custom.palettes[0].id;
  return tuning;
}

function formatCustomValue(definition, value) {
  if (definition.format === 'integer') return String(Math.round(value));
  if (definition.format === 'degree') return `${Math.round(value)}°`;
  if (definition.format === 'percent') return `${Math.round(value)}%`;
  if (definition.format === 'percentUnit') return `${Math.round(value * 100)}%`;
  if (definition.format === 'signed') return `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}`;
  if (definition.format === 'rate') return `×${Number(value).toFixed(2)}`;
  return `×${Number(value).toFixed(2)}`;
}

function paletteDefinition(config, id) {
  return config.customControls?.palettes?.find(palette => palette.id === id);
}

function activeAccent(config, constructTuning = {}) {
  return paletteDefinition(config, constructTuning.palette)?.accentCss || config.accentCss || '#65e8ff';
}

function createConstructControls(config) {
  const custom = config.customControls;
  if (!custom) return;

  for (const group of custom.groups || []) {
    const root = document.querySelector(`[data-controls="custom-${group.id}"]`);
    if (!root) continue;
    root.classList.add('custom-control-stack');

    if (group.palettes && custom.palettes?.length) {
      const paletteGrid = document.createElement('div');
      paletteGrid.className = 'palette-grid';
      paletteGrid.setAttribute('aria-label', 'Color palettes');
      for (const palette of custom.palettes) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'palette-key';
        button.dataset.customPalette = palette.id;
        button.setAttribute('aria-pressed', String(palette.id === (custom.defaultPalette || custom.palettes[0].id)));
        button.setAttribute('aria-label', `Use ${palette.label} palette`);
        const swatches = palette.swatches.map(color => `<i style="--swatch:${color}"></i>`).join('');
        button.innerHTML = `<span class="palette-swatches" aria-hidden="true">${swatches}</span><small>${palette.label}</small>`;
        paletteGrid.appendChild(button);
      }
      root.appendChild(paletteGrid);
    }

    for (const definition of group.controls || []) {
      if (definition.type === 'toggle') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toggle-key';
        button.dataset.customToggle = definition.id;
        button.setAttribute('aria-pressed', String(Boolean(definition.value)));
        button.innerHTML = `<span><b>${definition.label}</b><small>${definition.description || ''}</small></span><i class="toggle-switch" aria-hidden="true"></i>`;
        root.appendChild(button);
        continue;
      }

      const label = document.createElement('label');
      label.className = 'output-slider custom-slider';
      const scale = definition.scale || [String(definition.min), String(definition.value), String(definition.max)];
      label.innerHTML = `
        <span class="output-slider__label"><span>${definition.label}</span><output data-custom-value="${definition.id}">${formatCustomValue(definition, definition.value)}</output></span>
        <input type="range" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${definition.value}" data-custom-control="${definition.id}" aria-label="${definition.label}">
        <span class="output-scale" aria-hidden="true"><span>${scale[0]}</span><span>${scale[1]}</span><span>${scale[2]}</span></span>`;
      root.appendChild(label);
    }
  }
}

function createControls(config) {
  const states = document.querySelector('[data-controls="states"]');
  const effects = document.querySelector('[data-controls="effects"]');
  const prompts = document.querySelector('[data-controls="prompts"]');
  const output = document.querySelector('[data-controls="output"]');
  const stateList = config.states || Object.keys(STATE_PROFILES);
  const effectList = config.effects || Object.keys(EFFECTS);

  for (const state of stateList) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'control-chip';
    button.dataset.state = state;
    button.innerHTML = `<span class="chip-led" aria-hidden="true"></span>${STATE_COPY[state]}`;
    button.setAttribute('aria-pressed', state === 'quiet' ? 'true' : 'false');
    states.appendChild(button);
  }

  for (const effect of effectList) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'effect-key';
    button.dataset.effect = effect;
    button.innerHTML = `<span><b>${EFFECT_COPY[effect]}</b><em>${EFFECT_SIGNATURE[effect]}</em></span><small>${effect === 'pulse' ? 'SPACE' : `0${effectList.indexOf(effect) + 1}`}</small>`;
    effects.appendChild(button);
  }

  for (const [emoji, label] of PROMPTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'prompt-key';
    button.dataset.emoji = emoji;
    button.dataset.label = label;
    button.title = label;
    button.setAttribute('aria-label', `Set prompt to ${label}`);
    button.textContent = emoji;
    prompts.appendChild(button);
  }

  if (output) {
    output.innerHTML = `
      <label class="output-slider">
        <span class="output-slider__label"><span>Signal multiplier</span><output data-output-value>×1.00</output></span>
        <input type="range" min="0.35" max="4" step="0.05" value="1" data-particle-multiplier aria-label="Particle output multiplier">
        <span class="output-scale" aria-hidden="true"><span>0.35×</span><span>1.00×</span><span>4.00×</span></span>
      </label>
      <label class="output-slider">
        <span class="output-slider__label"><span>Particle speed</span><output data-speed-value>×1.00</output></span>
        <input type="range" min="1" max="10" step="0.25" value="1" data-particle-speed aria-label="Particle speed multiplier">
        <span class="output-scale" aria-hidden="true"><span>1× / native</span><span>5×</span><span>10×</span></span>
      </label>
      <label class="output-slider">
        <span class="output-slider__label"><span>Construct spread</span><output data-spread-value>×1.00</output></span>
        <input type="range" min="0" max="2" step="0.05" value="1" data-particle-spread aria-label="Construct spread multiplier">
        <span class="output-scale" aria-hidden="true"><span>compact</span><span>native</span><span>expanded</span></span>
      </label>
      <label class="output-slider">
        <span class="output-slider__label"><span>Size variation</span><output data-size-variation-value>×1.00</output></span>
        <input type="range" min="0" max="2" step="0.05" value="1" data-particle-size-variation aria-label="Particle size variation multiplier">
        <span class="output-scale" aria-hidden="true"><span>uniform</span><span>native</span><span>volatile</span></span>
      </label>
      <p class="output-readout">State baseline <strong data-output-state>0.68×</strong><span aria-hidden="true">/</span> target <strong data-output-target>000</strong></p>`;
  }
  createConstructControls(config);
}

function updateDom(state, config, flow, tuning, constructTuning) {
  document.querySelectorAll('[data-state]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.state === state.state));
  });
  const stateName = document.querySelector('[data-readout="state"]');
  const transition = document.querySelector('[data-readout="transition"]');
  const particles = document.querySelector('[data-readout="particles"]');
  const outputValue = document.querySelector('[data-output-value]');
  const speedValue = document.querySelector('[data-speed-value]');
  const spreadValue = document.querySelector('[data-spread-value]');
  const sizeVariationValue = document.querySelector('[data-size-variation-value]');
  const outputState = document.querySelector('[data-output-state]');
  const outputTarget = document.querySelector('[data-output-target]');
  const debug = flow.debugSnapshot();
  if (stateName) stateName.textContent = STATE_COPY[state.state];
  if (transition) transition.textContent = `${Math.round(state.transition * 100).toString().padStart(3, '0')}%`;
  if (particles) particles.textContent = String(debug.activeCount).padStart(3, '0');
  if (outputValue) outputValue.textContent = `×${debug.multiplier.toFixed(2)}`;
  if (speedValue) speedValue.textContent = `×${debug.speedMultiplier.toFixed(2)}`;
  if (spreadValue) spreadValue.textContent = `×${tuning.spread.toFixed(2)}`;
  if (sizeVariationValue) sizeVariationValue.textContent = `×${debug.sizeVariation.toFixed(2)}`;
  if (outputState) outputState.textContent = `${state.profile.output.toFixed(2)}×`;
  if (outputTarget) outputTarget.textContent = String(debug.targetCount).padStart(3, '0');
  document.documentElement.style.setProperty('--construct-accent', activeAccent(config, constructTuning));
}

function renderEffectOverlay(graphics, state, layout) {
  graphics.clear();
  for (const effect of state.effects) {
    const t = clamp(effect.age / effect.duration);
    const fade = Math.sin(Math.PI * t);
    const progress = easeOutCubic(t);
    const arc = (radius, start, end, style) => {
      graphics.moveTo(layout.cx + Math.cos(start) * radius, layout.cy + Math.sin(start) * radius)
        .arc(layout.cx, layout.cy, radius, start, end).stroke(style);
    };

    if (effect.name === 'recognition') {
      const distance = layout.scale * (.78 - progress * .39);
      const arm = layout.scale * .15;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = layout.cx + sx * distance;
        const y = layout.cy + sy * distance;
        graphics.moveTo(x, y - sy * arm).lineTo(x, y).lineTo(x - sx * arm, y)
          .stroke({ color: effect.color, width: 2.2 + fade * 1.8, alpha: fade * .92, cap: 'square', join: 'miter' });
      }
      const reticle = layout.scale * (.11 + fade * .035);
      graphics.circle(layout.cx, layout.cy, reticle).stroke({ color: effect.color, width: 1.6, alpha: fade * .75 });
      graphics.moveTo(layout.cx - reticle * 1.5, layout.cy).lineTo(layout.cx + reticle * 1.5, layout.cy)
        .moveTo(layout.cx, layout.cy - reticle * 1.5).lineTo(layout.cx, layout.cy + reticle * 1.5)
        .stroke({ color: effect.color, width: .8, alpha: fade * .52 });
    } else if (effect.name === 'insight') {
      const rays = 14;
      for (let i = 0; i < rays; i++) {
        const angle = i * Math.PI * 2 / rays + .12;
        const inner = layout.scale * (.18 + progress * .12);
        const length = layout.scale * (.24 + (i % 3) * .07) * fade;
        const end = inner + length;
        graphics.moveTo(layout.cx + Math.cos(angle) * inner, layout.cy + Math.sin(angle) * inner)
          .lineTo(layout.cx + Math.cos(angle) * end, layout.cy + Math.sin(angle) * end)
          .stroke({ color: effect.color, width: i % 2 ? 1.3 : 2.8, alpha: fade * .88, cap: 'round' });
        graphics.circle(layout.cx + Math.cos(angle) * end, layout.cy + Math.sin(angle) * end, i % 2 ? 1.5 : 2.8)
          .fill({ color: effect.color, alpha: fade * .9 });
      }
      const diamond = layout.scale * (.035 + fade * .045);
      graphics.poly([layout.cx, layout.cy - diamond, layout.cx + diamond, layout.cy, layout.cx, layout.cy + diamond, layout.cx - diamond, layout.cy])
        .fill({ color: effect.color, alpha: fade * .78 });
    } else if (effect.name === 'recall') {
      for (let ring = 0; ring < 3; ring++) {
        const radius = layout.scale * (.28 + ring * .17 + progress * .08);
        const rotation = -progress * Math.PI * (1.1 + ring * .18) + ring * .7;
        for (let dash = 0; dash < 7; dash++) {
          const start = rotation + dash * Math.PI * 2 / 7;
          arc(radius, start, start + .40 + ring * .045, { color: effect.color, width: 2.6 - ring * .32, alpha: fade * (.88 - ring * .12), cap: 'round' });
        }
      }
      const ghostAngle = -progress * Math.PI * 3;
      graphics.circle(layout.cx + Math.cos(ghostAngle) * layout.scale * .42, layout.cy + Math.sin(ghostAngle) * layout.scale * .18, 3 + fade * 3)
        .fill({ color: effect.color, alpha: fade * .9 });
      for (let i = 0; i < 34; i++) {
        const a = i / 34 * Math.PI * 4 - progress * Math.PI * 2;
        const b = (i + 1) / 34 * Math.PI * 4 - progress * Math.PI * 2;
        const ra = layout.scale * (.09 + i / 34 * .48);
        const rb = layout.scale * (.09 + (i + 1) / 34 * .48);
        graphics.moveTo(layout.cx + Math.cos(a) * ra, layout.cy + Math.sin(a) * ra * .62)
          .lineTo(layout.cx + Math.cos(b) * rb, layout.cy + Math.sin(b) * rb * .62)
          .stroke({ color: effect.color, width: 1, alpha: fade * .34 });
      }
    } else if (effect.name === 'dispatch') {
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + .08;
        const distance = layout.scale * (.18 + progress * .78);
        const x = layout.cx + Math.cos(angle) * distance;
        const y = layout.cy + Math.sin(angle) * distance;
        const wing = layout.scale * .075;
        const back = layout.scale * .11;
        const bx = x - Math.cos(angle) * back;
        const by = y - Math.sin(angle) * back;
        const left = { x: bx + Math.cos(angle + Math.PI / 2) * wing, y: by + Math.sin(angle + Math.PI / 2) * wing };
        const right = { x: bx + Math.cos(angle - Math.PI / 2) * wing, y: by + Math.sin(angle - Math.PI / 2) * wing };
        graphics.poly([x, y, left.x, left.y, bx, by, right.x, right.y]).fill({ color: effect.color, alpha: fade * .36 });
        graphics.moveTo(left.x, left.y).lineTo(x, y).lineTo(right.x, right.y)
          .stroke({ color: effect.color, width: 2.5, alpha: fade * .92, cap: 'round', join: 'round' });
        graphics.moveTo(layout.cx + Math.cos(angle) * distance * .55, layout.cy + Math.sin(angle) * distance * .55)
          .lineTo(bx, by).stroke({ color: effect.color, width: 1.2, alpha: fade * .54 });
      }
    } else if (effect.name === 'correction') {
      const scanY = layout.cy + layout.scale * (-.72 + progress * 1.44);
      graphics.rect(layout.cx - layout.scale * .76, scanY - 9, layout.scale * 1.52, 18)
        .fill({ color: effect.color, alpha: fade * .11 });
      graphics.rect(layout.cx - layout.scale * .76, scanY - 1, layout.scale * 1.52, 2)
        .fill({ color: effect.color, alpha: fade * .88 });
      for (let i = 0; i < 5; i++) {
        const offset = ((i * 83) % 100) / 100;
        const y = scanY + (i - 2) * 7;
        const x = layout.cx - layout.scale * .62 + offset * layout.scale * 1.10;
        graphics.rect(x, y, layout.scale * (.06 + (i % 3) * .025), 1 + (i % 2))
          .fill({ color: effect.color, alpha: fade * (.28 + i * .07) });
      }
      const cross = layout.scale * .14;
      graphics.moveTo(layout.cx - cross, layout.cy - cross).lineTo(layout.cx + cross, layout.cy + cross)
        .moveTo(layout.cx + cross, layout.cy - cross).lineTo(layout.cx - cross, layout.cy + cross)
        .stroke({ color: effect.color, width: 2.8, alpha: fade * .86 });
    } else if (effect.name === 'completion') {
      const radius = layout.scale * .72;
      const points = Array.from({ length: 6 }, (_, i) => ({
        x: layout.cx + Math.cos(-Math.PI / 2 + i * Math.PI / 3) * radius,
        y: layout.cy + Math.sin(-Math.PI / 2 + i * Math.PI / 3) * radius,
      }));
      const completed = progress * 6;
      for (let i = 0; i < Math.ceil(completed); i++) {
        const a = points[i % 6];
        const b = points[(i + 1) % 6];
        const amount = clamp(completed - i);
        graphics.moveTo(a.x, a.y).lineTo(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount)
          .stroke({ color: effect.color, width: 2.3, alpha: fade * .66, cap: 'round' });
      }
      if (t > .36) {
        const check = clamp((t - .36) / .30);
        const start = { x: layout.cx - layout.scale * .09, y: layout.cy };
        const mid = { x: layout.cx - layout.scale * .025, y: layout.cy + layout.scale * .065 };
        const end = { x: layout.cx + layout.scale * .12, y: layout.cy - layout.scale * .10 };
        graphics.moveTo(start.x, start.y).lineTo(mid.x, mid.y).lineTo(mid.x + (end.x - mid.x) * check, mid.y + (end.y - mid.y) * check)
          .stroke({ color: effect.color, width: 3.2, alpha: fade * .78, cap: 'round', join: 'round' });
      }
    } else if (effect.name === 'boundary') {
      const radius = layout.scale * (.84 + fade * .06);
      graphics.circle(layout.cx, layout.cy, radius).stroke({ color: effect.color, width: 2.4 + fade * 1.6, alpha: fade * .76 });
      graphics.ellipse(layout.cx, layout.cy, radius, radius * .28).stroke({ color: effect.color, width: 1.8, alpha: fade * .62 });
      graphics.ellipse(layout.cx, layout.cy, radius * .28, radius).stroke({ color: effect.color, width: 1.8, alpha: fade * .62 });
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6 + t * .4;
        graphics.circle(layout.cx + Math.cos(angle) * radius, layout.cy + Math.sin(angle) * radius, 1.2)
          .fill({ color: effect.color, alpha: fade * .86 });
      }
    } else if (effect.name === 'pulse') {
      const inner = layout.scale * (.06 + progress * .16);
      const outer = layout.scale * (.14 + progress * .76);
      graphics.circle(layout.cx, layout.cy, inner).fill({ color: effect.color, alpha: (1 - t) * .38 });
      graphics.circle(layout.cx, layout.cy, outer).stroke({ color: effect.color, width: 6 * (1 - t) + 1, alpha: fade * .88 });
      graphics.circle(layout.cx, layout.cy, outer * .72).stroke({ color: effect.color, width: 1.8, alpha: fade * .58 });
    }
  }
}

export async function bootBrain(createConstruct, config) {
  createControls(config);
  const stage = document.querySelector('#brain-stage');
  const loading = document.querySelector('[data-loading]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PIXI = await import(PIXI_URL);
  try { await document.fonts.load('400 20px "Material Symbols Rounded"'); } catch (_) { /* font fallback stays readable */ }

  const app = new PIXI.Application();
  await app.init({
    resizeTo: stage,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(devicePixelRatio || 1, 2),
    backgroundAlpha: 0,
    powerPreference: 'high-performance',
  });
  app.canvas.setAttribute('aria-label', `${config.name} animated AI construct`);
  app.canvas.setAttribute('role', 'img');
  stage.appendChild(app.canvas);

  const ambient = new AmbientField(PIXI, reducedMotion ? 90 : 180, config.seed + 91);
  const construct = createConstruct(PIXI, config);
  const baseParticleCount = reducedMotion ? 54 : (config.particles || 96);
  const flow = new PersistentFlowField(PIXI, { baseCount: baseParticleCount, maxMultiplier: 4, seed: config.seed });
  const glyphs = new GlyphLayer(PIXI);
  const promptCore = new PromptCore(PIXI);
  const overlay = new PIXI.Graphics();
  overlay.blendMode = 'add';
  app.stage.addChild(ambient.graphics, construct.container, flow.backContainer, glyphs.container, promptCore.container, flow.frontContainer, overlay);

  const conductor = new StateConductor(config.initialState || 'quiet');
  const prompt = { emoji: config.promptEmoji || '🧠', label: config.promptLabel || 'Awaiting prompt' };
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, presence: 0, targetPresence: 0 };
  const tuning = { spread: 1 };
  const constructTuning = initialConstructTuning(config);
  let time = 0;
  let lastDomUpdate = 0;
  let lastConstructDebug = {};

  function setState(name) {
    const accepted = conductor.setState(name);
    if (accepted) {
      document.querySelectorAll('[data-state]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.state === name));
      });
      const live = document.querySelector('[data-live]');
      if (live) live.textContent = `${STATE_COPY[name]} state selected`;
    }
    return accepted;
  }

  function trigger(name) {
    const accepted = conductor.trigger(name);
    if (accepted) {
      const live = document.querySelector('[data-live]');
      if (live) live.textContent = `${EFFECT_COPY[name]} effect triggered`;
      document.querySelector(`[data-effect="${name}"]`)?.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }],
        { duration: 280, easing: 'ease-out' },
      );
    }
    return accepted;
  }

  function setPrompt(next = {}) {
    if (typeof next.emoji === 'string' && next.emoji.trim()) prompt.emoji = next.emoji.trim().slice(0, 8);
    if (typeof next.label === 'string' && next.label.trim()) prompt.label = next.label.trim().slice(0, 42);
    document.querySelector('[data-readout="prompt"]').textContent = `${prompt.emoji} ${prompt.label}`;
    conductor.trigger('recognition');
    return { ...prompt };
  }

  function setParticleMultiplier(value) {
    const multiplier = flow.setMultiplier(value);
    const input = document.querySelector('[data-particle-multiplier]');
    const readout = document.querySelector('[data-output-value]');
    if (input) input.value = String(multiplier);
    if (readout) readout.textContent = `×${multiplier.toFixed(2)}`;
    const live = document.querySelector('[data-live]');
    if (live) live.textContent = `Particle output multiplier ${multiplier.toFixed(2)}`;
    return multiplier;
  }

  function setParticleSpeed(value) {
    const speed = flow.setSpeed(value);
    const input = document.querySelector('[data-particle-speed]');
    const readout = document.querySelector('[data-speed-value]');
    if (input) input.value = String(speed);
    if (readout) readout.textContent = `×${speed.toFixed(2)}`;
    const live = document.querySelector('[data-live]');
    if (live) live.textContent = `Particle speed multiplier ${speed.toFixed(2)}`;
    return speed;
  }

  function setParticleSpread(value) {
    const numeric = Number(value);
    tuning.spread = clamp(Number.isFinite(numeric) ? numeric : 1, 0, 2);
    const input = document.querySelector('[data-particle-spread]');
    const readout = document.querySelector('[data-spread-value]');
    if (input) input.value = String(tuning.spread);
    if (readout) readout.textContent = `×${tuning.spread.toFixed(2)}`;
    const live = document.querySelector('[data-live]');
    if (live) live.textContent = `Construct spread multiplier ${tuning.spread.toFixed(2)}`;
    return tuning.spread;
  }

  function setParticleSizeVariation(value) {
    const variation = flow.setSizeVariation(value);
    const input = document.querySelector('[data-particle-size-variation]');
    const readout = document.querySelector('[data-size-variation-value]');
    if (input) input.value = String(variation);
    if (readout) readout.textContent = `×${variation.toFixed(2)}`;
    const live = document.querySelector('[data-live]');
    if (live) live.textContent = `Particle size variation ${variation.toFixed(2)}`;
    return variation;
  }

  function getParticleTuning() {
    return {
      output: flow.multiplier,
      speed: flow.speedMultiplier,
      spread: tuning.spread,
      sizeVariation: flow.sizeVariation,
    };
  }

  function getConstructTuning() {
    return { ...constructTuning };
  }

  function setConstructControl(name, value) {
    if (name === 'palette') {
      const palette = paletteDefinition(config, value);
      if (!palette) return false;
      constructTuning.palette = palette.id;
      document.querySelectorAll('[data-custom-palette]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.customPalette === palette.id));
      });
      document.documentElement.style.setProperty('--construct-accent', activeAccent(config, constructTuning));
      const live = document.querySelector('[data-live]');
      if (live) live.textContent = `${palette.label} color palette selected`;
      return palette.id;
    }

    const definition = customDefinitions(config).find(control => control.id === name);
    if (!definition) return false;
    if (definition.type === 'toggle') {
      const enabled = typeof value === 'string' ? !['false', '0', 'off'].includes(value.toLowerCase()) : Boolean(value);
      constructTuning[name] = enabled;
      const button = document.querySelector(`[data-custom-toggle="${name}"]`);
      button?.setAttribute('aria-pressed', String(enabled));
      const live = document.querySelector('[data-live]');
      if (live) live.textContent = `${definition.label} ${enabled ? 'enabled' : 'disabled'}`;
      return enabled;
    }

    const numeric = Number(value);
    const next = clamp(Number.isFinite(numeric) ? numeric : definition.value, definition.min, definition.max);
    constructTuning[name] = next;
    const input = document.querySelector(`[data-custom-control="${name}"]`);
    const output = document.querySelector(`[data-custom-value="${name}"]`);
    if (input) input.value = String(next);
    if (output) output.textContent = formatCustomValue(definition, next);
    const live = document.querySelector('[data-live]');
    if (live) live.textContent = `${definition.label} ${formatCustomValue(definition, next)}`;
    return next;
  }

  document.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => setState(button.dataset.state)));
  document.querySelectorAll('[data-effect]').forEach(button => button.addEventListener('click', () => trigger(button.dataset.effect)));
  document.querySelectorAll('[data-emoji]').forEach(button => button.addEventListener('click', () => setPrompt(button.dataset)));
  document.querySelector('[data-particle-multiplier]')?.addEventListener('input', event => setParticleMultiplier(event.currentTarget.value));
  document.querySelector('[data-particle-speed]')?.addEventListener('input', event => setParticleSpeed(event.currentTarget.value));
  document.querySelector('[data-particle-spread]')?.addEventListener('input', event => setParticleSpread(event.currentTarget.value));
  document.querySelector('[data-particle-size-variation]')?.addEventListener('input', event => setParticleSizeVariation(event.currentTarget.value));
  document.querySelectorAll('[data-custom-control]').forEach(input => input.addEventListener('input', event => {
    setConstructControl(event.currentTarget.dataset.customControl, event.currentTarget.value);
  }));
  document.querySelectorAll('[data-custom-toggle]').forEach(button => button.addEventListener('click', () => {
    setConstructControl(button.dataset.customToggle, button.getAttribute('aria-pressed') !== 'true');
  }));
  document.querySelectorAll('[data-custom-palette]').forEach(button => button.addEventListener('click', () => {
    setConstructControl('palette', button.dataset.customPalette);
  }));
  document.querySelector('[data-prompt-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = event.currentTarget.elements.prompt;
    setPrompt({ label: input.value || prompt.label });
    input.value = '';
  });

  stage.addEventListener('pointermove', event => {
    const rect = stage.getBoundingClientRect();
    pointer.targetX = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    pointer.targetY = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
    pointer.targetPresence = 1;
  }, { capture: true });
  stage.addEventListener('pointerleave', () => { pointer.targetX = 0; pointer.targetY = 0; pointer.targetPresence = 0; });
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement) return;
    const effectNames = config.effects || Object.keys(EFFECTS);
    if (event.code === 'Space') { event.preventDefault(); trigger('pulse'); }
    if (/^Digit[1-8]$/.test(event.code)) trigger(effectNames[Number(event.code.slice(-1)) - 1]);
  });

  window.AIBrain = {
    version: '2.6.0',
    construct: config.id,
    setState,
    trigger,
    setPrompt,
    setParticleMultiplier,
    setParticleSpeed,
    setParticleSpread,
    setParticleSizeVariation,
    setConstructControl,
    setPalette: value => setConstructControl('palette', value),
    getParticleMultiplier: () => flow.multiplier,
    getParticleTuning,
    getConstructTuning,
    getState: () => conductor.snapshot(),
    getPrompt: () => ({ ...prompt }),
    getDebugSnapshot: () => ({
      ...flow.debugSnapshot(),
      state: conductor.state,
      construct: config.id,
      canvas: { width: app.screen.width, height: app.screen.height },
      prompt: { ...prompt },
      tuning: getParticleTuning(),
      constructTuning: getConstructTuning(),
      constructDebug: { ...lastConstructDebug },
    }),
    states: Object.keys(STATE_PROFILES),
    effects: Object.keys(EFFECTS),
  };

  document.querySelector('[data-readout="prompt"]').textContent = `${prompt.emoji} ${prompt.label}`;
  if (loading) loading.remove();
  document.body.classList.add('is-ready');

  app.ticker.add(ticker => {
    const dt = Math.min(ticker.deltaMS / 1000, .05);
    time += dt * (reducedMotion ? .32 : 1);
    pointer.x += (pointer.targetX - pointer.x) * (1 - Math.exp(-dt * 5));
    pointer.y += (pointer.targetY - pointer.y) * (1 - Math.exp(-dt * 5));
    pointer.presence += (pointer.targetPresence - pointer.presence) * (1 - Math.exp(-dt * 6));
    const state = conductor.update(dt);
    const layout = createLayout(app.screen.width, app.screen.height, pointer);
    const effectBoost = Math.max(0, ...state.effects.map(effect => effect.strength));
    ambient.render({
      width: layout.width,
      height: layout.height,
      time,
      pointer,
      color: paletteDefinition(config, constructTuning.palette)?.ambientColor || config.ambientColor,
      energy: state.profile.energy,
      reducedMotion,
    });
    const frame = construct.render({ PIXI, layout, time, dt, pointer, reducedMotion, ...state, prompt, effectBoost, tuning: getParticleTuning(), constructTuning: getConstructTuning() });
    lastConstructDebug = frame.debug || {};
    flow.update(frame.paths, {
      dt,
      time,
      profile: state.profile,
      layout,
      reducedMotion,
      effectBoost,
      effect: state.effect,
      mode: frame.flow?.mode || config.flowMode || 'loop',
      speedScale: frame.flow?.speedScale || config.flowSpeedScale || 1,
      respawnRate: frame.flow?.respawnRate || config.flowRespawnRate || 1,
    });
    glyphs.render(frame.nodes, { time, profile: state.profile, effectBoost });
    promptCore.render({
      x: layout.cx,
      y: layout.cy,
      radius: layout.scale * (frame.prompt?.radius || .17),
      style: frame.prompt?.style || 'orb',
      prompt,
      time,
      profile: state.profile,
      accent: frame.prompt?.accent || config.accent,
      secondary: frame.prompt?.secondary || config.secondary,
      effectBoost,
    });
    renderEffectOverlay(overlay, state, layout);
    lastDomUpdate += dt;
    if (lastDomUpdate > .12) {
      updateDom(state, config, flow, tuning, constructTuning);
      lastDomUpdate = 0;
    }
  });
}
