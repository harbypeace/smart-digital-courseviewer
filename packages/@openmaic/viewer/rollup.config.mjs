import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'motion',
    'motion/react',
    'lucide-react',
    'clsx',
    '@openmaic/dsl',
    '@openmaic/renderer',
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json', declaration: false }),
  ],
};
