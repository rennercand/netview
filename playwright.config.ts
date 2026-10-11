import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "pnpm exec tsx apps/api/src/main.ts",
      url: "http://localhost:3000/api/v1/ready",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "pnpm --filter @family/web dev --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
