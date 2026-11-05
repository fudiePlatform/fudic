import { configDefaults, defineConfig } from 'vitest/config';

// A project whose vitest leaves out every file under `.fudic`: the render's file is never a module
// of the run, so nothing runs at all.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '**/.fudic/**'] } });
