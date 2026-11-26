export type ReceivePosterCopy = {
  posterEyebrow: string;
  addressPosterTitle: string;
  posterNetworkNote: string;
  previewPosterWarning: string;
  poweredBy: string;
};

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function wrappedLines(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || context.measureText(next).width <= maxWidth) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws a downloadable poster from the same QR canvas shown on Receive. */
export function drawReceivePoster(
  qr: HTMLCanvasElement,
  address: string,
  username: string | null,
  preview: boolean,
  copy: ReceivePosterCopy,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);

  const dark = document.documentElement.dataset.theme === "dark";
  const ink = dark ? "#fff" : "#111827";
  const soft = dark ? "#a3a3a3" : "#586579";
  const background = context.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, "#2546c8");
  background.addColorStop(1, "#365eff");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff14";
  context.beginPath(); context.arc(890, 450, 320, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(170, 1450, 420, 0, Math.PI * 2); context.fill();

  context.fillStyle = "#fff";
  context.textAlign = "left";
  context.font = "700 64px system-ui, sans-serif";
  context.fillText("Salapi", 90, 150);
  context.textAlign = "center";
  context.font = "600 66px system-ui, sans-serif";
  for (const [index, line] of wrappedLines(context, copy.posterEyebrow, 900).entries())
    context.fillText(line, 540, 266 + index * 78);

  const x = 90, y = 390, width = 900, height = 1290;
  context.shadowColor = "#07143b55";
  context.shadowBlur = 54;
  context.shadowOffsetY = 18;
  context.fillStyle = dark ? "#171717" : "#fff";
  roundedRect(context, x, y, width, height, 54);
  context.fill();
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  const qrSize = 680;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = y + 80;
  context.fillStyle = "#fff";
  roundedRect(context, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 28);
  context.fill();
  context.drawImage(qr, qrX, qrY, qrSize, qrSize);

  context.fillStyle = ink;
  context.textAlign = "center";
  context.font = "650 58px system-ui, sans-serif";
  context.fillText(username ? `@${username}` : copy.addressPosterTitle, 540, y + 866);
  context.fillStyle = soft;
  context.font = "500 28px ui-monospace, SFMono-Regular, Menlo, monospace";
  const midpoint = Math.ceil(address.length / 2);
  context.fillText(address.slice(0, midpoint), 540, y + 940);
  context.fillText(address.slice(midpoint), 540, y + 986);
  context.font = "400 32px system-ui, sans-serif";
  const note = preview ? copy.previewPosterWarning : copy.posterNetworkNote;
  for (const [index, line] of wrappedLines(context, note, 760).entries())
    context.fillText(line, 540, y + 1060 + index * 44);
  context.fillStyle = soft;
  context.font = "500 25px system-ui, sans-serif";
  context.fillText(copy.poweredBy, 540, y + 1210);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
