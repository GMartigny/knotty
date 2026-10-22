import { defineConfig, devices } from "@playwright/test";

/** Browser tests: the built app, served by `vite preview`. */
export default defineConfig({
    testDir: "e2e",
    timeout: 60_000,
    fullyParallel: true,
    reporter: "list",
    use: {
        baseURL: "http://localhost:4173",
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
    webServer: {
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
