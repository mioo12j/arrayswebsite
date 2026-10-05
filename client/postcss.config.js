import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Point Tailwind at this folder's config explicitly. Otherwise Tailwind
// auto-discovers tailwind.config.js from process.cwd(), so launching Vite from
// a parent directory (e.g. the monorepo root) would load no config and purge
// every utility class.
const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(here, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
