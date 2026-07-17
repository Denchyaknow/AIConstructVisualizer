function waitForRegl() {
  if (window.createREGL) return Promise.resolve(window.createREGL);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("regl did not load.")),
      10000,
    );
    window.addEventListener(
      "regl-ready",
      () => {
        window.clearTimeout(timeout);
        resolve(window.createREGL);
      },
      { once: true },
    );
  });
}

export async function createReglRenderer(host) {
  const createREGL = await waitForRegl();
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  const regl = createREGL({
    canvas,
    attributes: {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    },
  });

  const resize = () => {
    const bounds = host.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const vertex = `
    precision mediump float;
    attribute vec3 position;
    attribute vec3 color;
    attribute float alpha;
    attribute float size;
    uniform float aspect;
    uniform vec2 pointer;
    uniform float scale;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      float yaw = pointer.x * 0.16;
      float pitch = pointer.y * 0.11;
      vec3 p = position;
      p = vec3(
        cos(yaw) * p.x - sin(yaw) * p.z,
        p.y,
        sin(yaw) * p.x + cos(yaw) * p.z
      );
      p = vec3(
        p.x,
        cos(pitch) * p.y - sin(pitch) * p.z,
        sin(pitch) * p.y + cos(pitch) * p.z
      );
      float perspective = 1.0 / (1.0 + p.z * 0.17);
      gl_Position = vec4(p.x * scale * perspective / aspect, -p.y * scale * perspective, 0.0, 1.0);
      gl_PointSize = max(1.0, size * perspective);
      vColor = color;
      vAlpha = alpha;
    }
  `;

  const pointFragment = `
    precision mediump float;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      float d = distance(gl_PointCoord, vec2(0.5));
      float glow = 1.0 - smoothstep(0.08, 0.5, d);
      if (glow < 0.01) discard;
      gl_FragColor = vec4(vColor * (0.8 + glow * 0.55), glow * vAlpha);
    }
  `;

  const lineFragment = `
    precision mediump float;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      gl_FragColor = vec4(vColor, vAlpha);
    }
  `;

  const commonUniforms = {
    aspect: ({ viewportWidth, viewportHeight }) =>
      viewportWidth / viewportHeight,
    pointer: regl.prop("pointer"),
    scale: ({ viewportWidth, viewportHeight }) =>
      viewportWidth / viewportHeight > 1 ? 0.78 : 0.94,
  };

  const drawPoints = regl({
    vert: vertex,
    frag: pointFragment,
    attributes: {
      position: regl.prop("positions"),
      color: regl.prop("colors"),
      alpha: regl.prop("alphas"),
      size: regl.prop("sizes"),
    },
    uniforms: commonUniforms,
    count: regl.prop("count"),
    primitive: "points",
    depth: { enable: false },
    blend: {
      enable: true,
      func: { srcRGB: "src alpha", dstRGB: "one", srcAlpha: "one", dstAlpha: "one" },
    },
  });

  const drawLines = regl({
    vert: vertex,
    frag: lineFragment,
    attributes: {
      position: regl.prop("positions"),
      color: regl.prop("colors"),
      alpha: regl.prop("alphas"),
      size: regl.prop("sizes"),
    },
    uniforms: commonUniforms,
    count: regl.prop("count"),
    primitive: regl.prop("primitive"),
    lineWidth: 1,
    depth: { enable: false },
    blend: {
      enable: true,
      func: { srcRGB: "src alpha", dstRGB: "one", srcAlpha: "one", dstAlpha: "one" },
    },
  });

  function itemArrays(items, sizeMultiplier = 1) {
    const positions = [];
    const colors = [];
    const alphas = [];
    const sizes = [];
    for (const item of items) {
      positions.push(item.x, item.y, item.z);
      colors.push(...item.color);
      alphas.push(item.alpha);
      sizes.push(item.size * sizeMultiplier);
    }
    return { positions, colors, alphas, sizes, count: items.length };
  }

  return {
    render(snapshot, pointer) {
      regl.poll();
      regl.clear({ color: [0, 0, 0, 0], depth: 1 });

      const linePositions = [];
      const lineColors = [];
      const lineAlphas = [];
      const lineSizes = [];
      for (const edge of snapshot.edges) {
        const a = snapshot.nodes[edge.a];
        const b = snapshot.nodes[edge.b];
        linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        lineColors.push(...edge.color, ...edge.color);
        lineAlphas.push(edge.intensity * 0.48, edge.intensity * 0.48);
        lineSizes.push(1, 1);
      }
      drawLines({
        positions: linePositions,
        colors: lineColors,
        alphas: lineAlphas,
        sizes: lineSizes,
        count: snapshot.edges.length * 2,
        primitive: "lines",
        pointer: [pointer.x, pointer.y],
      });

      const ringPositions = [];
      const ringColors = [];
      const ringAlphas = [];
      const ringSizes = [];
      const ringSegments = 128;
      for (let index = 0; index < ringSegments; index += 1) {
        const angle = (index / (ringSegments - 1)) * Math.PI * 2;
        ringPositions.push(
          Math.cos(angle) * snapshot.aperture.radius,
          Math.sin(angle) * snapshot.aperture.radius,
          0,
        );
        ringColors.push(...snapshot.aperture.color);
        ringAlphas.push(snapshot.aperture.intensity * 0.62);
        ringSizes.push(1);
      }
      drawLines({
        positions: ringPositions,
        colors: ringColors,
        alphas: ringAlphas,
        sizes: ringSizes,
        count: ringSegments,
        primitive: "line strip",
        pointer: [pointer.x, pointer.y],
      });

      drawPoints({
        ...itemArrays(snapshot.nodes, Math.min(window.devicePixelRatio || 1, 1.6)),
        pointer: [pointer.x, pointer.y],
      });
      drawPoints({
        ...itemArrays(snapshot.signals, 1.35),
        pointer: [pointer.x, pointer.y],
      });
    },
    destroy() {
      resizeObserver.disconnect();
      regl.destroy();
    },
  };
}
