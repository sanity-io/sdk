// @ts-check
export default {
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
  '!(*.{js,jsx,ts,tsx,npmrc,gitignore})': 'prettier --write',
}
