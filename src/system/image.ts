import type {
  AppConfig,
  CropBounds,
  ProcessedImage,
  ScreenInfo,
  ZoomResult,
} from '../types.js';

function generateGridSvg(
  width: number,
  height: number,
  cols = 10,
  rows = 8,
): Buffer {
  const cellW = width / cols;
  const cellH = height / rows;
  const lines: string[] = [];

  for (let i = 1; i < cols; i++) {
    const x = Math.round(cellW * i);
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="rgba(255,0,0,0.25)" stroke-width="1"/>`,
    );
  }
  for (let i = 1; i < rows; i++) {
    const y = Math.round(cellH * i);
    lines.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgba(255,0,0,0.25)" stroke-width="1"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines.join('')}</svg>`;
  return Buffer.from(svg);
}

export async function processScreenshot(
  buffer: Buffer,
  screenInfo: ScreenInfo,
  config: AppConfig,
): Promise<ProcessedImage> {
  const sharp = (await import('sharp')).default;
  const maxDim = config.maxImageDimension;

  // Resize to logical resolution
  let img = sharp(buffer).resize(
    screenInfo.logicalWidth,
    screenInfo.logicalHeight,
  );

  // Get current dimensions
  let w = screenInfo.logicalWidth;
  let h = screenInfo.logicalHeight;

  // Limit longest edge
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    img = sharp(await img.toBuffer()).resize(w, h);
  }

  // Overlay grid
  const gridSvg = generateGridSvg(w, h);
  img = sharp(await img.toBuffer()).composite([
    { input: gridSvg, top: 0, left: 0 },
  ]);

  // Compress as JPEG
  const outBuf = await img.jpeg({ quality: 80 }).toBuffer();

  return {
    buffer: outBuf,
    base64: outBuf.toString('base64'),
    displayWidth: w,
    displayHeight: h,
  };
}

export async function cropAndEnlarge(
  buffer: Buffer,
  screenInfo: ScreenInfo,
  config: AppConfig,
  relX: number,
  relY: number,
): Promise<ZoomResult> {
  const sharp = (await import('sharp')).default;
  const padding = config.zoomPadding;

  // First resize to logical resolution
  const logBuf = await sharp(buffer)
    .resize(screenInfo.logicalWidth, screenInfo.logicalHeight)
    .toBuffer();

  const logW = screenInfo.logicalWidth;
  const logH = screenInfo.logicalHeight;

  // Calculate crop region centered on (relX, relY)
  const centerX = Math.round(relX * logW);
  const centerY = Math.round(relY * logH);

  const left = Math.max(0, centerX - padding);
  const top = Math.max(0, centerY - padding);
  let cropW = padding * 2;
  let cropH = padding * 2;

  // Clamp to image bounds
  if (left + cropW > logW) cropW = logW - left;
  if (top + cropH > logH) cropH = logH - top;

  const cropBounds: CropBounds = {
    left,
    top,
    width: cropW,
    height: cropH,
  };

  // Extract and enlarge
  const maxDim = config.maxImageDimension;
  const scale = maxDim / Math.max(cropW, cropH);
  const outW = Math.round(cropW * scale);
  const outH = Math.round(cropH * scale);

  let img = sharp(logBuf).extract({
    left,
    top,
    width: cropW,
    height: cropH,
  });
  img = sharp(await img.toBuffer()).resize(outW, outH);

  // Overlay grid
  const gridSvg = generateGridSvg(outW, outH);
  img = sharp(await img.toBuffer()).composite([
    { input: gridSvg, top: 0, left: 0 },
  ]);

  const outBuf = await img.jpeg({ quality: 80 }).toBuffer();

  return {
    image: {
      buffer: outBuf,
      base64: outBuf.toString('base64'),
      displayWidth: outW,
      displayHeight: outH,
    },
    cropBounds,
  };
}

export function mapZoomToFullScreen(
  zoomRelX: number,
  zoomRelY: number,
  cropBounds: CropBounds,
  logicalWidth: number,
  logicalHeight: number,
): { relX: number; relY: number } {
  const absX = cropBounds.left + zoomRelX * cropBounds.width;
  const absY = cropBounds.top + zoomRelY * cropBounds.height;
  return {
    relX: absX / logicalWidth,
    relY: absY / logicalHeight,
  };
}
