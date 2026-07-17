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

const PROMPTS = [
  ['✦', 'Your prompt'], ['🧠', 'Reasoning'], ['🔎', 'Research'], ['💡', 'Insight'],
  ['🎨', 'Create'], ['⚡', 'Execute'], ['🛡️', 'Protect'], ['🧬', 'Synthesize'],
];

function createControls(config) {
  const states = document.querySelector('[data-controls="states"]');
  const effects = document.querySelector('[data-controls="effects"]');
  const prompts = document.querySelector('[data-controls="prompts"]');
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
    button.innerHTML = `<span>${EFFECT_COPY[effect]}</span><small>${effect === 'pulse' ? 'SPACE' : `0${effectList.indexOf(effect) + 1}`}</small>`;
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
}

function updateDom(state, config, flow) {
  document.querySelectorAll('[data-state]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.state === state.state));
  });
  const stateName = document.querySelector('[data-readout="state"]');
  const transition = document.querySelector('[data-readout="transition"]');
  const particles = document.querySelector('[data-readout="particles"]');
  if (stateName) stateName.textContent = STATE_COPY[state.state];
  if (transition) transition.textContent = `${Math.round(state.transition * 100).toString().padStart(3, '0')}%`;
  if (particles) particles.textContent = String(flow.particles.length).padStart(3, '0');
  document.documentElement.style.setProperty('--construct-accent', config.accentCss || '#65e8ff');
}

function renderEffectOverlay(graphics, state, layout) {
  graphics.clear();
  for (const effect of state.effects) {
    const t = clamp(effect.age / effect.duration);
    const fade = Math.sin(Math.PI * t);
    const radius = layout.scale * (.25 + easeOutCubic(t) * 1.05);
    if (effect.name === 'dispatch') {
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + t;
        const start = radius * .4;
        const end = radius * (1.05 + t * .25);
        graphics.moveTo(layout.cx + Math.cos(angle) * start, layout.cy + Math.sin(angle) * start)
          .lineTo(layout.cx + Math.cos(angle) * end, layout.cy + Math.sin(angle) * end)
          .stroke({ color: effect.color, width: 1.2, alpha: fade * .42, cap: 'round' });
      }
    } else if (effect.name === 'insight') {
      const rays = 12;
      for (let i = 0; i < rays; i++) {
        const angle = i * Math.PI * 2 / rays;
        graphics.circle(
          layout.cx + Math.cos(angle) * radius,
          layout.cy + Math.sin(angle) * radius,
          1 + fade * 2.2,
        ).fill({ color: effect.color, alpha: fade * .7 });
      }
    } else if (effect.name === 'boundary') {
      graphics.circle(layout.cx, layout.cy, layout.scale * (.88 + Math.sin(t * Math.PI) * .08))
        .stroke({ color: effect.color, width: 1.4 + fade * 2, alpha: fade * .55 });
    } else if (effect.name === 'correction') {
      const angle = -1.2 + easeOutCubic(t) * Math.PI * 2;
      const correctionRadius = layout.scale * .66;
      graphics.moveTo(layout.cx + Math.cos(angle) * correctionRadius, layout.cy + Math.sin(angle) * correctionRadius)
        .arc(layout.cx, layout.cy, correctionRadius, angle, angle + 1.55)
        .stroke({ color: effect.color, width: 2.2, alpha: fade * .68, cap: 'round' });
    } else {
      graphics.circle(layout.cx, layout.cy, radius)
        .stroke({ color: effect.color, width: effect.name === 'completion' ? 2.6 : 1.2, alpha: fade * .48 });
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
  const flow = new PersistentFlowField(PIXI, { count: reducedMotion ? 54 : (config.particles || 96), seed: config.seed });
  const glyphs = new GlyphLayer(PIXI);
  const promptCore = new PromptCore(PIXI);
  const overlay = new PIXI.Graphics();
  overlay.blendMode = 'add';
  app.stage.addChild(ambient.graphics, construct.container, flow.container, glyphs.container, promptCore.container, overlay);

  const conductor = new StateConductor(config.initialState || 'quiet');
  const prompt = { emoji: config.promptEmoji || '🧠', label: config.promptLabel || 'Awaiting prompt' };
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let time = 0;
  let lastDomUpdate = 0;

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

  document.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => setState(button.dataset.state)));
  document.querySelectorAll('[data-effect]').forEach(button => button.addEventListener('click', () => trigger(button.dataset.effect)));
  document.querySelectorAll('[data-emoji]').forEach(button => button.addEventListener('click', () => setPrompt(button.dataset)));
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
  });
  stage.addEventListener('pointerleave', () => { pointer.targetX = 0; pointer.targetY = 0; });
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement) return;
    const effectNames = config.effects || Object.keys(EFFECTS);
    if (event.code === 'Space') { event.preventDefault(); trigger('pulse'); }
    if (/^Digit[1-8]$/.test(event.code)) trigger(effectNames[Number(event.code.slice(-1)) - 1]);
  });

  window.AIBrain = {
    version: '2.0.0',
    construct: config.id,
    setState,
    trigger,
    setPrompt,
    getState: () => conductor.snapshot(),
    getPrompt: () => ({ ...prompt }),
    getDebugSnapshot: () => ({
      ...flow.debugSnapshot(),
      state: conductor.state,
      construct: config.id,
      canvas: { width: app.screen.width, height: app.screen.height },
      prompt: { ...prompt },
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
    const state = conductor.update(dt);
    const layout = createLayout(app.screen.width, app.screen.height, pointer);
    const effectBoost = Math.max(0, ...state.effects.map(effect => effect.strength));
    ambient.render({
      width: layout.width,
      height: layout.height,
      time,
      pointer,
      color: config.ambientColor,
      energy: state.profile.energy,
      reducedMotion,
    });
    const frame = construct.render({ PIXI, layout, time, dt, pointer, reducedMotion, ...state, prompt, effectBoost });
    flow.update(frame.paths, { dt, time, profile: state.profile, layout, reducedMotion, effectBoost });
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
      updateDom(state, config, flow);
      lastDomUpdate = 0;
    }
  });
}
