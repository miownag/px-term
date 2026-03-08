import { useStdout } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

// Default values for terminals that don't report size
const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const MIN_WIDTH = 40;
const MIN_HEIGHT = 10;

export interface TerminalSize {
  width: number;
  height: number;
  columns: number;
  rows: number;
}

interface UseSafeWidthOptions {
  reservedWidth?: number;
  reservedHeight?: number;
  debounceMs?: number;
  minWidth?: number;
  minHeight?: number;
}

/**
 * Hook to get terminal dimensions with resize handling
 * @param options Configuration options
 * @returns Terminal size information
 */
export function useTerminalSize(
  options: UseSafeWidthOptions = {},
): TerminalSize {
  const {
    reservedWidth = 0,
    reservedHeight = 0,
    debounceMs = 50,
    minWidth = MIN_WIDTH,
    minHeight = MIN_HEIGHT,
  } = options;

  const { stdout } = useStdout();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculateSize = useCallback((): TerminalSize => {
    const columns = stdout.columns ?? DEFAULT_COLUMNS;
    const rows = stdout.rows ?? DEFAULT_ROWS;

    return {
      columns,
      rows,
      width: Math.max(minWidth, columns - reservedWidth),
      height: Math.max(minHeight, rows - reservedHeight),
    };
  }, [
    stdout.columns,
    stdout.rows,
    reservedWidth,
    reservedHeight,
    minWidth,
    minHeight,
  ]);

  const [size, setSize] = useState<TerminalSize>(calculateSize);

  useEffect(() => {
    // Update immediately on mount or when dependencies change
    setSize(calculateSize());

    const handleResize = () => {
      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce resize events to prevent excessive re-renders
      debounceTimerRef.current = setTimeout(() => {
        setSize(calculateSize());
      }, debounceMs);
    };

    stdout.on('resize', handleResize);

    return () => {
      // Clean up debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Remove event listener
      if (typeof stdout.off === 'function') {
        stdout.off('resize', handleResize);
      } else {
        stdout.removeListener('resize', handleResize);
      }
    };
  }, [stdout, calculateSize, debounceMs]);

  return size;
}

/**
 * Simplified hook to get safe width only (backwards compatible)
 * @param reservedWidth Width to reserve from terminal width
 * @returns Safe width for content
 */
const useSafeWidth = (reservedWidth = 1): number => {
  const { width } = useTerminalSize({ reservedWidth });
  return width;
};

export default useSafeWidth;
