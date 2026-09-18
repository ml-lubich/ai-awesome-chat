import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

/** @type {import("eslint").Linter.Config[]} */
const config = [
    {
        ignores: [".next/**", "node_modules/**", "coverage/**", "tsconfig.tsbuildinfo"],
    },
    ...nextCoreWebVitals,
    {
        rules: {
            "react/no-unescaped-entities": "off",
        },
    },
]

export default config
