export const TAU = Math.PI * 2;

export const STATE_PROFILES = Object.freeze({
  quiet:         { energy: .22, coherence: .82, curiosity: .18, outward: .22, guard: .10, creativity: .18, tempo: .42, warmth: .20, output: .68 },
  listening:     { energy: .42, coherence: .72, curiosity: .48, outward: .05, guard: .16, creativity: .22, tempo: .62, warmth: .42, output: .86 },
  understanding: { energy: .58, coherence: .90, curiosity: .44, outward: .30, guard: .12, creativity: .40, tempo: .74, warmth: .58, output: 1.00 },
  exploring:     { energy: .72, coherence: .45, curiosity: 1.00, outward: .52, guard: .08, creativity: .72, tempo: 1.05, warmth: .55, output: 1.24 },
  resolving:     { energy: .80, coherence: 1.00, curiosity: .35, outward: .44, guard: .18, creativity: .30, tempo: .92, warmth: .48, output: 1.12 },
  speaking:      { energy: .68, coherence: .76, curiosity: .25, outward: 1.00, guard: .08, creativity: .48, tempo: .86, warmth: .92, output: 1.18 },
  working:       { energy: .88, coherence: .84, curiosity: .50, outward: .40, guard: .22, creativity: .54, tempo: 1.18, warmth: .40, output: 1.38 },
  creating:      { energy: .92, coherence: .52, curiosity: .78, outward: .70, guard: .05, creativity: 1.00, tempo: 1.10, warmth: .82, output: 1.48 },
  uncertain:     { energy: .46, coherence: .28, curiosity: .72, outward: .18, guard: .35, creativity: .48, tempo: .58, warmth: .30, output: .78 },
  guarding:      { energy: .62, coherence: .96, curiosity: .12, outward: .14, guard: 1.00, creativity: .10, tempo: .68, warmth: .16, output: .74 },
});

export const EFFECTS = Object.freeze({
  recognition: { duration: .95, color: 0x80f7ff },
  insight:     { duration: 1.30, color: 0xffdc7a },
  recall:      { duration: 1.85, color: 0xa78bff },
  dispatch:    { duration: 1.10, color: 0xff7ea7 },
  correction:  { duration: 1.25, color: 0xff715f },
  completion:  { duration: 1.90, color: 0x8dffba },
  boundary:    { duration: 1.60, color: 0x69a7ff },
  pulse:       { duration: .72, color: 0xf4fbff },
});

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeInOutQuint = t => t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2;
export const easeOutExpo = t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const fract = value => value - Math.floor(value);
export const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

export function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function rgb(color) {
  return { r: (color >> 16) & 255, g: (color >> 8) & 255, b: color & 255 };
}

export function mixColor(a, b, t) {
  const ca = rgb(a);
  const cb = rgb(b);
  return ((lerp(ca.r, cb.r, t) | 0) << 16) | ((lerp(ca.g, cb.g, t) | 0) << 8) | (lerp(ca.b, cb.b, t) | 0);
}

export function quadratic(a, b, c, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
  };
}

export function cubic(a, b, c, d, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y,
  };
}

export function polar(radius, angle) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export class StateConductor {
  constructor(initial = 'quiet') {
    this.state = initial;
    this.previous = initial;
    this.elapsed = 1;
    this.duration = 1;
    this.current = { ...STATE_PROFILES[initial] };
    this.from = { ...this.current };
    this.to = { ...this.current };
    this.effects = [];
    this.serial = 0;
  }

  setState(next) {
    if (!STATE_PROFILES[next]) return false;
    this.previous = this.state;
    this.state = next;
    this.from = { ...this.current };
    this.to = { ...STATE_PROFILES[next] };
    const keys = Object.keys(this.to);
    const distance = keys.reduce((sum, key) => sum + Math.abs(this.to[key] - this.from[key]), 0) / keys.length;
    this.duration = lerp(.55, 1.25, clamp(distance));
    this.elapsed = 0;
    this.serial += 1;
    return true;
  }

  trigger(name) {
    const config = EFFECTS[name];
    if (!config) return false;
    this.effects.push({ name, age: 0, ...config, serial: ++this.serial });
    return true;
  }

  update(dt) {
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const raw = this.duration ? this.elapsed / this.duration : 1;
    const eased = easeInOutCubic(clamp(raw));
    for (const key of Object.keys(this.current)) {
      const easing = key === 'tempo' ? easeOutExpo(clamp(raw)) : eased;
      this.current[key] = lerp(this.from[key], this.to[key], easing);
    }
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter(effect => effect.age < effect.duration);
    return this.snapshot();
  }

  effect(name) {
    let value = 0;
    for (const item of this.effects) {
      if (item.name !== name) continue;
      const t = clamp(item.age / item.duration);
      value = Math.max(value, Math.sin(Math.PI * t) * (1 - .18 * t));
    }
    return value;
  }

  snapshot() {
    return {
      state: this.state,
      previous: this.previous,
      transition: clamp(this.elapsed / this.duration),
      profile: { ...this.current },
      effects: this.effects.map(effect => ({ ...effect, strength: Math.sin(Math.PI * clamp(effect.age / effect.duration)) })),
      effect: name => this.effect(name),
      serial: this.serial,
    };
  }
}

export class AmbientField {
  constructor(PIXI, count = 170, seed = 20260717) {
    this.graphics = new PIXI.Graphics();
    this.graphics.blendMode = 'add';
    const random = mulberry32(seed);
    this.stars = Array.from({ length: count }, (_, id) => ({
      id,
      x: random(),
      y: random(),
      size: lerp(.25, 1.55, random() ** 2),
      phase: random() * TAU,
      drift: lerp(.03, .16, random()),
      depth: lerp(.2, 1, random()),
    }));
  }

  render({ width, height, time, pointer, color = 0x86dfff, energy = .5, reducedMotion = false }) {
    const g = this.graphics;
    g.clear();
    for (const star of this.stars) {
      const drift = reducedMotion ? 0 : Math.sin(time * star.drift + star.phase) * 9 * star.depth;
      const x = mod(star.x * width + drift + pointer.x * star.depth * 5, width);
      const y = mod(star.y * height + Math.cos(time * star.drift + star.phase) * 5 + pointer.y * star.depth * 4, height);
      const alpha = (.08 + .15 * (Math.sin(time * .7 + star.phase) * .5 + .5)) * (.65 + energy * .5);
      g.circle(x, y, star.size * (1 + energy * .18)).fill({ color, alpha });
    }
  }
}

export class PersistentFlowField {
  constructor(PIXI, { baseCount = 92, maxMultiplier = 4, seed = 739391 } = {}) {
    this.PIXI = PIXI;
    this.baseCount = baseCount;
    this.maxMultiplier = maxMultiplier;
    this.multiplier = 1;
    this.speedMultiplier = 1;
    this.sizeVariation = 1;
    this.targetCount = baseCount;
    this.visibleCount = baseCount;
    this.backContainer = new PIXI.Container();
    this.frontContainer = new PIXI.Container();
    this.backTrails = new PIXI.Graphics();
    this.backParticles = new PIXI.Graphics();
    this.frontTrails = new PIXI.Graphics();
    this.frontParticles = new PIXI.Graphics();
    for (const graphic of [this.backTrails, this.backParticles, this.frontTrails, this.frontParticles]) graphic.blendMode = 'add';
    this.backContainer.addChild(this.backTrails, this.backParticles);
    this.frontContainer.addChild(this.frontTrails, this.frontParticles);
    // Kept as an alias for integrations written against the original single-layer field.
    this.container = this.backContainer;
    this.frame = 0;
    this.phaseTravel = 0;
    this.flowMode = 'loop';
    this.spawnCount = 0;
    this.deathCount = 0;
    this.lastLayout = null;
    const capacity = Math.ceil(baseCount * maxMultiplier);
    const random = mulberry32(seed);
    this.particles = Array.from({ length: capacity }, (_, id) => ({
      id: `neuron-${String(id).padStart(3, '0')}`,
      lane: Math.floor(random() * 97),
      phase: random(),
      speed: lerp(.025, .105, random() ** 1.8),
      size: lerp(.75, 3.25, random() ** 2.4),
      energy: lerp(.45, 1, random()),
      offset: (random() - .5) * .016,
      x: null,
      y: null,
      depth: .5,
      alpha: lerp(.42, .92, random()),
      visibility: id < baseCount ? 1 : 0,
      history: [],
      generation: 0,
      streamMode: 'loop',
      streamAlive: true,
      respawnDelay: 0,
    }));
  }

  setMultiplier(value) {
    this.multiplier = clamp(Number(value) || 1, .35, this.maxMultiplier);
    return this.multiplier;
  }

  setSpeed(value) {
    const numeric = Number(value);
    this.speedMultiplier = clamp(Number.isFinite(numeric) ? numeric : 1, 1, 10);
    return this.speedMultiplier;
  }

  setSizeVariation(value) {
    const numeric = Number(value);
    this.sizeVariation = clamp(Number.isFinite(numeric) ? numeric : 1, 0, 2);
    return this.sizeVariation;
  }

  renderSize(particle) {
    const nativeMean = 1.55;
    return clamp(nativeMean + (particle.size - nativeMean) * this.sizeVariation, .25, 5.25);
  }

  update(paths, {
    dt,
    time,
    profile,
    layout,
    reducedMotion = false,
    effectBoost = 0,
    effect = () => 0,
    mode = 'loop',
    speedScale = 1,
    respawnRate = 1,
  }) {
    if (!paths?.length) return;
    const oneWay = mode === 'one-way';
    this.flowMode = oneWay ? 'one-way' : 'loop';
    if (this.lastLayout && layout) {
      const scaleChange = layout.scale / Math.max(1, this.lastLayout.scale);
      const moved = Math.abs(layout.cx - this.lastLayout.cx) > .25 || Math.abs(layout.cy - this.lastLayout.cy) > .25 || Math.abs(scaleChange - 1) > .001;
      if (moved) {
        const remap = point => ({
          ...point,
          x: layout.cx + (point.x - this.lastLayout.cx) * scaleChange,
          y: layout.cy + (point.y - this.lastLayout.cy) * scaleChange,
        });
        for (const particle of this.particles) {
          if (particle.x !== null) {
            const next = remap(particle);
            particle.x = next.x;
            particle.y = next.y;
            particle.history = particle.history.map(remap);
          }
        }
      }
    }
    if (layout) this.lastLayout = { cx: layout.cx, cy: layout.cy, scale: layout.scale };

    const graphics = [this.backTrails, this.backParticles, this.frontTrails, this.frontParticles];
    for (const graphic of graphics) graphic.clear();
    this.frame += 1;
    this.targetCount = clamp(Math.round(this.baseCount * profile.output * this.multiplier), 12, this.particles.length);
    const tempo = reducedMotion ? .18 : profile.tempo;
    const historyLimit = reducedMotion ? 4 : Math.round(lerp(8, 17, profile.energy) + effect('recall') * 7);
    const dispatch = effect('dispatch');
    const recall = effect('recall');
    const correction = effect('correction');
    const completion = effect('completion');
    const pulseEffect = effect('pulse');
    let visibleTotal = 0;
    let frontVisible = 0;
    let frontCoreVisible = 0;
    let backCoreVisible = 0;

    for (let particleIndex = 0; particleIndex < this.particles.length; particleIndex++) {
      const particle = this.particles[particleIndex];
      const wantsVisible = particleIndex < this.targetCount ? 1 : 0;
      let lifecycleAlpha = 1;

      if (oneWay) {
        if (particle.streamMode !== 'one-way') {
          particle.streamMode = 'one-way';
          particle.streamAlive = Boolean(wantsVisible);
          particle.generation = particle.streamAlive ? 1 : 0;
          particle.phase = particle.streamAlive ? clamp(particle.phase * .90, 0, .90) : 0;
          particle.respawnDelay = lerp(.04, .62, fract(particle.energy * 9.73 + particleIndex * .137));
          particle.history = [];
          particle.x = null;
          particle.y = null;
          if (particle.streamAlive) this.spawnCount += 1;
        }

        if (!wantsVisible && particle.streamAlive) {
          particle.streamAlive = false;
          particle.visibility = 0;
          particle.history = [];
          particle.respawnDelay = lerp(.06, .34, fract(particle.energy * 5.31 + particle.generation * .381));
        }

        if (!particle.streamAlive) {
          particle.visibility = lerp(particle.visibility, 0, 1 - Math.exp(-dt * 12));
          particle.respawnDelay -= dt * clamp(respawnRate, .2, 3);
          if (wantsVisible && particle.respawnDelay <= 0) {
            particle.streamAlive = true;
            particle.generation += 1;
            particle.phase = 0;
            particle.lane = (particle.lane + 17 + particle.generation * 7 + particleIndex % 11) % 997;
            particle.x = null;
            particle.y = null;
            particle.history = [];
            particle.visibility = 0;
            this.spawnCount += 1;
          } else {
            visibleTotal += particle.visibility;
            continue;
          }
        }

        particle.visibility = lerp(particle.visibility, 1, 1 - Math.exp(-dt * 13));
      } else {
        if (particle.streamMode !== 'loop') {
          particle.streamMode = 'loop';
          particle.streamAlive = true;
          particle.phase = fract(particle.phase);
          particle.history = [];
          particle.x = null;
          particle.y = null;
        }
        const visibilityRate = wantsVisible > particle.visibility ? 8.5 : 2.4;
        particle.visibility = lerp(particle.visibility, wantsVisible, 1 - Math.exp(-dt * visibilityRate));
      }
      visibleTotal += particle.visibility;

      const path = paths[particle.lane % paths.length];
      const baseDirection = oneWay ? 1 : (path.direction ?? 1);
      const recallDirection = oneWay ? 1 : lerp(1, -1.25, recall);
      const effectTempo = (1 + dispatch * 2.7) * lerp(1, .48, completion);
      const phaseStep = dt * particle.speed * tempo * baseDirection * recallDirection * effectTempo * this.speedMultiplier * clamp(speedScale, .1, 5);
      if (oneWay) {
        particle.phase += Math.abs(phaseStep);
        if (particle.phase >= 1) {
          particle.phase = 1;
          particle.streamAlive = false;
          particle.visibility = 0;
          particle.respawnDelay = lerp(.04, .56, fract(particle.energy * 11.17 + particle.generation * .618 + particleIndex * .071)) / clamp(respawnRate, .2, 3);
          particle.history = [];
          particle.x = null;
          particle.y = null;
          this.deathCount += 1;
          continue;
        }
        lifecycleAlpha = Math.min(clamp(particle.phase / .065), clamp((1 - particle.phase) / .115));
      } else {
        particle.phase = mod(particle.phase + phaseStep, 1);
      }
      this.phaseTravel += Math.abs(phaseStep) * particle.visibility;
      const sampleT = oneWay ? clamp(particle.phase) : mod(particle.phase + particle.offset, 1);
      const target = path.sample(sampleT, particle);
      const targetDepth = typeof path.depth === 'function' ? path.depth(sampleT, particle) : (target.depth ?? .5);
      const jitter = correction * (particleIndex % 2 ? 1 : -1) * Math.sin(time * 38 + particleIndex * 2.1) * 3.2;
      target.x += jitter;
      if (particle.x === null || !Number.isFinite(particle.x)) {
        particle.x = target.x;
        particle.y = target.y;
        particle.depth = targetDepth;
      } else {
        const responsiveness = 1 - Math.exp(-dt * lerp(5.5, 11, profile.coherence));
        particle.x = lerp(particle.x, target.x, responsiveness);
        particle.y = lerp(particle.y, target.y, responsiveness);
        particle.depth = lerp(particle.depth, targetDepth, responsiveness);
      }
      const baseAlpha = clamp(.38 + particle.energy * .34 + profile.energy * .18 + effectBoost * .14, .34, 1);
      particle.alpha = lerp(particle.alpha, baseAlpha, 1 - Math.exp(-dt * 8));
      particle.history.push({ x: particle.x, y: particle.y, depth: particle.depth });
      while (particle.history.length > historyLimit) particle.history.shift();

      const renderAlpha = particle.alpha * particle.visibility * clamp(path.alpha ?? 1) * lifecycleAlpha;
      if (renderAlpha < .012) continue;
      const color = path.color ?? 0x76eaff;
      const relayBoost = path.centralRelay ? 1.55 : 1;
      const renderSize = this.renderSize(particle);
      const width = renderSize * lerp(.38, .74, profile.energy) * relayBoost;
      for (let index = 1; index < particle.history.length; index++) {
        const a = particle.history[index - 1];
        const b = particle.history[index];
        const life = index / particle.history.length;
        const isFront = typeof path.depth === 'function' && (a.depth + b.depth) * .5 > (path.frontThreshold ?? .53);
        const trail = isFront ? this.frontTrails : this.backTrails;
        trail.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
          color,
          width: Math.max(.18, width * life * (1 + recall * .35)),
          alpha: renderAlpha * life * life * (.30 + recall * .18),
          cap: 'round',
        });
      }

      const isFront = typeof path.depth === 'function' && particle.depth > (path.frontThreshold ?? .53);
      const dots = isFront ? this.frontParticles : this.backParticles;
      if (isFront) frontVisible += particle.visibility;
      if (path.centralRelay && layout && Math.hypot(particle.x - layout.cx, particle.y - layout.cy) < layout.scale * .18) {
        if (isFront) frontCoreVisible += particle.visibility;
        else backCoreVisible += particle.visibility;
      }
      const pulse = 1 + Math.sin(time * 4.5 + particle.phase * TAU * 2) * .16;
      const radius = renderSize * relayBoost * pulse * (1 + effectBoost * .18 + pulseEffect * .70);
      dots.circle(particle.x, particle.y, radius * 2.4).fill({ color, alpha: renderAlpha * .08 });
      dots.circle(particle.x, particle.y, radius).fill({ color, alpha: renderAlpha });
      if (renderSize > 2.15) dots.circle(particle.x, particle.y, Math.max(.45, radius * .33)).fill({ color: 0xffffff, alpha: renderAlpha * .94 });
    }
    this.visibleCount = visibleTotal;
    this.frontVisible = frontVisible;
    this.frontCoreVisible = frontCoreVisible;
    this.backCoreVisible = backCoreVisible;
  }

  debugSnapshot() {
    const visible = this.particles.filter(particle => particle.visibility > .05);
    const renderedSizes = this.particles.map(particle => this.renderSize(particle));
    const livingStreams = this.particles.filter(particle => particle.streamMode === 'one-way' && particle.streamAlive);
    return {
      count: this.particles.length,
      poolCount: this.particles.length,
      activeCount: Math.round(this.visibleCount),
      targetCount: this.targetCount,
      multiplier: this.multiplier,
      speedMultiplier: this.speedMultiplier,
      sizeVariation: this.sizeVariation,
      renderedSizeRange: {
        min: Number(Math.min(...renderedSizes).toFixed(2)),
        max: Number(Math.max(...renderedSizes).toFixed(2)),
      },
      phaseChecksum: Number(this.particles.slice(0, 20).reduce((sum, particle) => sum + particle.phase, 0).toFixed(5)),
      phaseTravel: Number(this.phaseTravel.toFixed(5)),
      flowMode: this.flowMode,
      livingStreams: livingStreams.length,
      spawnCount: this.spawnCount,
      deathCount: this.deathCount,
      maxGeneration: this.particles.reduce((maximum, particle) => Math.max(maximum, particle.generation), 0),
      streamPhaseRange: livingStreams.length ? {
        min: Number(Math.min(...livingStreams.map(particle => particle.phase)).toFixed(4)),
        max: Number(Math.max(...livingStreams.map(particle => particle.phase)).toFixed(4)),
      } : { min: 0, max: 0 },
      frontActive: Math.round(this.frontVisible || 0),
      frontCoreActive: Number((this.frontCoreVisible || 0).toFixed(2)),
      backCoreActive: Number((this.backCoreVisible || 0).toFixed(2)),
      ids: this.particles.map(particle => particle.id),
      minAlpha: visible.length ? Math.min(...visible.map(particle => particle.alpha * particle.visibility)) : 0,
      historySamples: this.particles.reduce((sum, particle) => sum + particle.history.length, 0),
    };
  }
}

export class GlyphLayer {
  constructor(PIXI) {
    this.PIXI = PIXI;
    this.container = new PIXI.Container();
    this.graphics = new PIXI.Graphics();
    this.container.addChild(this.graphics);
    this.labels = new Map();
  }

  render(nodes, { time, profile, effectBoost = 0 }) {
    const g = this.graphics;
    const visible = new Set();
    g.clear();
    for (const node of nodes || []) {
      visible.add(node.id);
      const pulse = 1 + Math.sin(time * (node.pulseSpeed || 1.6) + (node.phase || 0)) * (.025 + profile.energy * .035);
      const radius = node.radius * pulse;
      const color = node.color || 0x7beeff;
      const alpha = node.alpha ?? 1;
      if (node.kind === 'diamond') {
        const s = radius * 1.12;
        g.poly([node.x, node.y - s * 1.3, node.x + s, node.y, node.x, node.y + s * 1.3, node.x - s, node.y])
          .fill({ color: 0x070914, alpha: .78 * alpha })
          .stroke({ color, width: 1.2, alpha: (.60 + effectBoost * .22) * alpha });
      } else if (node.kind === 'knot') {
        g.circle(node.x, node.y, radius * 1.48).stroke({ color, width: 1, alpha: .18 * alpha });
        g.circle(node.x, node.y, radius).fill({ color: 0x08091a, alpha: .78 * alpha }).stroke({ color, width: 1.4, alpha: .68 * alpha });
        g.moveTo(node.x - radius * .62, node.y).bezierCurveTo(node.x - radius * .2, node.y - radius, node.x + radius * .2, node.y + radius, node.x + radius * .62, node.y)
          .stroke({ color, width: 1.1, alpha: .68 });
      } else if (node.kind === 'satellite') {
        g.circle(node.x, node.y, radius * 1.95).stroke({ color, width: .7, alpha: .16 * alpha });
        g.circle(node.x, node.y, radius).fill({ color: 0x03040a, alpha: .86 * alpha }).stroke({ color, width: 1, alpha: .75 * alpha });
      } else if (node.kind === 'organelle') {
        g.circle(node.x, node.y, radius * 1.55).fill({ color, alpha: .05 * alpha });
        g.circle(node.x, node.y, radius).fill({ color: 0x06120f, alpha: .84 * alpha }).stroke({ color, width: 1.35, alpha: .7 * alpha });
        g.moveTo(node.x + Math.cos(-.6) * radius * .72, node.y + Math.sin(-.6) * radius * .72)
          .arc(node.x, node.y, radius * .72, -.6, 1.6).stroke({ color: 0xffffff, width: .55, alpha: .34 });
      } else {
        g.circle(node.x, node.y, radius * 1.8).fill({ color, alpha: .045 * alpha });
        g.circle(node.x, node.y, radius * 1.25).stroke({ color, width: .65, alpha: .20 * alpha });
        g.circle(node.x, node.y, radius).fill({ color: 0x040914, alpha: .80 * alpha }).stroke({ color, width: 1.25, alpha: .72 * alpha });
        g.moveTo(node.x + Math.cos(-1.25) * radius * .78, node.y + Math.sin(-1.25) * radius * .78)
          .arc(node.x, node.y, radius * .78, -1.25, .28).stroke({ color: 0xffffff, width: .8, alpha: .35 * alpha });
      }

      let label = this.labels.get(node.id);
      if (!label) {
        label = new this.PIXI.Text({
          text: node.icon,
          style: new this.PIXI.TextStyle({
            fontFamily: 'Material Symbols Rounded',
            fontSize: 18,
            fontWeight: '400',
            fill: 0xf5fdff,
            align: 'center',
          }),
        });
        label.anchor.set(.5);
        this.labels.set(node.id, label);
        this.container.addChild(label);
      }
      label.text = node.icon;
      label.position.set(node.x, node.y + .5);
      label.style.fontSize = Math.max(10, radius * (node.iconScale || .88));
      label.style.fill = node.iconColor || 0xf5fdff;
      label.alpha = alpha;
      label.visible = true;
    }
    for (const [id, label] of this.labels) {
      if (!visible.has(id)) label.visible = false;
    }
  }
}

export class PromptCore {
  constructor(PIXI) {
    this.PIXI = PIXI;
    this.container = new PIXI.Container();
    this.graphics = new PIXI.Graphics();
    this.emoji = new PIXI.Text({
      text: '✦',
      style: new PIXI.TextStyle({ fontFamily: 'system-ui', fontSize: 48, fill: 0xffffff, align: 'center' }),
    });
    this.emoji.anchor.set(.5);
    this.label = new PIXI.Text({
      text: 'YOUR PROMPT',
      style: new PIXI.TextStyle({ fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 2.1, fill: 0xc8d7df, align: 'center' }),
    });
    this.label.anchor.set(.5);
    this.container.addChild(this.graphics, this.emoji, this.label);
  }

  render({ x, y, radius, style, prompt, time, profile, accent, secondary, effectBoost = 0 }) {
    const g = this.graphics;
    const pulse = 1 + Math.sin(time * 1.4) * .018 + effectBoost * .06;
    const r = radius * pulse;
    g.clear();
    if (style === 'shard') {
      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = -Math.PI / 2 + i * TAU / 6;
        const rr = i % 2 ? r * .86 : r * 1.08;
        points.push(x + Math.cos(angle) * rr, y + Math.sin(angle) * rr);
      }
      g.poly(points).fill({ color: 0x0b0716, alpha: .88 }).stroke({ color: accent, width: 1.7, alpha: .72 });
      g.poly(points.map((value, index) => index % 2 ? y + (value - y) * .76 : x + (value - x) * .76)).stroke({ color: secondary, width: .8, alpha: .22 });
    } else if (style === 'membrane') {
      g.circle(x, y, r * 1.42).fill({ color: accent, alpha: .04 });
      g.circle(x, y, r * 1.18).stroke({ color: secondary, width: 1.2, alpha: .28 });
      g.circle(x, y, r).fill({ color: 0x05130f, alpha: .92 }).stroke({ color: accent, width: 1.6, alpha: .74 });
      g.moveTo(x + Math.cos(-1.1) * r * .79, y + Math.sin(-1.1) * r * .79)
        .arc(x, y, r * .79, -1.1, 1.8).stroke({ color: 0xffffff, width: 1, alpha: .28 });
    } else if (style === 'lens') {
      g.circle(x, y, r * 1.65).stroke({ color: secondary, width: 2.4, alpha: .16 + effectBoost * .18 });
      g.ellipse(x, y, r * 1.52, r * .48).stroke({ color: accent, width: 2.2, alpha: .72 });
      g.circle(x, y, r).fill({ color: 0x010205, alpha: .96 }).stroke({ color: 0xfff0d4, width: .8, alpha: .42 });
    } else if (style === 'shuttle') {
      g.roundRect(x - r * .72, y - r * 1.06, r * 1.44, r * 2.12, r * .58).fill({ color: 0x090a1c, alpha: .92 }).stroke({ color: accent, width: 1.4, alpha: .72 });
      g.circle(x, y, r * .70).stroke({ color: secondary, width: .8, alpha: .32 });
      g.moveTo(x - r * 1.18, y).lineTo(x + r * 1.18, y).stroke({ color: accent, width: .8, alpha: .28 });
    } else {
      g.circle(x, y, r * 1.55).fill({ color: accent, alpha: .035 + effectBoost * .035 });
      g.circle(x, y, r * 1.27).stroke({ color: secondary, width: .8, alpha: .30 });
      g.circle(x, y, r).fill({ color: 0x030711, alpha: .92 }).stroke({ color: accent, width: 1.5, alpha: .78 });
      g.moveTo(x + Math.cos(-1.45) * r * .82, y + Math.sin(-1.45) * r * .82)
        .arc(x, y, r * .82, -1.45, -.15).stroke({ color: 0xffffff, width: 1.1, alpha: .38 });
    }
    this.emoji.text = prompt.emoji;
    this.emoji.position.set(x, y - radius * .07);
    this.emoji.style.fontSize = Math.round(radius * .80);
    this.emoji.scale.set(1 + profile.creativity * .035 + effectBoost * .08);
    this.label.text = String(prompt.label || 'YOUR PROMPT').toUpperCase();
    this.label.position.set(x, y + radius * 1.42);
    this.label.style.fontSize = Math.max(7, Math.round(radius * .15));
    this.label.alpha = .58 + profile.coherence * .22;
  }
}

export function createLayout(width, height, pointer = { x: 0, y: 0 }) {
  const compact = width < 680;
  const scale = Math.min(width * (compact ? .39 : .40), height * (compact ? .40 : .43));
  const cx = width / 2 + pointer.x * scale * .025;
  const cy = height / 2 + pointer.y * scale * .02;
  return {
    width,
    height,
    compact,
    cx,
    cy,
    scale,
    point(position) { return { x: cx + position.x * scale, y: cy + position.y * scale }; },
  };
}

export function drawPolyline(graphics, points, style, close = false) {
  if (!points.length) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) graphics.lineTo(points[i].x, points[i].y);
  if (close) graphics.lineTo(points[0].x, points[0].y);
  graphics.stroke(style);
}

export function samplePath(path, steps = 48) {
  return Array.from({ length: steps + 1 }, (_, index) => path.sample(index / steps));
}
