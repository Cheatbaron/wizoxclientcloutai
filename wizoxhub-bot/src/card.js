import { createCanvas, loadImage } from "@napi-rs/canvas";

const W = 1024;
const H = 380;

// Same random-looking layout every time, so cards don't flicker between joins.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function background(ctx) {
  ctx.fillStyle = "#050914";
  ctx.fillRect(0, 0, W, H);

  // Blue nebula on the right, fading into the dark left side.
  const blobs = [
    [W * 0.8, H * 0.5, 460, "rgba(47,123,255,0.85)"],
    [W * 1.0, H * 0.25, 300, "rgba(111,183,255,0.6)"],
    [W * 0.62, H * 0.85, 300, "rgba(40,90,220,0.5)"],
    [W * 0.15, H * 0.5, 260, "rgba(30,60,160,0.25)"],
  ];
  for (const [x, y, r, c] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(5,9,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Soft light streaks across the card.
  const rand = seeded(42);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    const y = H * (0.25 + rand() * 0.5);
    const g = ctx.createLinearGradient(0, y, W, y);
    g.addColorStop(0, "rgba(111,183,255,0)");
    g.addColorStop(0.7, `rgba(111,183,255,${0.05 + rand() * 0.08})`);
    g.addColorStop(1, "rgba(111,183,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 1 - rand() * 3, W, 2 + rand() * 6);
  }

  // Stars.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, rand() * 1.3 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function rings(ctx, cx, cy, r) {
  for (const [extra, alpha] of [[22, 0.35], [50, 0.18], [86, 0.08]]) {
    ctx.strokeStyle = `rgba(160,200,255,${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + extra, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Two little glowing dots on the rings.
  for (const [extra, angle] of [[50, -0.35], [86, 0.55]]) {
    const x = cx + Math.cos(angle) * (r + extra);
    const y = cy + Math.sin(angle) * (r + extra);
    ctx.shadowColor = "#6fb7ff";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#d8ecff";
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
  const r = 92;
  rings(ctx, cx, cy, r);

  // Glow behind the avatar.
  const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.9);
  glow.addColorStop(0, "rgba(111,183,255,0.45)");
  glow.addColorStop(1, "rgba(111,183,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Avatar in a circle with a white-blue border.
  const img = await loadImage(avatar);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  const border = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  border.addColorStop(0, "#d8ecff");
  border.addColorStop(1, "#2f7bff");
  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.stroke();

  // Rounded corners so it sits nicely inside the Discord embed.
  const out = createCanvas(W, H);
  const o = out.getContext("2d");
  o.beginPath();
  o.roundRect(0, 0, W, H, 24);
  o.clip();
  o.drawImage(canvas, 0, 0);
  return out.encode("png");
}
