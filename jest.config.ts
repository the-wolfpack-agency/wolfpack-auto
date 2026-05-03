import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  preset: "ts-jest",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  // uuid@14 is ESM-only and pulls in via next-auth → auth-guard → every
  // admin route. Jest's CJS runtime can't load it. Redirect to a CJS stub
  // that delegates to `crypto.randomUUID` so the runtime behavior is real.
  // E2E tests still exercise the actual uuid via the Next runtime.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^uuid$": "<rootDir>/src/__mocks__/uuid.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Override Next.js-specific settings that break jest
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react",
        },
      },
    ],
  },
  // Do not transform node_modules except ESM-only packages.
  // uuid@14 is ESM-only — `next-auth` pulls it in transitively, so it has
  // to be transformed for jest's CJS runtime to load it.
  transformIgnorePatterns: [
    "/node_modules/(?!(otpauth|qrcode|uuid)/)",
  ],
};

export default config;
