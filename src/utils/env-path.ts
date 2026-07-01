import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const CONFIG_DIR = resolve(homedir(), '.config', 'mcp-web-hound');
export const ENV_PATH = resolve(CONFIG_DIR, '.env');
export const DATA_DIR = resolve(CONFIG_DIR, 'data');
