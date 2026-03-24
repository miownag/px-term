import { execSync } from 'node:child_process';
import type { DriverType, ScreenInfo } from '../types.js';

interface Executor {
  driverType: DriverType;
  click(x: number, y: number, button?: 'left' | 'right' | 'double'): void;
  typeText(text: string): void;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): void;
  getScreenSize(): { width: number; height: number };
}

function createRobotjsExecutor(): Executor {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const robot = require('robotjs');

  return {
    driverType: 'robotjs',

    click(x: number, y: number, button = 'left') {
      robot.moveMouse(x, y);
      if (button === 'double') {
        robot.mouseClick('left', true);
      } else {
        robot.mouseClick(button);
      }
    },

    typeText(text: string) {
      // For non-ASCII (e.g. Chinese), use pbcopy + Cmd+V
      // biome-ignore lint/suspicious/noControlCharactersInRegex: <no>
      if (/[^\x00-\x7F]/.test(text)) {
        execSync(`printf '%s' ${JSON.stringify(text)} | pbcopy`);
        robot.keyTap('v', 'command');
      } else {
        robot.typeString(text);
      }
    },

    scroll(direction, amount = 3) {
      const map: Record<string, [number, number]> = {
        up: [0, amount],
        down: [0, -amount],
        left: [-amount, 0],
        right: [amount, 0],
      };
      const [x, y] = map[direction];
      robot.scrollMouse(x, y);
    },

    getScreenSize() {
      const size = robot.getScreenSize();
      return { width: size.width, height: size.height };
    },
  };
}

function createCliclickExecutor(): Executor {
  function run(cmd: string) {
    execSync(`cliclick ${cmd}`, { stdio: 'ignore' });
  }

  return {
    driverType: 'cliclick',

    click(x: number, y: number, button = 'left') {
      const pos = `${Math.round(x)},${Math.round(y)}`;
      if (button === 'double') {
        run(`dc:${pos}`);
      } else if (button === 'right') {
        run(`rc:${pos}`);
      } else {
        run(`c:${pos}`);
      }
    },

    typeText(text: string) {
      // Always use pbcopy + Cmd+V for cliclick
      execSync(`printf '%s' ${JSON.stringify(text)} | pbcopy`);
      run('kp:command-v');
    },

    scroll(direction, amount = 3) {
      // cliclick doesn't support scroll natively, use AppleScript
      const dir = direction === 'up' || direction === 'left' ? 'up' : 'down';
      const pixels = amount * 100;
      execSync(
        `osascript -e 'tell application "System Events" to scroll ${dir} by ${pixels}'`,
        { stdio: 'ignore' },
      );
    },

    getScreenSize() {
      const out = execSync(
        'osascript -e \'tell application "Finder" to get bounds of window of desktop\'',
      )
        .toString()
        .trim();
      const parts = out.split(', ');
      return { width: parseInt(parts[2], 10), height: parseInt(parts[3], 10) };
    },
  };
}

let cachedExecutor: Executor | null = null;

export function createExecutor(): Executor {
  if (cachedExecutor) return cachedExecutor;

  try {
    cachedExecutor = createRobotjsExecutor();
  } catch {
    cachedExecutor = createCliclickExecutor();
  }
  return cachedExecutor;
}

export function relativeToAbsolute(
  relX: number,
  relY: number,
  screenInfo: ScreenInfo,
): { x: number; y: number } {
  return {
    x: Math.round(relX * screenInfo.logicalWidth),
    y: Math.round(relY * screenInfo.logicalHeight),
  };
}
