import { createCanvas, loadImage } from "@napi-rs/canvas";

const W = 1200;
const H = 440;

// Same random-looking layout every time, so cards don't flicker between joins.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function background(ctx) {
  ctx.fillStyle = "#0c0405";
  ctx.fillRect(0, 0, W, H);

  // Red nebula on the right, fading into the dark left side.
  const blobs = [
    [W * 0.8, H * 0.5, 520, "rgba(255,46,67,0.75)"],
    [W * 1.0, H * 0.25, 340, "rgba(255,110,90,0.5)"],
    [W * 0.62, H * 0.85, 340, "rgba(170,20,40,0.55)"],
    [W * 0.15, H * 0.5, 300, "rgba(140,15,30,0.25)"],
  ];
  for (const [x, y, r, c] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(12,4,5,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Soft light streaks across the card.
  const rand = seeded(42);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    const y = H * (0.25 + rand() * 0.5);
    const g = ctx.createLinearGradient(0, y, W, y);
    g.addColorStop(0, "rgba(255,120,120,0)");
    g.addColorStop(0.7, `rgba(255,120,120,${0.05 + rand() * 0.08})`);
    g.addColorStop(1, "rgba(255,120,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 1 - rand() * 3, W, 2 + rand() * 6);
  }

  // Stars.
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, rand() * 1.3 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function rings(ctx, cx, cy, r) {
  for (const [extra, alpha] of [[26, 0.35], [60, 0.18], [100, 0.08]]) {
    ctx.strokeStyle = `rgba(255,170,170,${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + extra, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Two little glowing dots on the rings.
  for (const [extra, angle] of [[60, -0.35], [100, 0.55]]) {
    const x = cx + Math.cos(angle) * (r + extra);
    const y = cy + Math.sin(angle) * (r + extra);
    ctx.shadowColor = "#ff2e43";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffe0e0";
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

/**
 * Draws the welcome card.
 * @param {Buffer|string} avatar  PNG/JPEG buffer or URL of the member's avatar
 * @returns {Promise<Buffer>} PNG image
 */
export async function welcomeCard(avatar) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  background(ctx);

  const cx = W / 2;
  const cy = H / 2;
  const r = 128;
  rings(ctx, cx, cy, r);

  // Glow behind the avatar.
  const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.9);
  glow.addColorStop(0, "rgba(255,60,80,0.5)");
  glow.addColorStop(1, "rgba(255,60,80,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Avatar in a circle with a white-red border.
  const img = await loadImage(avatar);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  const border = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  border.addColorStop(0, "#ffe0e0");
  border.addColorStop(1, "#ff2e43");
  ctx.strokeStyle = border;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Rounded corners so it sits nicely inside the Discord embed.
  const out = createCanvas(W, H);
  const o = out.getContext("2d");
  o.beginPath();
  o.roundRect(0, 0, W, H, 28);
  o.clip();
  o.drawImage(canvas, 0, 0);
  return out.encode("png");
}
