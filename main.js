/**
 * Basic point type stored in world/image pixel coordinates.
 * @typedef {{x: number, y: number}} Point
 */

const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

/** @type {HTMLImageElement} */
const fieldImage = new Image();
// Attempt to load a local field.png, but fall back to a generated placeholder if it is missing.
fieldImage.src = 'field.png';
fieldImage.onload = () => {
  resizeCanvas();
  draw();
};
fieldImage.onerror = () => {
  const placeholder = document.createElement('canvas');
  placeholder.width = 1400;
  placeholder.height = 800;
  const pctx = placeholder.getContext('2d');
  const grad = pctx.createLinearGradient(0, 0, 0, placeholder.height);
  grad.addColorStop(0, '#1e7039');
  grad.addColorStop(1, '#0f3b1f');
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, placeholder.width, placeholder.height);
  pctx.strokeStyle = 'rgba(255,255,255,0.45)';
  pctx.lineWidth = 4;
  // draw simple pitch lines
  const margin = 80;
  pctx.strokeRect(margin, margin, placeholder.width - margin * 2, placeholder.height - margin * 2);
  pctx.beginPath();
  pctx.moveTo(placeholder.width / 2, margin);
  pctx.lineTo(placeholder.width / 2, placeholder.height - margin);
  pctx.stroke();
  fieldImage.src = placeholder.toDataURL('image/png');
};

let zoom = 1;
let camX = 0;
let camY = 0;
let metersPerPixel = null; // set after calibration
/** @type {'idle' | 'calibrate' | 'measure'} */
let mode = 'idle';
/** @type {Point[]} */
let tempPoints = [];
/** @type {Point[][]} */
let measureLines = [];
/** @type {Point[]} */
let currentLine = [];

let isPanning = false;
let spaceHeld = false;
let panStart = { x: 0, y: 0 };
let panCamStart = { x: 0, y: 0 };

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

window.addEventListener('resize', resizeCanvas);

canvas.addEventListener('click', handleClick);
canvas.addEventListener('wheel', handleWheel, { passive: false });
canvas.addEventListener('mousedown', handlePanStart);
canvas.addEventListener('mousemove', handlePanMove);
window.addEventListener('mouseup', handlePanEnd);
window.addEventListener('mouseleave', handlePanEnd);
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

function handleKeyDown(ev) {
  if (ev.code === 'Space') {
    spaceHeld = true;
  }
  if (ev.key === 'c' || ev.key === 'C') {
    mode = 'calibrate';
    tempPoints = [];
    draw();
  }
  if (ev.key === 'm' || ev.key === 'M') {
    mode = 'measure';
    currentLine = [];
    draw();
  }
  if (ev.key === 'Enter') {
    if (mode === 'measure' && currentLine.length >= 2) {
      measureLines.push([...currentLine]);
      currentLine = [];
      draw();
    }
  }
  if (ev.key === 'Escape') {
    currentLine = [];
    draw();
  }
  if (ev.key === 'Backspace') {
    if (currentLine.length > 0) {
      currentLine.pop();
      draw();
    }
  }
}

function handleKeyUp(ev) {
  if (ev.code === 'Space') {
    spaceHeld = false;
  }
}

function handleClick(ev) {
  const rect = canvas.getBoundingClientRect();
  const screenPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  const worldPoint = screenToWorld(screenPoint.x, screenPoint.y);

  if (mode === 'calibrate') {
    tempPoints.push(worldPoint);
    if (tempPoints.length === 2) {
      const dPx = pixelDistance(tempPoints[0], tempPoints[1]);
      const TEN_YARDS_METERS = 9.144;
      metersPerPixel = TEN_YARDS_METERS / dPx; // calibration: meters per image pixel
      tempPoints = [];
      mode = 'idle';
    }
    draw();
    return;
  }

  if (mode === 'measure') {
    currentLine.push(worldPoint);
    draw();
  }
}

function handleWheel(ev) {
  ev.preventDefault();
  if (!fieldImage.complete) return;
  const rect = canvas.getBoundingClientRect();
  const mouseX = ev.clientX - rect.left;
  const mouseY = ev.clientY - rect.top;
  const worldBefore = screenToWorld(mouseX, mouseY);

  const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
  zoom = Math.min(8, Math.max(0.25, zoom * zoomFactor));
  const worldAfter = screenToWorld(mouseX, mouseY);
  // shift camera so the point under the cursor stays fixed in screen space
  camX += worldBefore.x - worldAfter.x;
  camY += worldBefore.y - worldAfter.y;
  draw();
}

function handlePanStart(ev) {
  if (ev.button === 1 || (ev.button === 0 && spaceHeld)) {
    isPanning = true;
    const rect = canvas.getBoundingClientRect();
    panStart = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    panCamStart = { x: camX, y: camY };
    canvas.style.cursor = 'grab';
  }
}

function handlePanMove(ev) {
  if (!isPanning) return;
  const rect = canvas.getBoundingClientRect();
  const current = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  const dx = current.x - panStart.x;
  const dy = current.y - panStart.y;
  camX = panCamStart.x - dx / zoom;
  camY = panCamStart.y - dy / zoom;
  draw();
}

function handlePanEnd() {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = 'crosshair';
  }
}

function worldToScreen(wx, wy) {
  return {
    x: (wx - camX) * zoom,
    y: (wy - camY) * zoom,
  };
}

function screenToWorld(sx, sy) {
  return {
    x: sx / zoom + camX,
    y: sy / zoom + camY,
  };
}

function pixelDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function drawGrid() {
  const spacing = 100; // world pixels
  const { width, height } = canvas;
  const startX = Math.floor(camX / spacing) * spacing;
  const startY = Math.floor(camY / spacing) * spacing;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = startX; x < camX + width / zoom; x += spacing) {
    const sx = worldToScreen(x, 0).x;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }
  for (let y = startY; y < camY + height / zoom; y += spacing) {
    const sy = worldToScreen(0, y).y;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLine(points, color = '#00e0ff') {
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const first = worldToScreen(points[0].x, points[0].y);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToScreen(points[i].x, points[i].y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawDistanceLabel(points) {
  if (!metersPerPixel || points.length < 2) return;
  let totalPx = 0;
  for (let i = 1; i < points.length; i++) {
    totalPx += pixelDistance(points[i - 1], points[i]);
  }
  const totalMeters = totalPx * metersPerPixel;
  const totalYards = totalMeters / 0.9144;
  const last = worldToScreen(points[points.length - 1].x, points[points.length - 1].y);
  ctx.save();
  ctx.fillStyle = 'white';
  ctx.font = '14px sans-serif';
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 4;
  const text = `${totalMeters.toFixed(2)} m (${totalYards.toFixed(2)} yd)`;
  ctx.strokeText(text, last.x + 8, last.y - 8);
  ctx.fillText(text, last.x + 8, last.y - 8);
  ctx.restore();
}

function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (fieldImage.complete && fieldImage.naturalWidth > 0) {
    const destX = -camX * zoom;
    const destY = -camY * zoom;
    const destW = fieldImage.width * zoom;
    const destH = fieldImage.height * zoom;
    ctx.drawImage(fieldImage, destX, destY, destW, destH);
  }

  drawGrid();

  measureLines.forEach((line) => drawLine(line, '#ffd166'));
  drawLine(currentLine, '#00e0ff');
  drawDistanceLabel(currentLine);

  const calibratedText = metersPerPixel
    ? `Calibrated: ${metersPerPixel.toFixed(4)} m/px`
    : 'Not calibrated';
  const modeText = `Mode: ${mode}`;
  statusEl.textContent = `${modeText} | ${calibratedText}`;
}

// Initialize canvas dimensions immediately in case the image loads instantly
resizeCanvas();
