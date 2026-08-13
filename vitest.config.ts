import { defineConfig } from "vitest/config";

// Config mínima para tests unitarios de componentes (jsdom + JSX automático de
// React 18). No toca el build de publicación (tsconfig.e2e.json).
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**"],
  },
  esbuild: {
    jsx: "automatic",
  },
});
