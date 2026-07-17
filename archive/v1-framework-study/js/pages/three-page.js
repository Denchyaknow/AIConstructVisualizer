import { mountLab } from "../lab.js";
import { createThreeRenderer } from "../renderers/three-renderer.js";

mountLab({
  engineKey: "three",
  engineName: "Three.js · r185",
  renderMode: "3D shader point field",
  createRenderer: createThreeRenderer,
});
