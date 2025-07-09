
import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'main.ts',
  output: {
    dir: '.',
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    nodeResolve(),
    typescript(),
    commonjs()
  ]
};
