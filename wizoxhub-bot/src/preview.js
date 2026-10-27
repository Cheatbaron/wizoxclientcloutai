// Renders a sample card to preview.png without connecting to Discord.
// Usage: npm run preview [path-to-avatar.png]
import { writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { welcomeCard } from "./card.js";

let avatar = process.argv[2];
if (!avatar) {
  // Plain stand-in avatar so the preview works offline.
  const c = createCanvas(256, 256);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, "#ff7a6b");
  g.addColorStop(1, "#ff2e43");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 120px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("W", 128, 136);
  avatar = await c.encode("png");
}

await writeFile("preview.png", await welcomeCard(avatar));
console.log("Saved preview.png");
