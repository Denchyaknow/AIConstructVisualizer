import { Asterism, EFFECTS, STATE_PROFILES } from "./asterism-core.js";

const FRAMEWORKS = [
  { key: "three", label: "Three.js", page: "three.html" },
  { key: "pixi", label: "PixiJS", page: "pixi.html" },
  { key: "tsparticles", label: "tsParticles", page: "tsparticles.html" },
  { key: "babylon", label: "Babylon.js", page: "babylon.html" },
  { key: "regl", label: "regl", page: "regl.html" },
];

function buttonMarkup(items, group, activeName = "") {
  return Object.entries(items)
    .map(([key, value]) => {
      const active = key === activeName;
      return `
        <button
          class="control-button ${active ? "is-active" : ""}"
          type="button"
          data-${group}="${key}"
          aria-pressed="${active}"
        >
          <span class="control-button__signal" aria-hidden="true"></span>
          <span>${value.label}</span>
        </button>
      `;
    })
    .join("");
}

function frameworkNav(activeKey) {
  return FRAMEWORKS.map(
    (framework) => `
      <a
        class="engine-link ${framework.key === activeKey ? "is-active" : ""}"
        href="./${framework.page}"
        ${framework.key === activeKey ? 'aria-current="page"' : ""}
      >${framework.label}</a>
    `,
  ).join("");
}

function shellMarkup(config) {
  return `
    <div class="lab-shell">
      <header class="topbar">
        <a class="identity" href="./index.html" aria-label="Asterism framework index">
          <span class="identity__mark" aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
          <span>
            <strong>The Asterism</strong>
            <small>AI presence study</small>
          </span>
        </a>
        <div class="topbar__status">
          <span class="live-dot" aria-hidden="true"></span>
          <span data-status>Field online</span>
        </div>
      </header>

      <main class="lab-layout">
        <section class="stage-panel" aria-label="Interactive Asterism visualization">
          <div class="stage" data-stage>
            <div class="stage__canvas" data-canvas-host></div>
            <div class="stage__wash" aria-hidden="true"></div>

            <div class="stage__label">
              <span class="eyebrow">Current coherence</span>
              <strong data-state-label>Quiet</strong>
            </div>

            <div class="stage__engine">
              <span>${config.engineName}</span>
              <small>${config.renderMode}</small>
            </div>

            <div class="stage__metrics" aria-label="Live field metrics">
              <span><b data-energy>18</b><small>energy</small></span>
              <span><b data-coherence>40</b><small>coherence</small></span>
              <span><b data-links>0</b><small>links</small></span>
            </div>

            <p class="stage__hint">Move through the field</p>
          </div>

          <div class="state-readout">
            <span class="state-readout__line" aria-hidden="true"></span>
            <p data-state-note>${STATE_PROFILES.quiet.note}</p>
          </div>
        </section>

        <aside class="control-deck" aria-label="Asterism controls">
          <div class="control-deck__intro">
            <span class="eyebrow">Shape the presence</span>
            <h1>What is the field doing?</h1>
            <p>States change its underlying behavior. Events pass through without replacing it.</p>
          </div>

          <section class="control-group" aria-labelledby="states-heading">
            <div class="control-group__heading">
              <h2 id="states-heading">State</h2>
              <span>blended</span>
            </div>
            <div class="control-grid control-grid--states">
              ${buttonMarkup(STATE_PROFILES, "state", "quiet")}
            </div>
          </section>

          <section class="control-group" aria-labelledby="events-heading">
            <div class="control-group__heading">
              <h2 id="events-heading">Event</h2>
              <span>one-shot</span>
            </div>
            <div class="control-grid control-grid--effects">
              ${buttonMarkup(EFFECTS, "effect")}
            </div>
          </section>

          <div class="engine-switcher">
            <span class="eyebrow">Renderer</span>
            <nav aria-label="Framework pages">${frameworkNav(config.engineKey)}</nav>
          </div>
        </aside>
      </main>

      <div class="sr-only" role="status" aria-live="polite" data-announcer></div>
    </div>
  `;
}

export async function mountLab(config) {
  const root = document.querySelector("#app");
  if (!root) {
    throw new Error("AIBrain requires an #app mount point.");
  }

  root.innerHTML = shellMarkup(config);

  const host = root.querySelector("[data-canvas-host]");
  const stage = root.querySelector("[data-stage]");
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const compact = window.matchMedia("(max-width: 720px)").matches;
  const simulation = new Asterism({
    nodeCount: compact ? 390 : 620,
    reducedMotion: prefersReducedMotion.matches,
  });

  let renderer;
  try {
    renderer = await config.createRenderer(host, simulation);
    root.querySelector("[data-status]").textContent = "Field online";
  } catch (error) {
    console.error(error);
    root.querySelector("[data-status]").textContent = "Renderer unavailable";
    host.innerHTML = `
      <div class="stage-error">
        <strong>${config.engineName} could not start.</strong>
        <span>Check the network connection and WebGL support, then reload.</span>
      </div>
    `;
    return;
  }

  const stateLabel = root.querySelector("[data-state-label]");
  const stateNote = root.querySelector("[data-state-note]");
  const announcer = root.querySelector("[data-announcer]");
  const energy = root.querySelector("[data-energy]");
  const coherence = root.querySelector("[data-coherence]");
  const links = root.querySelector("[data-links]");
  let pointerX = 0;
  let pointerY = 0;
  let renderedPointerX = 0;
  let renderedPointerY = 0;
  let lastTime = performance.now();
  let lastMetricsUpdate = 0;
  let frameHandle = 0;

  function selectState(name, announce = true) {
    simulation.setState(name);
    const profile = STATE_PROFILES[name];
    stateLabel.textContent = profile.label;
    stateNote.textContent = profile.note;
    root.querySelectorAll("[data-state]").forEach((button) => {
      const active = button.dataset.state === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (announce) {
      announcer.textContent = `${profile.label} state active.`;
    }
  }

  function triggerEffect(name, announce = true) {
    simulation.trigger(name);
    const button = root.querySelector(`[data-effect="${name}"]`);
    if (button) {
      button.classList.remove("is-firing");
      requestAnimationFrame(() => button.classList.add("is-firing"));
      window.setTimeout(() => button.classList.remove("is-firing"), 700);
    }
    if (announce) {
      announcer.textContent = `${EFFECTS[name].label} event triggered.`;
    }
  }

  root.querySelectorAll("[data-state]").forEach((button) => {
    button.addEventListener("click", () => selectState(button.dataset.state));
  });

  root.querySelectorAll("[data-effect]").forEach((button) => {
    button.addEventListener("click", () => triggerEffect(button.dataset.effect));
  });

  stage.addEventListener("pointermove", (event) => {
    const bounds = stage.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointerY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
  });
  stage.addEventListener("pointerleave", () => {
    pointerX = 0;
    pointerY = 0;
  });

  const motionListener = (event) => simulation.setReducedMotion(event.matches);
  prefersReducedMotion.addEventListener("change", motionListener);

  function frame(now) {
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    renderedPointerX += (pointerX - renderedPointerX) * 0.045;
    renderedPointerY += (pointerY - renderedPointerY) * 0.045;
    const snapshot = simulation.update(delta);
    renderer.render(snapshot, {
      x: renderedPointerX,
      y: renderedPointerY,
    });

    if (now - lastMetricsUpdate > 120) {
      const metrics = simulation.metrics();
      energy.textContent = String(Math.round(metrics.energy * 100));
      coherence.textContent = String(Math.round(metrics.coherence * 100));
      links.textContent = String(metrics.activeConnections);
      lastMetricsUpdate = now;
    }
    frameHandle = requestAnimationFrame(frame);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frameHandle);
    } else {
      lastTime = performance.now();
      frameHandle = requestAnimationFrame(frame);
    }
  });

  window.AIBrain = {
    setState: selectState,
    trigger: triggerEffect,
    getState: () => simulation.state,
    getMetrics: () => simulation.metrics(),
    states: Object.keys(STATE_PROFILES),
    effects: Object.keys(EFFECTS),
  };

  frameHandle = requestAnimationFrame(frame);
  if (!prefersReducedMotion.matches) {
    window.setTimeout(
      () =>
        simulation.trigger("reconstruct", {
          duration: 2.45,
          strength: 0.52,
        }),
      420,
    );
  }
}
