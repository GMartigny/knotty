import { defineConfig, devices } from "@playwright/test";

// Node's `process`, without pulling Node types into the app.
declare const process: { env: Record<string, string | undefined> };

/** Browser tests: the built app, served by `vite preview`. */
export default defineConfig({
    testDir: "e2e",
    timeout: 60_000,
    fullyParallel: true,
    // On CI, an HTML report is kept as an artifact when a test fails.
    reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: "http://localhost:4173",
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
    webServer: {
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
