import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: { entry: { index: './src/index.tsx' } },
  lib: [{ format: 'esm', syntax: ['node 18'], dts: false }],
  output: {
    target: 'node',
    externals: [
      'sharp',
      'robotjs',
      'screenshot-desktop',
      'ink',
      'react',
      'react-dom',
      'ink-spinner',
      'ink-text-input',
      'ink-select-input',
      '@langchain/core',
      '@langchain/openai',
      '@langchain/anthropic',
      'dotenv',
      'zod',
    ],
  },
  plugins: [pluginReact()],
});
