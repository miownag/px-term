#!/usr/bin/env node
import { render } from 'ink';
import { App } from './components/App.js';
import { loadConfig } from './config.js';

const config = loadConfig();
render(<App config={config} />, { exitOnCtrlC: false });
