// @ts-check
export default {
  '!(*.{js,jsx,ts,tsx,npmrc,gitignore})': 'oxfmt --no-error-on-unmatched-pattern',
  '*.{js,jsx,ts,tsx}': [
    'oxlint --fix --no-error-on-unmatched-pattern',
    'oxfmt --no-error-on-unmatched-pattern',
  ],
}
