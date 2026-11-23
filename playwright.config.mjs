import {defineConfig} from '@playwright/test';
export default defineConfig({testMatch:process.env.LIGHTHOUSE_REAL_E2E?'real-app.spec.mjs':process.env.LIGHTHOUSE_LONG_E2E?'long-session.spec.mjs':'smoke.spec.mjs',workers:1,timeout:120000,expect:{timeout:15000},reporter:'list'});
