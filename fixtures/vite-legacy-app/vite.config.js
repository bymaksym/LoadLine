import legacy from '@vitejs/plugin-legacy';

export default { build: { sourcemap: false }, plugins: [legacy({ targets: ['defaults', 'ie 11'], polyfills: [] })] };
