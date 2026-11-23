import {defineConfig} from '@playwright/test';
export default defineConfig({testMatch:'smoke.spec.mjs',workers:1,timeout:120000,expect:{timeout:15000},reporter:'list'});
