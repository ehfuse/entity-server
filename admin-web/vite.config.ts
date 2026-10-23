import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

const serverConfigPath = path.resolve(__dirname, "../configs/server.json");

const getDefaultEmailDomain = () => {
    try {
        const raw = fs.readFileSync(serverConfigPath, "utf-8");
        const parsed = JSON.parse(raw) as { default_email_domain?: string };
        if (parsed.default_email_domain?.trim()) {
            return parsed.default_email_domain.trim();
        }
    } catch {
        // ignore and fallback
    }

    return "example.com";
};

const defaultEmailDomain = getDefaultEmailDomain();

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    define: {
        __DEFAULT_EMAIL_DOMAIN__: JSON.stringify(defaultEmailDomain),
    },
    server: {
        fs: {
            allow: [".."],
        },
        proxy: {
            "/v1": {
                target: "http://localhost:47200",
                changeOrigin: true,
            },
        },
    },
});
