const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'supabase/functions/**/index.ts']),
  expoConfig,
  {
    settings: {
      'import/core-modules': ['expo-camera'],
      'import/resolver': {
        node: true,
        typescript: true,
      },
    },
  },
  eslintPluginPrettierRecommended,
]);
