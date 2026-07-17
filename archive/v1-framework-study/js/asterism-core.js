const TAU = Math.PI * 2;

export const STATE_PROFILES = {
  quiet: {
    label: "Quiet",
    note: "Possibilities remain present without being forced into structure.",
    energy: 0.18,
    coherence: 0.4,
    exploration: 0.18,
    outward: 0.02,
    radius: 0.94,
    connections: 0.28,
    rotation: 0.12,
    violet: 0.08,
    guard: 0,
  },
  listening: {
    label: "Listening",
    note: "The field turns inward and organizes around an arriving signal.",
    energy: 0.4,
    coherence: 0.58,
    exploration: 0.35,
    outward: -0.65,
    radius: 0.9,
    connections: 0.5,
    rotation: 0.08,
    violet: 0.04,
    guard: 0,
  },
  understanding: {
    label: "Understanding",
    note: "Related constellations wake and settle around the prompt aperture.",
    energy: 0.58,
    coherence: 0.72,
    exploration: 0.5,
    outward: -0.18,
    radius: 0.88,
    connections: 0.72,
    rotation: 0.1,
    violet: 0.08,
    guard: 0,
  },
  exploring: {
    label: "Exploring",
    note: "Several candidate structures grow at once and test distant connections.",
    energy: 0.72,
    coherence: 0.42,
    exploration: 1,
    outward: 0.16,
    radius: 1.05,
    connections: 0.64,
    rotation: 0.24,
    violet: 0.32,
    guard: 0,
  },
  resolving: {
    label: "Resolving",
    note: "Competing paths braid into fewer, stronger relationships.",
    energy: 0.66,
    coherence: 0.94,
    exploration: 0.26,
    outward: 0.08,
    radius: 0.84,
    connections: 0.92,
    rotation: 0.08,
    violet: 0.04,
    guard: 0,
  },
  speaking: {
    label: "Speaking",
    note: "Coherent structure unwinds into ordered outward transmission.",
    energy: 0.56,
    coherence: 0.86,
    exploration: 0.18,
    outward: 1,
    radius: 0.92,
    connections: 0.7,
    rotation: 0.1,
    violet: 0.02,
    guard: 0,
  },
  working: {
    label: "Working",
    note: "A tethered task constellation separates and processes in parallel.",
    energy: 0.84,
    coherence: 0.7,
    exploration: 0.56,
    outward: 0.28,
    radius: 1,
    connections: 0.84,
    rotation: 0.2,
    violet: 0.14,
    guard: 0,
  },
  creating: {
    label: "Creating",
    note: "Distant ideas form unlikely temporary relationships.",
    energy: 0.76,
    coherence: 0.38,
    exploration: 1,
    outward: 0.34,
    radius: 1.08,
    connections: 0.76,
    rotation: 0.28,
    violet: 0.82,
    guard: 0,
  },
  uncertain: {
    label: "Uncertain",
    note: "Plausible structures remain visibly unresolved instead of collapsing early.",
    energy: 0.48,
    coherence: 0.24,
    exploration: 0.86,
    outward: -0.08,
    radius: 1.05,
    connections: 0.46,
    rotation: 0.16,
    violet: 0.24,
    guard: 0,
  },
  guarding: {
    label: "Guarding",
    note: "The field contracts while a protective lattice redirects unsafe energy.",
    energy: 0.8,
    coherence: 0.92,
    exploration: 0.12,
    outward: -0.2,
    radius: 0.82,
    connections: 0.94,
    rotation: 0.06,
    violet: 0,
    guard: 0.92,
  },
};

export const EFFECTS = {
  recognition: { label: "Recognition", duration: 1.8 },
  insight: { label: "Insight", duration: 2.4 },
  recall: { label: "Recall", duration: 2.8 },
  dispatch: { label: "Tool dispatch", duration: 3.4 },
  correction: { label: "Correction", duration: 2.8 },
  completion: { label: "Completion", duration: 2.4 },
  warning: { label: "Boundary", duration: 2.2 },
  reconstruct: { label: "Reconstruct", duration: 3.6 },
};

const CLUSTER_CENTERS = [
  [-0.62, -0.08, 0.08],
  [-0.4, 0.48, -0.16],
  [0.12, 0.66, 0.1],
  [0.58, 0.28, -0.08],
  [0.55, -0.4, 0.16],
  [0.02, -0.64, -0.1],
  [-0.44, -0.5, 0.18],
];

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function easeInOut(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function bell(value) {
  return Math.sin(clamp(value) * Math.PI);
}

function copyProfile(profile) {
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => typeof value === "number"),
  );
}

export class Asterism {
  constructor({ nodeCount = 560, reducedMotion = false } = {}) {
    this.random = mulberry32(0xa57e215);
    this.nodeCount = nodeCount;
    this.reducedMotion = reducedMotion;
    this.time = 0;
    this.state = "quiet";
    this.target = copyProfile(STATE_PROFILES.quiet);
    this.current = { ...this.target };
    this.effects = [];
    this.nodes = [];
    this.edges = [];
    this.signals = [];
    this.aperture = {
      radius: 0.17,
      intensity: 0.4,
      phase: 0,
      guard: 0,
      color: [0.2, 0.85, 1],
    };
    this._buildNodes();
    this._buildEdges();
    this._buildSignals();
  }

  _buildNodes() {
    const networkCount = Math.min(126, Math.max(84, Math.floor(this.nodeCount * 0.24)));

    for (let index = 0; index < this.nodeCount; index += 1) {
      const network = index < networkCount;
      const anchor = index < CLUSTER_CENTERS.length;
      const cluster = network ? index % CLUSTER_CENTERS.length : -1;
      let x;
      let y;
      let z;

      if (network) {
        const center = CLUSTER_CENTERS[cluster];
        const spread = anchor ? 0.018 : 0.08 + this.random() * 0.15;
        const angle = this.random() * TAU;
        const radius = anchor ? this.random() : Math.sqrt(this.random());
        x = center[0] + Math.cos(angle) * radius * spread;
        y = center[1] + Math.sin(angle) * radius * spread;
        z = center[2] + (this.random() - 0.5) * spread * 1.8;
      } else {
        const angle = this.random() * TAU;
        const radius = 0.32 + Math.pow(this.random(), 0.68) * 0.84;
        x = Math.cos(angle) * radius * (0.82 + this.random() * 0.26);
        y = Math.sin(angle) * radius * (0.76 + this.random() * 0.32);
        z = (this.random() - 0.5) * 0.86;
      }

      const scatterAngle = this.random() * TAU;
      const scatterLift = this.random() * 2 - 1;
      const scatterRadius = Math.sqrt(Math.max(0, 1 - scatterLift * scatterLift));

      this.nodes.push({
        index,
        cluster,
        kind: anchor ? "anchor" : network ? "network" : "dust",
        base: [x, y, z],
        scatter: [
          Math.cos(scatterAngle) * scatterRadius,
          Math.sin(scatterAngle) * scatterRadius,
          scatterLift,
        ],
        phase: this.random() * TAU,
        speed: 0.45 + this.random() * 0.9,
        sizeBase: anchor
          ? 8.5 + this.random() * 3
          : network
            ? 3.2 + this.random() * 3.8
            : 1 + this.random() * 2.2,
        x,
        y,
        z,
        size: 1,
        alpha: 0,
        intensity: 0,
        color: [0.2, 0.85, 1],
      });
    }
  }

  _buildEdges() {
    const networkNodes = this.nodes.filter((node) => node.kind !== "dust");
    const byCluster = Array.from({ length: CLUSTER_CENTERS.length }, () => []);

    networkNodes.forEach((node) => {
      byCluster[node.cluster].push(node.index);
    });

    byCluster.forEach((indices, cluster) => {
      const anchor = cluster;
      indices.slice(1).forEach((nodeIndex, localIndex) => {
        if (localIndex < 8 || localIndex % 3 === 0) {
          this._addEdge(anchor, nodeIndex, false);
        }
        if (localIndex > 0) {
          this._addEdge(indices[localIndex], nodeIndex, false);
        }
      });
    });

    for (let cluster = 0; cluster < CLUSTER_CENTERS.length; cluster += 1) {
      this._addEdge(cluster, (cluster + 1) % CLUSTER_CENTERS.length, true);
    }
  }

  _addEdge(a, b, cross) {
    if (a === b || this.edges.some((edge) => edge.a === a && edge.b === b)) {
      return;
    }
    this.edges.push({
      a,
      b,
      cross,
      phase: this.random(),
      speed: 0.12 + this.random() * 0.24,
      intensity: 0,
      pulse: 0,
      color: [0.15, 0.72, 1],
    });
  }

  _buildSignals() {
    const signalCount = Math.min(54, this.edges.length);
    for (let index = 0; index < signalCount; index += 1) {
      this.signals.push({
        edge: (index * 7) % this.edges.length,
        offset: this.random(),
        speed: 0.06 + this.random() * 0.12,
        x: 0,
        y: 0,
        z: 0,
        size: 2,
        alpha: 0,
        color: [0.75, 0.97, 1],
      });
    }
    this.signals.push({
      prompt: true,
      edge: -1,
      offset: 0,
      speed: 0,
      x: 0,
      y: 0,
      z: 0,
      size: 5.4,
      alpha: 0.9,
      color: [1, 0.72, 0.32],
    });
  }

  setState(name) {
    if (!STATE_PROFILES[name]) {
      throw new Error(`Unknown Asterism state: ${name}`);
    }
    this.state = name;
    this.target = copyProfile(STATE_PROFILES[name]);
  }

  trigger(type, options = {}) {
    if (!EFFECTS[type]) {
      throw new Error(`Unknown Asterism effect: ${type}`);
    }
    const effect = {
      type,
      startedAt: this.time,
      duration: options.duration ?? EFFECTS[type].duration,
      cluster: options.cluster ?? Math.floor(this.random() * CLUSTER_CENTERS.length),
      strength: options.strength ?? 1,
    };
    this.effects.push(effect);
    return effect;
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  update(deltaSeconds) {
    const motion = this.reducedMotion ? 0.2 : 1;
    const delta = Math.min(deltaSeconds, 0.05);
    this.time += delta * motion;

    const blend = 1 - Math.exp(-delta * (this.reducedMotion ? 5 : 2.1));
    Object.keys(this.current).forEach((key) => {
      this.current[key] = mix(this.current[key], this.target[key], blend);
    });

    this.effects = this.effects.filter(
      (effect) => this.time - effect.startedAt < effect.duration,
    );

    const activeEffects = this.effects.map((effect) => ({
      ...effect,
      progress: clamp((this.time - effect.startedAt) / effect.duration),
    }));

    const profile = this.current;
    const driftAmount = (0.012 + (1 - profile.coherence) * 0.052) * motion;
    const statePulse = 0.5 + 0.5 * Math.sin(this.time * (1.15 + profile.energy * 1.5));

    for (const node of this.nodes) {
      const baseRadius = profile.radius;
      let x = node.base[0] * baseRadius;
      let y = node.base[1] * baseRadius;
      let z = node.base[2] * baseRadius;
      const drift =
        Math.sin(this.time * node.speed + node.phase) *
        driftAmount *
        (node.kind === "dust" ? 1.4 : 0.6);
      x += node.scatter[0] * drift;
      y += node.scatter[1] * drift;
      z += node.scatter[2] * drift;

      let effectBoost = 0;
      let amber = profile.guard * 0.54;
      let reconstructFade = 1;

      for (const effect of activeEffects) {
        const wave = effect.strength * bell(effect.progress);
        const distance = Math.hypot(node.base[0], node.base[1]);

        if (effect.type === "recognition") {
          const ring = effect.progress * 1.32;
          effectBoost +=
            Math.exp(-Math.pow((distance - ring) / 0.09, 2)) * effect.strength;
        }

        if (effect.type === "insight") {
          const convergence = 1 - Math.abs(effect.progress * 2 - 1);
          x *= 1 - convergence * 0.12;
          y *= 1 - convergence * 0.12;
          effectBoost += wave * (node.kind === "network" ? 1.25 : 0.38);
        }

        if (effect.type === "recall" && node.cluster === effect.cluster) {
          z += wave * 0.42;
          effectBoost += wave;
        }

        if (effect.type === "dispatch" && node.cluster === effect.cluster) {
          x += wave * 0.74;
          y -= wave * 0.28;
          z += wave * 0.22;
          effectBoost += wave * 0.7;
        }

        if (effect.type === "correction" && node.kind === "network") {
          x += Math.sin(effect.progress * TAU * 2 + node.phase) * wave * 0.035;
          effectBoost += wave * 0.42;
        }

        if (effect.type === "completion") {
          const sweep = effect.progress * 2.6 - 1.3;
          effectBoost +=
            Math.exp(-Math.pow((node.base[0] - sweep) / 0.12, 2)) *
            effect.strength *
            1.4;
        }

        if (effect.type === "warning") {
          amber = Math.max(amber, wave * clamp((distance - 0.35) * 1.7));
          effectBoost += wave * 0.34;
        }

        if (effect.type === "reconstruct") {
          const expand = bell(effect.progress) * 1.35 * effect.strength;
          x += node.scatter[0] * expand;
          y += node.scatter[1] * expand;
          z += node.scatter[2] * expand;
          reconstructFade = 0.28 + 0.72 * Math.abs(effect.progress * 2 - 1);
        }
      }

      const baseIntensity =
        node.kind === "anchor"
          ? 0.78
          : node.kind === "network"
            ? 0.34 + profile.connections * 0.4
            : 0.12 + profile.energy * 0.18;
      const flicker =
        node.kind === "dust"
          ? 0.7 + 0.3 * Math.sin(this.time * node.speed * 1.8 + node.phase)
          : 0.86 + statePulse * 0.14;
      const intensity = clamp((baseIntensity * flicker + effectBoost) * reconstructFade);

      const violet = clamp(profile.violet * (0.3 + node.index % 7 / 10));
      const stable = [0.77, 0.96, 1];
      const cyan = [0.08, 0.75, 1];
      const creative = [0.48, 0.3, 1];
      const warning = [1, 0.52, 0.12];
      const activeMix = clamp(profile.energy * 0.65 + effectBoost * 0.28);
      let red = mix(stable[0], cyan[0], activeMix);
      let green = mix(stable[1], cyan[1], activeMix);
      let blue = mix(stable[2], cyan[2], activeMix);
      red = mix(red, creative[0], violet);
      green = mix(green, creative[1], violet);
      blue = mix(blue, creative[2], violet);
      red = mix(red, warning[0], amber);
      green = mix(green, warning[1], amber);
      blue = mix(blue, warning[2], amber);

      node.x = x;
      node.y = y;
      node.z = z;
      node.intensity = intensity;
      node.alpha = clamp(
        intensity * (node.kind === "dust" ? 0.72 : 0.92) + effectBoost * 0.18,
      );
      node.size =
        node.sizeBase *
        (0.72 + intensity * 0.52) *
        (this.reducedMotion ? 0.94 : 1);
      node.color[0] = red;
      node.color[1] = green;
      node.color[2] = blue;
    }

    for (const edge of this.edges) {
      const a = this.nodes[edge.a];
      const b = this.nodes[edge.b];
      const crossPenalty = edge.cross ? 0.78 : 1;
      edge.pulse = (this.time * edge.speed * (0.7 + profile.energy) + edge.phase) % 1;
      edge.intensity = clamp(
        profile.connections *
          crossPenalty *
          (0.32 + Math.min(a.intensity, b.intensity) * 0.8),
      );
      const amber = profile.guard * 0.48;
      edge.color[0] = mix(0.08, 1, amber);
      edge.color[1] = mix(0.66, 0.5, amber);
      edge.color[2] = mix(1, 0.12, amber);
    }

    for (const signal of this.signals) {
      if (signal.prompt) {
        const promptAngle = this.time * 0.38;
        const promptRadius = this.aperture.radius * 1.34;
        signal.x = Math.cos(promptAngle) * promptRadius;
        signal.y = Math.sin(promptAngle) * promptRadius;
        signal.z = 0.04 + Math.sin(this.time * 0.27) * 0.025;
        signal.alpha = 0.72 + statePulse * 0.2;
        signal.size = 5.2 + profile.energy * 1.4;
        continue;
      }
      const edge = this.edges[signal.edge];
      const a = this.nodes[edge.a];
      const b = this.nodes[edge.b];
      let travel =
        (this.time * signal.speed * (1.5 + profile.energy * 3) +
          signal.offset +
          edge.phase) %
        1;
      if (profile.outward < -0.15) {
        travel = 1 - travel;
      }
      const smoothTravel = easeInOut(travel);
      signal.x = mix(a.x, b.x, smoothTravel);
      signal.y = mix(a.y, b.y, smoothTravel);
      signal.z = mix(a.z, b.z, smoothTravel);
      signal.alpha = clamp(edge.intensity * (0.48 + profile.energy * 0.72));
      signal.size = 2.4 + profile.energy * 3.2;
      signal.color[0] = mix(0.72, 0.98, profile.guard * 0.6);
      signal.color[1] = mix(0.95, 0.58, profile.guard * 0.6);
      signal.color[2] = mix(1, 0.18, profile.guard * 0.6);
    }

    this.aperture.radius =
      0.16 + profile.energy * 0.028 + Math.sin(this.time * 1.2) * 0.008 * motion;
    this.aperture.intensity = 0.32 + profile.coherence * 0.46;
    this.aperture.phase = this.time * (0.16 + profile.rotation);
    this.aperture.guard = profile.guard;
    this.aperture.color[0] = mix(0.16, 1, profile.guard * 0.7);
    this.aperture.color[1] = mix(0.78, 0.52, profile.guard * 0.7);
    this.aperture.color[2] = mix(1, 0.12, profile.guard * 0.7);

    return this.snapshot();
  }

  snapshot() {
    return {
      time: this.time,
      state: this.state,
      profile: this.current,
      nodes: this.nodes,
      edges: this.edges,
      signals: this.signals,
      aperture: this.aperture,
      effects: this.effects,
    };
  }

  metrics() {
    return {
      state: this.state,
      energy: this.current.energy,
      coherence: this.current.coherence,
      exploration: this.current.exploration,
      activeConnections: Math.round(
        this.edges.length * this.current.connections,
      ),
      activeEffects: this.effects.map((effect) => effect.type),
    };
  }
}
