import type { Config } from "jest";
import { pathsToModuleNameMapper } from "ts-jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", {
      tsconfig: {
        module: "commonjs",
        moduleResolution: "node",
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strictNullChecks: true,
        noImplicitAny: true,
        target: "ES2021",
        skipLibCheck: true,
      },
    }],
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: pathsToModuleNameMapper(
    { "@api/*": ["src/*"] },
    { prefix: "<rootDir>/../" }
  ),
};

export default config;
