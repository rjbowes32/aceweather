import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      ".claude/**",
      "node_modules/**",
      "static/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/use-memo": "off",
    },
  },
];

export default config;
