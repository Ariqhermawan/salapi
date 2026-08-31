import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React-Compiler readiness rules from eslint-plugin-react-hooks v6. They flag
    // patterns that work correctly but are not React-Compiler-optimized: on-mount
    // data loads via useEffect (the app's screen-load pattern), Math.random in a
    // purely cosmetic confetti, and a stateless render-helper component. Downgraded
    // to warn pending a dedicated refactor pass; the React Compiler is not adopted
    // yet, so these are advisory, not correctness gates. rules-of-hooks and
    // exhaustive-deps stay at their stricter defaults.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
