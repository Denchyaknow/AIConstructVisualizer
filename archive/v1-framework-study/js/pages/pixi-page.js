import { mountLab } from "../lab.js";
import { createPixiRenderer } from "../renderers/pixi-renderer.js";

mountLab({
  engineKey: "pixi",
  engineName: "PixiJS · 8.19",
  renderMode: "2D holographic projection",
  createRenderer: createPixiRenderer,
});
