import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

// Сцен
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1026);
scene.fog = new THREE.Fog(0x0b1026, 8, 30);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
const DESKTOP_POS = new THREE.Vector3(0, 1.6, 4.5);
camera.position.copy(DESKTOP_POS);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.9, 0);
controls.update();

// Гэрэл, шал, од
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

// CanvasTexture туслах функцүүд
function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
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

function drawText(mesh, text, { w = 1024, h = 512, bg = '#1e293b', fg = '#ffffff', size = 52, border = '#a5b4fc' } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 6, 6, w - 12, h - 12, 40);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = `bold ${size}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapLines(ctx, text, w - 100);
  const lh = size * 1.22;
  const startY = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lh));
  if (mesh.material.map) mesh.material.map.dispose();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  mesh.material.map = tex;
  mesh.material.transparent = true;
  mesh.material.needsUpdate = true;
}

// Самбар, хүрээ, 4 товч
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

const COLORS = ['#3b82f6', '#a855f7', '#f59e0b', '#14b8a6'];
const buttons = [];
const pos = [[-1.15, 1.5], [1.15, 1.5], [-1.15, 0.8], [1.15, 0.8]];
pos.forEach(([x, y], i) => {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.62), new THREE.MeshBasicMaterial());
  b.position.set(x, y, 0);
  b.userData.index = i;
  scene.add(b);
  buttons.push(b);
});

drawText(board, 'Бүртгүүлээд тестээ эхлүүлнэ үү', { bg: '#1e1b4b', size: 50 });
buttons.forEach((b) => (b.visible = false));

// Тестийн төлөв
let questions = [];
let current = 0;
let score = 0;
let locked = false;
let attemptId = null;
let sessionId = null;
let started = false;
let currentRole = 'student';

const BTN = { w: 1024, h: 300, size: 42 };
const label = (q, i) => `${'ABCD'[i]}. ${q.options[i]}`;
const hudStudent = document.getElementById('hud-student');
const hudScore = document.getElementById('hud-score');
const dashboardLink = document.getElementById('dashboard-link');

function updateHud() {
  hudScore.textContent = `Оноо: ${score} / ${questions.length || 0}`;
}

function normalizeGroupCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function isValidGroupCode(code) {
  return /^M\.SW[A-Z0-9_-]+$/.test(code);
}

function showQuestion() {
  const q = questions[current];
  drawText(board, `${current + 1}/${questions.length}. ${q.q || q.text}`, { bg: '#1e1b4b', size: 46 });
  buttons.forEach((b, i) => {
    b.visible = true;
    b.scale.setScalar(1);
    drawText(b, label(q, i), { ...BTN, bg: COLORS[i] });
  });
  locked = false;
}

async function showResult() {
  buttons.forEach((b) => (b.visible = false));
  drawText(board, 'Үр дүн хадгалж байна...', { bg: '#1e293b', size: 48 });

  try {
    const res = await fetch('/api/quiz/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, sessionId }),
    });
    const data = await res.json();
    if (res.ok && typeof data.score === 'number') {
      score = data.score;
      updateHud();
    }
  } catch (err) {
    console.error('Finish error:', err);
  }

  drawText(board, `Тест дууслаа! Оноо: ${score} / ${questions.length}`, { bg: '#0f766e', size: 60 });
}

async function answer(index) {
  if (!started || locked || !attemptId) return;
  locked = true;

  const q = questions[current];
  drawText(buttons[index], label(q, index), { ...BTN, bg: '#475569' });

  try {
    const res = await fetch('/api/quiz/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId,
        questionId: q.id,
        optionIndex: index,
      }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Хариулт илгээхэд алдаа гарлаа');

    const ok = Boolean(result.isCorrect);
    const correctIdx = Number(result.correctIndex);
    if (typeof result.score === 'number') {
      score = result.score;
      updateHud();
    }

    drawText(buttons[index], label(q, index), { ...BTN, bg: ok ? '#16a34a' : '#dc2626' });
    if (!ok && correctIdx >= 0 && correctIdx < 4) {
      drawText(buttons[correctIdx], label(q, correctIdx), { ...BTN, bg: '#16a34a' });
    }
  } catch (err) {
    console.error(err);
    drawText(board, `Алдаа: ${err.message}`, { bg: '#7f1d1d', size: 44 });
  }

  setTimeout(() => {
    current++;
    if (current < questions.length) {
      showQuestion();
    } else {
      showResult();
    }
  }, 1500);
}

// Дүр сонгох (Оюутан / Багш)
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const roleStudentBtn = document.getElementById('role-student-btn');
const roleTeacherBtn = document.getElementById('role-teacher-btn');
const studentFields = document.getElementById('student-fields');
const teacherFields = document.getElementById('teacher-fields');
const classNameInput = document.getElementById('className');
const fullNameInput = document.getElementById('fullName');
const fullNameLabel = document.getElementById('fullName-label');
const startBtn = document.getElementById('start-btn');

function setRole(role) {
  currentRole = role;
  loginError.textContent = '';

  const isTeacher = role === 'teacher';
  roleStudentBtn.classList.toggle('active', !isTeacher);
  roleTeacherBtn.classList.toggle('active', isTeacher);

  studentFields.classList.toggle('hidden', isTeacher);
  teacherFields.classList.toggle('hidden', !isTeacher);

  classNameInput.required = !isTeacher;
  if (isTeacher) {
    fullNameLabel.textContent = 'Багшийн овог, нэр *';
    fullNameInput.placeholder = 'Х. Насанбуян';
    startBtn.textContent = 'Дашбоард руу орох';
  } else {
    fullNameLabel.textContent = 'Овог, нэр *';
    fullNameInput.placeholder = 'Ш. Отгонжаргал';
    startBtn.textContent = 'Шалгалт эхлүүлэх';
  }
}

roleStudentBtn.addEventListener('click', () => setRole('student'));
roleTeacherBtn.addEventListener('click', () => setRole('teacher'));

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const fullName = fullNameInput.value.trim();
  if (!fullName) {
    loginError.textContent = 'Овог, нэрийг оруулна уу.';
    return;
  }

  if (currentRole === 'teacher') {
    sessionStorage.setItem('quizTeacherAuth', JSON.stringify({ fullName, at: Date.now() }));
    window.location.href = '/dashboard.html';
    return;
  }

  const className = normalizeGroupCode(classNameInput.value);
  const username = document.getElementById('username').value.trim();
  const pin = document.getElementById('pin').value.trim();

  if (!isValidGroupCode(className)) {
    loginError.textContent = 'Бүлгийн код заавал M.SW...-ээр эхлэх ёстой (жишээ: M.SW206).';
    return;
  }

  const payload = { fullName, className, username, pin };

  try {
    const [qRes, sRes] = await Promise.all([
      fetch('/api/questions'),
      fetch('/api/quiz/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ]);

    const qData = await qRes.json();
    const sData = await sRes.json();

    if (!sRes.ok) throw new Error(sData.error || 'Бүртгэхэд алдаа гарлаа');
    if (!qRes.ok || !Array.isArray(qData) || qData.length === 0) {
      throw new Error('quiz_questions хүснэгтэд идэвхтэй асуулт алга.');
    }

    questions = qData;
    attemptId = sData.attemptId;
    sessionId = sData.sessionId;
    current = 0;
    score = 0;
    started = true;

    hudStudent.textContent = `Оюутан: ${sData.student.fullName} (${sData.student.className})`;
    updateHud();
    loginOverlay.style.display = 'none';
    if (dashboardLink) dashboardLink.classList.add('hidden');
    showQuestion();
  } catch (err) {
    loginError.textContent = err.message;
  }
});

// Raycaster: хулгана + VR контроллер
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tempMatrix = new THREE.Matrix4();
const visibleButtons = () => buttons.filter((b) => b.visible);

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(visibleButtons())[0];
  if (hit) answer(hit.object.userData.index);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting) return;
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(visibleButtons())[0];
  buttons.forEach((b) => b.scale.setScalar(hit && hit.object === b ? 1.06 : 1));
  renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
});

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

renderer.setAnimationLoop((t) => {
  stars.rotation.y = t * 0.00001;
  frame.material.color.setHSL(0.72 + Math.sin(t * 0.001) * 0.05, 0.8, 0.6);
  renderer.render(scene, camera);
});
