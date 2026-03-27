import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  preset: "ts-jest",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
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
  // Do not transform node_modules except ESM-only packages
  transformIgnorePatterns: [
    "/node_modules/(?!(otpauth|qrcode)/)",
  ],
};

export default config;
