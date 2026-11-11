import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { questions } from './questions.js';

//Сцен 
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1026);
scene.fog = new THREE.Fog(0x0b1026, 8, 30);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
const rig = new THREE.Group();          // VR дотор хэрэглэгчийн байрлал
rig.add(camera);
scene.add(rig);
const DESKTOP_POS = new THREE.Vector3(0, 1.6, 4.5);
camera.position.copy(DESKTOP_POS);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer)); // "ENTER VR" товч

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.9, 0);
controls.update();

//Гэрэл, шал, од 
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x222244, 1.3));
const glow = new THREE.PointLight(0x7c3aed, 30, 12);
glow.position.set(0, 3, 2);
scene.add(glow);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.MeshStandardMaterial({ color: 0x111a3a, roughness: 0.8 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const grid = new THREE.GridHelper(18, 36, 0x6366f1, 0x27305f);
grid.position.y = 0.01;
scene.add(grid);

const starPos = [];
for (let i = 0; i < 700; i++) {
  const r = 18 + Math.random() * 12;
  const a = Math.random() * Math.PI * 2;
  const h = Math.random() * 14 + 1;
  starPos.push(Math.cos(a) * r, h, Math.sin(a) * r);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 }));
scene.add(stars);

// ---------- CanvasTexture ----------
function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(mesh, text, { w = 1024, h = 512, bg = '#1e293b', fg = '#ffffff', size = 56, border = '#a5b4fc' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 6, 6, w - 12, h - 12, 40);
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = 8; ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = `bold ${size}px Arial`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrapLines(ctx, text, w - 100);
  const lh = size * 1.25;
  const startY = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lh));
  if (mesh.material.map) mesh.material.map.dispose();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  mesh.material.map = tex;
  mesh.material.transparent = true;
  mesh.material.needsUpdate = true;
}

//Самбар, хүрээ, 4 товч 
const BOARD_Y = 2.8;
const frame = new THREE.Mesh(
  new THREE.PlaneGeometry(4.5, 2.4),
  new THREE.MeshBasicMaterial({ color: 0x8b5cf6 })
);
frame.position.set(0, BOARD_Y, -0.03);
scene.add(frame);

const board = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.2), new THREE.MeshBasicMaterial());
board.position.set(0, BOARD_Y, 0);
scene.add(board);

const COLORS = ['#3b82f6', '#a855f7', '#f59e0b', '#14b8a6']; // A B C D
const buttons = [];
const pos = [[-1.15, 1.5], [1.15, 1.5], [-1.15, 0.8], [1.15, 0.8]];
pos.forEach(([x, y], i) => {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.62), new THREE.MeshBasicMaterial());
  b.position.set(x, y, 0);
  b.userData.index = i;
  scene.add(b);
  buttons.push(b);
});

//Тестийн төлөв 
let current = 0, score = 0, locked = false;
const BTN = { w: 1024, h: 300, size: 44 };
const label = (q, i) => `${'ABCD'[i]}. ${q.options[i]}`;

function showQuestion() {
  const q = questions[current];
  drawText(board, `${current + 1}/${questions.length}. ${q.q}`, { bg: '#1e1b4b' });
  buttons.forEach((b, i) => {
    b.visible = true;
    drawText(b, label(q, i), { ...BTN, bg: COLORS[i] });
  });
  locked = false;
}

function showResult() {
  drawText(board, `Тест дууслаа! Оноо: ${score} / ${questions.length}`, { bg: '#0f766e', size: 64 });
  buttons.forEach(b => (b.visible = false));
}

function answer(index) {
  if (locked) return;
  locked = true;
  const q = questions[current];
  const ok = index === q.correct;
  if (ok) score++;
  drawText(buttons[index], label(q, index), { ...BTN, bg: ok ? '#16a34a' : '#dc2626' });
  if (!ok) drawText(buttons[q.correct], label(q, q.correct), { ...BTN, bg: '#16a34a' });
  setTimeout(() => {
    current++;
    current < questions.length ? showQuestion() : showResult();
  }, 1500);
}

//Raycaster: хулгана + VR контроллер
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tempMatrix = new THREE.Matrix4();
const visibleButtons = () => buttons.filter(b => b.visible);

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(visibleButtons())[0];
  if (hit) answer(hit.object.userData.index);
});

// Хулганаар заахад товч томрох
renderer.domElement.addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting) return;
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(visibleButtons())[0];
  buttons.forEach(b => b.scale.setScalar(hit && hit.object === b ? 1.06 : 1));
  renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
});

// VR контроллерууд
function setupController(i) {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]),
    new THREE.LineBasicMaterial({ color: 0x38bdf8 })
  );
  line.name = 'ray';
  c.add(line);
  c.addEventListener('selectstart', () => {
    tempMatrix.identity().extractRotation(c.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    const hit = raycaster.intersectObjects(visibleButtons())[0];
    if (hit) answer(hit.object.userData.index);
  });
  rig.add(c);
}
setupController(0);
setupController(1);

// VR горимд орох/гарахад байрлал тохируулах
renderer.xr.addEventListener('sessionstart', () => {
  rig.position.set(0, 0, 3.8);
  controls.enabled = false;
});
renderer.xr.addEventListener('sessionend', () => {
  rig.position.set(0, 0, 0);
  camera.position.copy(DESKTOP_POS);
  controls.enabled = true;
  controls.update();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

//Эхлүүлэх
showQuestion();
renderer.setAnimationLoop((t) => {
  stars.rotation.y = t * 0.00001;
  frame.material.color.setHSL(0.72 + Math.sin(t * 0.001) * 0.05, 0.8, 0.6); // хүрээ гэрэлтэнэ
  renderer.render(scene, camera);
});
