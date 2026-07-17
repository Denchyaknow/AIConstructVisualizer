function waitForTsParticles() {
  if (window.tsParticles) return Promise.resolve(window.tsParticles);
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const poll = () => {
      if (window.tsParticles) {
        resolve(window.tsParticles);
      } else if (performance.now() - started > 12000) {
        reject(new Error("tsParticles did not load."));
      } else {
        window.setTimeout(poll, 50);
      }
    };
    poll();
  });
}

function rgb(color, alpha = 1) {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${alpha})`;
}

export async function createTsParticlesRenderer(host, simulation) {
  const tsParticles = await waitForTsParticles();
  const stageId = `tsparticles-stage-${Math.random().toString(36).slice(2)}`;
  const particleHost = document.createElement("div");
  particleHost.id = stageId;
  host.appendChild(particleHost);

  const container = await tsParticles.load({
    id: stageId,
    options: {
      fullScreen: { enable: false },
      background: { color: { value: "transparent" } },
      detectRetina: true,
      fpsLimit: 60,
      interactivity: {
        detectsOn: "window",
        events: {
          onClick: { enable: false },
          onHover: { enable: false },
          resize: { enable: true },
        },
      },
      particles: {
        color: { value: ["#29d9ff", "#eafdff", "#6b73ff"] },
        links: { enable: false },
        move: { enable: false },
        number: {
          value: simulation.nodes.length,
          density: { enable: false },
        },
        opacity: { value: { min: 0.18, max: 0.9 } },
        shape: { type: "circle" },
        size: { value: { min: 0.7, max: 3.2 } },
      },
      pauseOnBlur: true,
      pauseOnOutsideViewport: true,
      smooth: true,
    },
  });

  const overlay = document.createElement("canvas");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.pointerEvents = "none";
  host.appendChild(overlay);
  const context = overlay.getContext("2d");
  let width = 1;
  let height = 1;
  let ratio = 1;

  const resize = () => {
    const bounds = host.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = Math.round(width * ratio);
    overlay.height = Math.round(height * ratio);
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const project = (item, pointer) => {
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
      const particles = container.particles;
      const available = Math.min(particles.count, snapshot.nodes.length);
      for (let index = 0; index < available; index += 1) {
        const particle = particles.get(index);
        const node = snapshot.nodes[index];
        const point = project(node, pointer);
        particle.position.x = point.x;
        particle.position.y = point.y;
        if (particle.opacity) {
          particle.opacity.value = Math.max(0.04, node.alpha);
        }
        if (particle.size) {
          particle.size.value = Math.max(0.45, node.size * 0.28);
        }
      }

      const particlesCanvas = container.canvas.element;
      if (particlesCanvas) {
        const hue = snapshot.profile.violet * 34 - snapshot.profile.guard * 24;
        particlesCanvas.style.filter = `hue-rotate(${hue}deg) drop-shadow(0 0 3px rgba(41, 217, 255, 0.3))`;
      }

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";

      for (const edge of snapshot.edges) {
        const a = project(snapshot.nodes[edge.a], pointer);
        const b = project(snapshot.nodes[edge.b], pointer);
        const bendX = (a.x + b.x) * 0.5 + (b.y - a.y) * 0.035;
        const bendY = (a.y + b.y) * 0.5 - (b.x - a.x) * 0.035;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.quadraticCurveTo(bendX, bendY, b.x, b.y);
        context.strokeStyle = rgb(edge.color, edge.intensity * 0.44);
        context.lineWidth = edge.cross ? 0.55 : 0.8;
        context.stroke();
      }

      const scale = Math.min(width, height) * 0.37;
      const apertureRadius = snapshot.aperture.radius * scale;
      context.beginPath();
      context.arc(width / 2, height / 2, apertureRadius, 0, Math.PI * 2);
      context.strokeStyle = rgb(
        snapshot.aperture.color,
        snapshot.aperture.intensity * 0.62,
      );
      context.lineWidth = 1;
      context.stroke();
      context.beginPath();
      context.arc(width / 2, height / 2, apertureRadius * 1.46, 0, Math.PI * 2);
      context.strokeStyle = rgb(
        snapshot.aperture.color,
        snapshot.aperture.intensity * 0.2,
      );
      context.lineWidth = 0.7;
      context.stroke();

      for (const signal of snapshot.signals) {
        const point = project(signal, pointer);
        const radius = Math.max(0.8, signal.size * 0.32);
        const gradient = context.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius * 2.5,
        );
        gradient.addColorStop(0, rgb(signal.color, signal.alpha));
        gradient.addColorStop(0.3, rgb(signal.color, signal.alpha * 0.5));
        gradient.addColorStop(1, rgb(signal.color, 0));
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(point.x, point.y, radius * 2.5, 0, Math.PI * 2);
        context.fill();
      }

      context.globalCompositeOperation = "source-over";
    },
    destroy() {
      resizeObserver.disconnect();
      container.destroy();
    },
  };
}
