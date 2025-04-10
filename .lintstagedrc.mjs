// @ts-check
export default {
  '!(*.{js,jsx,ts,tsx,npmrc})': 'prettier --write',
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
}
