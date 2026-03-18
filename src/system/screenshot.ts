import screenshot from 'screenshot-desktop';
import type { ScreenInfo } from '../types.js';

export async function captureScreen(): Promise<Buffer> {
  const img = await screenshot({ format: 'png' });
  return Buffer.isBuffer(img) ? img : Buffer.from(img);
}

export async function detectScreenInfo(
  getLogicalSize: () => { width: number; height: number },
): Promise<ScreenInfo> {
  const sharp = (await import('sharp')).default;
  const buf = await captureScreen();
  const meta = await sharp(buf).metadata();
  const physicalWidth = meta.width;
  const physicalHeight = meta.height;
  const logical = getLogicalSize();
  const scaleFactor = physicalWidth / logical.width;

  return {
    physicalWidth,
    physicalHeight,
    logicalWidth: logical.width,
    logicalHeight: logical.height,
    scaleFactor,
  };
}
