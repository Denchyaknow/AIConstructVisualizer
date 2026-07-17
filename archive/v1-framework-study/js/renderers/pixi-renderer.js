import {
  Application,
  Graphics,
} from "https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs";

function colorNumber(color) {
  return (
    (Math.round(color[0] * 255) << 16) |
    (Math.round(color[1] * 255) << 8) |
    Math.round(color[2] * 255)
  );
}

export async function createPixiRenderer(host) {
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: "webgl",
  });
  host.appendChild(app.canvas);
  app.ticker.stop();

  const edgeLayer = new Graphics();
  const apertureLayer = new Graphics();
  const nodeGlowLayer = new Graphics();
  const nodeLayer = new Graphics();
  const signalLayer = new Graphics();
  app.stage.addChild(
    edgeLayer,
    apertureLayer,
    nodeGlowLayer,
    nodeLayer,
    signalLayer,
  );

  const project = (item, pointer) => {
    const width = app.renderer.width / app.renderer.resolution;
    const height = app.renderer.height / app.renderer.resolution;
    const scale = Math.min(width, height) * 0.37;
    const depth = 1 + item.z * 0.16;
    return {
      x: width / 2 + (item.x * scale) / depth + pointer.x * item.z * 18,
      y: height / 2 + (item.y * scale) / depth + pointer.y * item.z * 12,
      depth,
    };
  };

  return {
    render(snapshot, pointer) {
      edgeLayer.clear();
      apertureLayer.clear();
      nodeGlowLayer.clear();
      nodeLayer.clear();
      signalLayer.clear();

      for (const edge of snapshot.edges) {
        const a = project(snapshot.nodes[edge.a], pointer);
        const b = project(snapshot.nodes[edge.b], pointer);
        const middleX = (a.x + b.x) * 0.5 + (b.y - a.y) * 0.035;
        const middleY = (a.y + b.y) * 0.5 - (b.x - a.x) * 0.035;
        edgeLayer
          .moveTo(a.x, a.y)
          .quadraticCurveTo(middleX, middleY, b.x, b.y)
          .stroke({
            width: edge.cross ? 0.65 : 0.85,
            color: colorNumber(edge.color),
            alpha: edge.intensity * (edge.cross ? 0.34 : 0.52),
          });
      }

      const width = app.renderer.width / app.renderer.resolution;
      const height = app.renderer.height / app.renderer.resolution;
      const scale = Math.min(width, height) * 0.37;
      const apertureRadius = snapshot.aperture.radius * scale;
      apertureLayer
        .circle(width / 2, height / 2, apertureRadius)
        .stroke({
          width: 1,
          color: colorNumber(snapshot.aperture.color),
          alpha: snapshot.aperture.intensity * 0.56,
        })
        .circle(width / 2, height / 2, apertureRadius * 1.47)
        .stroke({
          width: 0.65,
          color: colorNumber(snapshot.aperture.color),
          alpha: snapshot.aperture.intensity * 0.2,
        });

      const orderedNodes = [...snapshot.nodes].sort((a, b) => a.z - b.z);
      for (const node of orderedNodes) {
        const point = project(node, pointer);
        const radius = Math.max(0.45, (node.size * 0.25) / point.depth);
        const color = colorNumber(node.color);
        if (node.kind !== "dust" && node.alpha > 0.28) {
          nodeGlowLayer.circle(point.x, point.y, radius * 2.6).fill({
            color,
            alpha: node.alpha * 0.055,
          });
        }
        nodeLayer.circle(point.x, point.y, radius).fill({
          color,
          alpha: node.alpha,
        });
        if (node.kind === "anchor") {
          nodeLayer.circle(point.x, point.y, Math.max(0.6, radius * 0.32)).fill({
            color: 0xeafdff,
            alpha: Math.min(1, node.alpha + 0.18),
          });
        }
      }

      for (const signal of snapshot.signals) {
        const point = project(signal, pointer);
        const radius = Math.max(0.8, signal.size * 0.34);
        signalLayer.circle(point.x, point.y, radius * 2.4).fill({
          color: colorNumber(signal.color),
          alpha: signal.alpha * 0.1,
        });
        signalLayer.circle(point.x, point.y, radius).fill({
          color: colorNumber(signal.color),
          alpha: signal.alpha,
        });
      }

      app.renderer.render(app.stage);
    },
    destroy() {
      app.destroy(true);
    },
  };
}
