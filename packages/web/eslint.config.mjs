import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextParserPath = path.join(__dirname, 'node_modules', 'next', 'dist', 'compiled', 'babel', 'eslint-parser');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: path.join(__dirname, 'node_modules', 'eslint-config-next')
});

const eslintConfig = [
  {
    languageOptions: {
      parser: nextParserPath,
    },
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
