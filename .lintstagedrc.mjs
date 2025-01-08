export default {
  '!(*.{js,jsx,ts,tsx})': 'prettier --write',
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
}
