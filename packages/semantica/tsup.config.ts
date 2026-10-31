/** Build a self-contained hosted compiler artifact without the CLI/storage runtime. */
import { defineConfig } from 'tsup';

export default defineConfig({ entry: ['src/index.ts'], format: ['esm'], target: 'node24', dts: true, clean: true });
