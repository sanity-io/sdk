// @ts-check
export default {
  '*.{json,md,yaml}': 'prettier --write',
  '*.{js,mjs,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
}
