import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // scripts/ holds Node maintenance scripts (migrations, proofs, demo data) —
    // CommonJS by design, run with node, never bundled into the app
    ignores: ["node_modules/**", ".next/**", "prototype/**", "scripts/**"],
  },
];

export default eslintConfig;
