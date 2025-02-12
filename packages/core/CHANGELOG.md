# Changelog

## [0.0.0-alpha.9](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.8...sdk-v0.0.0-alpha.9) (2025-02-11)

### Features

- document store ([#197](https://github.com/sanity-io/sdk/issues/197)) ([497bb26](https://github.com/sanity-io/sdk/commit/497bb2641d5766128dfca4db8247f2f9555b83b1))

## [0.0.0-alpha.8](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.7...sdk-v0.0.0-alpha.8) (2025-02-06)

### Features

- **client:** add a global api client ([#209](https://github.com/sanity-io/sdk/issues/209)) ([5898b1d](https://github.com/sanity-io/sdk/commit/5898b1d82fc07d12f736d1361e48287e41ae0608))

## [0.0.0-alpha.7](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.6...sdk-v0.0.0-alpha.7) (2025-02-05)

### Bug Fixes

- trigger release ([#210](https://github.com/sanity-io/sdk/issues/210)) ([2b36c98](https://github.com/sanity-io/sdk/commit/2b36c985a91d44be95a9e6c8446e9a11ffa59d61))

## [0.0.0-alpha.6](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.5...sdk-v0.0.0-alpha.6) (2025-01-30)

### ⚠ BREAKING CHANGES

- renames `org` auth scope to `global` ([#187](https://github.com/sanity-io/sdk/issues/187))

### Miscellaneous Chores

- renames `org` auth scope to `global` ([#187](https://github.com/sanity-io/sdk/issues/187)) ([3220d57](https://github.com/sanity-io/sdk/commit/3220d5729c8012ffc47bfa2d75bfca1f2642df76))

## [0.0.0-alpha.5](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.4...sdk-v0.0.0-alpha.5) (2025-01-28)

### Bug Fixes

- initialize client with configured apiHost ([#186](https://github.com/sanity-io/sdk/issues/186)) ([13c72cb](https://github.com/sanity-io/sdk/commit/13c72cbb0dc9aa2fe1b4c0384f1cf28eb7f40d2e))

## [0.0.0-alpha.4](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.3...sdk-v0.0.0-alpha.4) (2025-01-23)

### Features

- **core:** add comlink controller and channel store ([#141](https://github.com/sanity-io/sdk/issues/141)) ([cf1e5d5](https://github.com/sanity-io/sdk/commit/cf1e5d5a8cbcb27beacba2362b462176071200e4))
- **core:** add comlink node store ([#156](https://github.com/sanity-io/sdk/issues/156)) ([a080357](https://github.com/sanity-io/sdk/commit/a0803574dacbe86455fc60b1b9f3775ea33e7a89))

## [0.0.0-alpha.3](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.2...sdk-v0.0.0-alpha.3) (2025-01-09)

### Bug Fixes

- environment variable access for Remix ([#168](https://github.com/sanity-io/sdk/issues/168)) ([4ad3587](https://github.com/sanity-io/sdk/commit/4ad3587fd0ea262b09c3add20c2ba2bd8d5d15c2))

## [0.0.0-alpha.2](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.1...sdk-v0.0.0-alpha.2) (2025-01-06)

### Features

- add preview store ([#62](https://github.com/sanity-io/sdk/issues/62)) ([c343f1e](https://github.com/sanity-io/sdk/commit/c343f1e15f30afd66dbd4c0309b9152600ceb1be))
- **core:** add README and npm keywords ([#115](https://github.com/sanity-io/sdk/issues/115)) ([8a3c492](https://github.com/sanity-io/sdk/commit/8a3c4928647f6e8c4a8fe3f43da9cb8e904af522))
- **kitchen-sink:** add routing to kitchen-sink ([#99](https://github.com/sanity-io/sdk/issues/99)) ([50483ea](https://github.com/sanity-io/sdk/commit/50483ea66073bfccdc28e51f7606673eb213bebe))
- **react:** add useDocuments hook ([#98](https://github.com/sanity-io/sdk/issues/98)) ([d0f0c1a](https://github.com/sanity-io/sdk/commit/d0f0c1ad753b56b7e7cc6ff0830682d4fc6be0d1))
- resolve preview projections ([#130](https://github.com/sanity-io/sdk/issues/130)) ([d30997e](https://github.com/sanity-io/sdk/commit/d30997e4a3d40c0edd1b3f31f48934bf846ab56a))

### Bug Fixes

- **core:** emit current token state on subscribe ([#139](https://github.com/sanity-io/sdk/issues/139)) ([7ec0d98](https://github.com/sanity-io/sdk/commit/7ec0d984f2c7f2da519206165cb7a2c1e2213c79))
- update typedoc to use package mode ([#117](https://github.com/sanity-io/sdk/issues/117)) ([7f4e0e1](https://github.com/sanity-io/sdk/commit/7f4e0e1f08610fb3861e5dc8eb67fb1556b4d965))

## [0.0.0-alpha.1](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.0...sdk-v0.0.0-alpha.1) (2024-12-11)

### Features

- `createStore` prototype ([#46](https://github.com/sanity-io/sdk/issues/46)) ([d3d69f8](https://github.com/sanity-io/sdk/commit/d3d69f8164ed406c77a3586a8a29987fd5aa1b2e))
- add authorization ([#52](https://github.com/sanity-io/sdk/issues/52)) ([59501f1](https://github.com/sanity-io/sdk/commit/59501f1525e271e8d724c4eb69a27f01726bb64e))
- add document list store ([#58](https://github.com/sanity-io/sdk/issues/58)) ([b66ea04](https://github.com/sanity-io/sdk/commit/b66ea04a386207704512a4b5cd1c5e77e0a48eb6))
- add hooks for AuthStore ([#91](https://github.com/sanity-io/sdk/issues/91)) ([4367719](https://github.com/sanity-io/sdk/commit/43677193fccc08fcf7074f906edf2acdfc440e1c))
- add React and Vitest ([#3](https://github.com/sanity-io/sdk/issues/3)) ([e55dc32](https://github.com/sanity-io/sdk/commit/e55dc32f080ffaa7470bdcb2ed97f992cfcbe584))
- add session hooks and store ([#59](https://github.com/sanity-io/sdk/issues/59)) ([65ac911](https://github.com/sanity-io/sdk/commit/65ac9111d79211aee621f7bfed47bb5cfcf565e1))
- add storybook and dev affordances ([#6](https://github.com/sanity-io/sdk/issues/6)) ([15b45e8](https://github.com/sanity-io/sdk/commit/15b45e8d7821ec7abc1852998143e19553c06f1e))
- add turborepo ([#2](https://github.com/sanity-io/sdk/issues/2)) ([19c53e1](https://github.com/sanity-io/sdk/commit/19c53e1408edacbda4105c75c6fa5c4fe0a6b744))
- add TypeDoc ([#43](https://github.com/sanity-io/sdk/issues/43)) ([2274873](https://github.com/sanity-io/sdk/commit/227487372c1d04799f7c2ed06839dae06113887c))
- add useClient hook ([#96](https://github.com/sanity-io/sdk/issues/96)) ([c50883b](https://github.com/sanity-io/sdk/commit/c50883bbf3eed32977a1033615582690234154fc))
- **auth:** fetch current user when token is present ([#92](https://github.com/sanity-io/sdk/issues/92)) ([f38008c](https://github.com/sanity-io/sdk/commit/f38008c71d55bb3b54bbf5318045a52a918084c2))
- AuthStore ([#79](https://github.com/sanity-io/sdk/issues/79)) ([f52e68e](https://github.com/sanity-io/sdk/commit/f52e68e43d5552b061415aba6c2758bcd6243c7c))
- **core:** create client store ([#38](https://github.com/sanity-io/sdk/issues/38)) ([8545333](https://github.com/sanity-io/sdk/commit/8545333c02c5691674e90be19951458ab3abbd6a))
- **core:** update client store to subscribe to changes in auth ([#85](https://github.com/sanity-io/sdk/issues/85)) ([a42d58d](https://github.com/sanity-io/sdk/commit/a42d58d3227e7d884a5449192f176e66bf404144))
- **core:** use separate client for auth and refresh client store with token ([#64](https://github.com/sanity-io/sdk/issues/64)) ([9d18fbf](https://github.com/sanity-io/sdk/commit/9d18fbfd2fc2708e0f9505617343720c5d7fafb0))
- create sanity instance and store map ([#40](https://github.com/sanity-io/sdk/issues/40)) ([a7bf3e1](https://github.com/sanity-io/sdk/commit/a7bf3e12ea0f36ee63e42b4ba9088a9413b0742b))
- **react:** add AuthBoundary ([#102](https://github.com/sanity-io/sdk/issues/102)) ([bd657a0](https://github.com/sanity-io/sdk/commit/bd657a058c4ae0989018503fe2fafa319fcdbc7d))
- refactor to internal auth store ([#95](https://github.com/sanity-io/sdk/issues/95)) ([5807a2b](https://github.com/sanity-io/sdk/commit/5807a2b0b823f9187c25ab82233ad6d30df664f1))
- replace jsdoc with tsdoc ([#75](https://github.com/sanity-io/sdk/issues/75)) ([7074a38](https://github.com/sanity-io/sdk/commit/7074a383b58de66fe2a9badc7122d0345e354b2a))

### Bug Fixes

- add lint to turbo.json and run prettier ([909f0d3](https://github.com/sanity-io/sdk/commit/909f0d34339c9c8ff8c013dfa13e5d607a2012fc))
- correct auth state subscription ([#101](https://github.com/sanity-io/sdk/issues/101)) ([9ba03d0](https://github.com/sanity-io/sdk/commit/9ba03d03f00df6d6aac29036cdca6a880fb3c52d))
- **deps:** Update eslint-tooling ([#69](https://github.com/sanity-io/sdk/issues/69)) ([d9d8e09](https://github.com/sanity-io/sdk/commit/d9d8e099e4711bb6ae90e926ce804715f56ef5d3))
- mark packages as private for now ([#11](https://github.com/sanity-io/sdk/issues/11)) ([a103825](https://github.com/sanity-io/sdk/commit/a1038257192e2c493132b96233d461bdd9a31744))
- package access and version ([#89](https://github.com/sanity-io/sdk/issues/89)) ([c4eb26d](https://github.com/sanity-io/sdk/commit/c4eb26dac12ec56c5a569c8edc895ffcd46a63a7))
