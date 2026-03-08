import { useMemo } from 'react';
import { useTerminalSize } from './use-safe-width';

const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * t;

interface UseResponsiveWidthOptions {
  useFullWidth?: boolean;
  isAlternateBuffer?: boolean;
  minWidth?: number;
  maxWidth?: number;
  padding?: number;
  border?: number;
}

const useResponsiveWidth = (
  options: UseResponsiveWidthOptions = {},
): number => {
  const {
    useFullWidth = true,
    isAlternateBuffer = false,
    minWidth = 1,
    maxWidth: userMaxWidth,
    padding = 0,
    border = 0,
  } = options;

  const { width: terminalWidth } = useTerminalSize() || { width: 80 };

  return useMemo(() => {
    const maxWidth = userMaxWidth ?? terminalWidth;

    if (useFullWidth) {
      const width = isAlternateBuffer ? terminalWidth - 1 : terminalWidth;
      return Math.max(minWidth, Math.min(maxWidth, width - padding - border));
    }

    let calculatedWidth: number;
    if (terminalWidth <= 80) {
      calculatedWidth = Math.round(0.98 * terminalWidth);
    } else if (terminalWidth >= 132) {
      calculatedWidth = Math.round(0.9 * terminalWidth);
    } else {
      // 80-132列之间线性插值
      const t = (terminalWidth - 80) / (132 - 80);
      const percentage = lerp(98, 90, t);
      calculatedWidth = Math.round(percentage * terminalWidth * 0.01);
    }

    return Math.max(
      minWidth,
      Math.min(maxWidth, calculatedWidth - padding - border),
    );
  }, [
    terminalWidth,
    useFullWidth,
    isAlternateBuffer,
    minWidth,
    userMaxWidth,
    padding,
    border,
  ]);
};

export const useComponentWidths = (
  containerWidth: number,
  options: {
    framePadding?: number;
    prefixWidth?: number;
    minContentWidth?: number;
  } = {},
) => {
  const { framePadding = 4, prefixWidth = 2, minContentWidth = 20 } = options;

  return useMemo(() => {
    const frameOverhead = framePadding + prefixWidth;

    return {
      contentWidth: Math.max(containerWidth - frameOverhead, 1),
      containerWidth,
      suggestionsWidth: Math.max(minContentWidth, containerWidth),
      frameOverhead,
    } as const;
  }, [containerWidth, framePadding, prefixWidth, minContentWidth]);
};

export default useResponsiveWidth;
