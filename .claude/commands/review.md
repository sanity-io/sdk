Review the changes and identify only issues that need fixing. If no PR context is provided, get the diff with:

```
git diff main...HEAD  # committed changes on this branch
git diff --cached     # staged but not yet committed
```

For each issue found:

- State the problem in 1-2 sentences
- Provide the fix or recommendation
- Include line numbers when relevant

Skip:

- Compliments or positive observations
- General assessments
- Explanations of what the code does
- Issues that would already be caught by CI (linters, type-checks, unused imports, style issues, etc.)

Focus on:

- Bugs or logic errors
- Security vulnerabilities
- Performance problems
- Missing error handling
- Inadequate test coverage
- Code matches the existing codebase
- Ensure any new dependency installed is truly necessary or could be accomplished with existing dependencies
- Breaking changes to publicly exported APIs — this is a published SDK and semver must be respected
- Cross-package impact — changes in `packages/core` can have downstream effects on `packages/react` consumers; flag if related packages need corresponding updates
- React leakage into `packages/core` — core is framework-agnostic; flag any React imports, hooks, or JSX introduced there

If there is no actionable feedback, do not post a comment. If you have already posted a review comment on this PR, update it to indicate there are no further issues.

Collapse each section of your top-level comment using GitHub's `<details>`/`<summary>` tags so reviewers can expand them selectively.

Keep the entire review short and concise. Be direct and actionable.
