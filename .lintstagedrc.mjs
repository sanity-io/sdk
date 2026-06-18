// @ts-check
export default {
  '!(*.{js,jsx,ts,tsx,npmrc,gitignore})': 'oxfmt --no-error-on-unmatched-pattern',
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'oxfmt --no-error-on-unmatched-pattern'],
}
