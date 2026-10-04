import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',testMatch:'**/*.spec.mjs',workers:1,fullyParallel:false,timeout:30000,reporter:'list',use:{browserName:'chromium',headless:true,launchOptions:{...(process.env.VALENCE_TEST_CHROMIUM?{executablePath:process.env.VALENCE_TEST_CHROMIUM}:{})},trace:'retain-on-failure'},outputDir:'test-results'});
