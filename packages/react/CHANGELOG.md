# Changelog

## [0.0.0-alpha.16](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.15...sdk-react-v0.0.0-alpha.16) (2025-03-10)


### ⚠ BREAKING CHANGES

* remove `useDocuments` and `useSearch` hooks

### Features

* add `useQuery`, `useInfiniteList`, `usePaginatedList` hooks ([1a3f4ad](https://github.com/sanity-io/sdk/commit/1a3f4ad98abf2ab68c552fea20d60639462f3aac))
* add suspense boundary to prevent recreating instances ([d92e38d](https://github.com/sanity-io/sdk/commit/d92e38d64dfe5c0a35d8de35faa7ecbe5425f023))
* add versions information to all packages ([#275](https://github.com/sanity-io/sdk/issues/275)) ([afb2fec](https://github.com/sanity-io/sdk/commit/afb2fec63ea3bae53cab9d8f05081daf2f3c2733))
* **document hooks:** update the documentation for the Document hook s an optional resourceId ([#280](https://github.com/sanity-io/sdk/issues/280)) ([eb65378](https://github.com/sanity-io/sdk/commit/eb65378c884f3aaf9b2c0dbc95dd86075c76f9e0))
* remove `useDocuments` and `useSearch` hooks ([9f37daf](https://github.com/sanity-io/sdk/commit/9f37daf1243ee0fda558ffd7259c45da9e4ba259))


### Bug Fixes

* **deps:** update dependency @sanity/comlink to v3 ([#296](https://github.com/sanity-io/sdk/issues/296)) ([14fbe1b](https://github.com/sanity-io/sdk/commit/14fbe1b89a79d2532e8735a58abbe4a5cff6d635))
* **deps:** Update sanity monorepo to ^3.78.1 ([#297](https://github.com/sanity-io/sdk/issues/297)) ([835b594](https://github.com/sanity-io/sdk/commit/835b5942d3870a92e0fd1387ab9baa5e555a3ee5))
* handle env variable for react and react-internal ([#294](https://github.com/sanity-io/sdk/issues/294)) ([0b733ff](https://github.com/sanity-io/sdk/commit/0b733ffbe00bbcb8c29fbee6628ba53c704e1c11))

## [0.0.0-alpha.15](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.14...sdk-react-v0.0.0-alpha.15) (2025-03-07)


### ⚠ BREAKING CHANGES

* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271))

### Features

* add useProjection hook ([#257](https://github.com/sanity-io/sdk/issues/257)) ([fbaafe0](https://github.com/sanity-io/sdk/commit/fbaafe031e235f61b9d60bf5938f18a4683aafe5))
* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271)) ([6f4d541](https://github.com/sanity-io/sdk/commit/6f4d5410671e8b75759e33380464656a8c961ad6))
* redirect to core if app opened without core ([#268](https://github.com/sanity-io/sdk/issues/268)) ([3f6bb83](https://github.com/sanity-io/sdk/commit/3f6bb8344cee6d582aaee0d7ba64b9cb3035469f))

## [0.0.0-alpha.14](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.13...sdk-react-v0.0.0-alpha.14) (2025-03-05)


### Features

* `useProjects`, `useProject`, `useDatasets` ([#235](https://github.com/sanity-io/sdk/issues/235)) ([cc95dfd](https://github.com/sanity-io/sdk/commit/cc95dfd45a82171fa7ccf05a8ca331e8de97fbee))
* **react:** add SDKProvider app to use SDK without core ([#263](https://github.com/sanity-io/sdk/issues/263)) ([51e84fc](https://github.com/sanity-io/sdk/commit/51e84fcd7b64558bc108f00d3fb5a98aade25d29))
* **react:** add useSearch hook ([#258](https://github.com/sanity-io/sdk/issues/258)) ([488317a](https://github.com/sanity-io/sdk/commit/488317a72987daf88385f757a60ffdc191333218))


### Bug Fixes

* add access api types inside the SDK ([#261](https://github.com/sanity-io/sdk/issues/261)) ([ff53123](https://github.com/sanity-io/sdk/commit/ff53123f2e01a242c22df22b9dc109d2cbc3b1d4))

## [0.0.0-alpha.13](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.12...sdk-react-v0.0.0-alpha.13) (2025-02-28)


### Features

* add useUsers hook ([#239](https://github.com/sanity-io/sdk/issues/239)) ([b89bcf0](https://github.com/sanity-io/sdk/commit/b89bcf00bc4a849409ae80f45b1917cb1e51c66e))


### Bug Fixes

* **react:** update bridge script import for AuthBoundary ([#234](https://github.com/sanity-io/sdk/issues/234)) ([fe69106](https://github.com/sanity-io/sdk/commit/fe69106d35f5e1dee9f901ec21424042d7f9dc18))

## [0.0.0-alpha.12](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.11...sdk-react-v0.0.0-alpha.12) (2025-02-28)


### Features

* **auth:** refresh stamped tokens ([#225](https://github.com/sanity-io/sdk/issues/225)) ([10b2745](https://github.com/sanity-io/sdk/commit/10b2745c62f9169b8cd1c66d7fb641d7fda37429))
* document permissions ([#226](https://github.com/sanity-io/sdk/issues/226)) ([107f434](https://github.com/sanity-io/sdk/commit/107f4349d7defab04d1282ee1ab20766d157eab7))


### Bug Fixes

* **comlink:** expose statuses and destroy unused resources ([#233](https://github.com/sanity-io/sdk/issues/233)) ([8b8a40c](https://github.com/sanity-io/sdk/commit/8b8a40c5ac0b5ba76cda043ffc9bc3b740bce5bd))

## [0.0.0-alpha.11](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.10...sdk-react-v0.0.0-alpha.11) (2025-02-13)


### Features

* add sdk-react-internal package and remove @sanity/ui package ([#193](https://github.com/sanity-io/sdk/issues/193)) ([7fa201e](https://github.com/sanity-io/sdk/commit/7fa201ee49b75bbc71a741503ed0336f94785201))

## [0.0.0-alpha.10](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.9...sdk-react-v0.0.0-alpha.10) (2025-02-12)


### Features

* allow useEditDocument to take an updater function ([#218](https://github.com/sanity-io/sdk/issues/218)) ([85b3440](https://github.com/sanity-io/sdk/commit/85b344007df3fd66ce7dae94df8f6b8a81f54574))

## [0.0.0-alpha.9](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.8...sdk-react-v0.0.0-alpha.9) (2025-02-11)


### Features

* document store ([#197](https://github.com/sanity-io/sdk/issues/197)) ([497bb26](https://github.com/sanity-io/sdk/commit/497bb2641d5766128dfca4db8247f2f9555b83b1))

## [0.0.0-alpha.8](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.7...sdk-react-v0.0.0-alpha.8) (2025-02-06)


### Features

* export useClient ([#213](https://github.com/sanity-io/sdk/issues/213)) ([0e79002](https://github.com/sanity-io/sdk/commit/0e790020ee0f688e6f07243c5605b5cbffe4b1c5))

## [0.0.0-alpha.7](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.6...sdk-react-v0.0.0-alpha.7) (2025-02-05)


### Features

* **react:** add sanity os bridge script to AuthBoundary ([#196](https://github.com/sanity-io/sdk/issues/196)) ([1fb064d](https://github.com/sanity-io/sdk/commit/1fb064d111541bf93c8933920d7bce00a9c454ef))


### Bug Fixes

* adjust incorrect release back to alpha.6 ([#212](https://github.com/sanity-io/sdk/issues/212)) ([a946853](https://github.com/sanity-io/sdk/commit/a9468530e16ee056d972d913e4f046ceb0610134))
* trigger release ([#210](https://github.com/sanity-io/sdk/issues/210)) ([2b36c98](https://github.com/sanity-io/sdk/commit/2b36c985a91d44be95a9e6c8446e9a11ffa59d61))

## [0.0.0-alpha.6](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.5...sdk-react-v0.0.0-alpha.6) (2025-01-30)

### ⚠ BREAKING CHANGES

- renames `org` auth scope to `global` ([#187](https://github.com/sanity-io/sdk/issues/187))

### Miscellaneous Chores

- renames `org` auth scope to `global` ([#187](https://github.com/sanity-io/sdk/issues/187)) ([3220d57](https://github.com/sanity-io/sdk/commit/3220d5729c8012ffc47bfa2d75bfca1f2642df76))

## [0.0.0-alpha.5](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.4...sdk-react-v0.0.0-alpha.5) (2025-01-28)

### Features

- render AuthProvider components w/ Sanity UI ([#189](https://github.com/sanity-io/sdk/issues/189)) ([a4ab4c3](https://github.com/sanity-io/sdk/commit/a4ab4c35519417bdd92c75f935479fb834f9af18))

## [0.0.0-alpha.4](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.3...sdk-react-v0.0.0-alpha.4) (2025-01-23)

### Features

- **react:** create React hooks for comlink store ([#153](https://github.com/sanity-io/sdk/issues/153)) ([7055347](https://github.com/sanity-io/sdk/commit/7055347160f7d3734c361d182b686e2f835e1846))

## [0.0.0-alpha.3](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.2...sdk-react-v0.0.0-alpha.3) (2025-01-09)

### Bug Fixes

- styled is not a function in Remix apps ([#169](https://github.com/sanity-io/sdk/issues/169)) ([7a8cfbf](https://github.com/sanity-io/sdk/commit/7a8cfbfedb60c5877cc4edae0caf92dfb6adf388))

## [0.0.0-alpha.2](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.1...sdk-react-v0.0.0-alpha.2) (2025-01-06)

### Features

- add preview store ([#62](https://github.com/sanity-io/sdk/issues/62)) ([c343f1e](https://github.com/sanity-io/sdk/commit/c343f1e15f30afd66dbd4c0309b9152600ceb1be))
- **components:** swap Sanity UI w/ CSS (doc collection) ([#114](https://github.com/sanity-io/sdk/issues/114)) ([36dcd35](https://github.com/sanity-io/sdk/commit/36dcd3595bd09eba3cd5e6bac57d9dfcd4fee035))
- **core:** add README and npm keywords ([#115](https://github.com/sanity-io/sdk/issues/115)) ([8a3c492](https://github.com/sanity-io/sdk/commit/8a3c4928647f6e8c4a8fe3f43da9cb8e904af522))
- **kitchen-sink:** add routing to kitchen-sink ([#99](https://github.com/sanity-io/sdk/issues/99)) ([50483ea](https://github.com/sanity-io/sdk/commit/50483ea66073bfccdc28e51f7606673eb213bebe))
- **react:** add useDocuments hook ([#98](https://github.com/sanity-io/sdk/issues/98)) ([d0f0c1a](https://github.com/sanity-io/sdk/commit/d0f0c1ad753b56b7e7cc6ff0830682d4fc6be0d1))
- resolve preview projections ([#130](https://github.com/sanity-io/sdk/issues/130)) ([d30997e](https://github.com/sanity-io/sdk/commit/d30997e4a3d40c0edd1b3f31f48934bf846ab56a))

### Bug Fixes

- update typedoc to use package mode ([#117](https://github.com/sanity-io/sdk/issues/117)) ([7f4e0e1](https://github.com/sanity-io/sdk/commit/7f4e0e1f08610fb3861e5dc8eb67fb1556b4d965))

## [0.0.0-alpha.1](https://github.com/sanity-io/sdk/compare/sdk-react-v0.0.0-alpha.0...sdk-react-v0.0.0-alpha.1) (2024-12-11)

### Features

- add authorization ([#52](https://github.com/sanity-io/sdk/issues/52)) ([59501f1](https://github.com/sanity-io/sdk/commit/59501f1525e271e8d724c4eb69a27f01726bb64e))
- add hooks for AuthStore ([#91](https://github.com/sanity-io/sdk/issues/91)) ([4367719](https://github.com/sanity-io/sdk/commit/43677193fccc08fcf7074f906edf2acdfc440e1c))
- add initial SanityInstance provider ([#63](https://github.com/sanity-io/sdk/issues/63)) ([2e816b9](https://github.com/sanity-io/sdk/commit/2e816b94c6a706de7792907e7e593970d1570256))
- add React and Vitest ([#3](https://github.com/sanity-io/sdk/issues/3)) ([e55dc32](https://github.com/sanity-io/sdk/commit/e55dc32f080ffaa7470bdcb2ed97f992cfcbe584))
- add session hooks and store ([#59](https://github.com/sanity-io/sdk/issues/59)) ([65ac911](https://github.com/sanity-io/sdk/commit/65ac9111d79211aee621f7bfed47bb5cfcf565e1))
- add storybook and dev affordances ([#6](https://github.com/sanity-io/sdk/issues/6)) ([15b45e8](https://github.com/sanity-io/sdk/commit/15b45e8d7821ec7abc1852998143e19553c06f1e))
- add turborepo ([#2](https://github.com/sanity-io/sdk/issues/2)) ([19c53e1](https://github.com/sanity-io/sdk/commit/19c53e1408edacbda4105c75c6fa5c4fe0a6b744))
- add TypeDoc ([#43](https://github.com/sanity-io/sdk/issues/43)) ([2274873](https://github.com/sanity-io/sdk/commit/227487372c1d04799f7c2ed06839dae06113887c))
- add useClient hook ([#96](https://github.com/sanity-io/sdk/issues/96)) ([c50883b](https://github.com/sanity-io/sdk/commit/c50883bbf3eed32977a1033615582690234154fc))
- **auth:** fetch current user when token is present ([#92](https://github.com/sanity-io/sdk/issues/92)) ([f38008c](https://github.com/sanity-io/sdk/commit/f38008c71d55bb3b54bbf5318045a52a918084c2))
- **components:** add initial presentational components ([#44](https://github.com/sanity-io/sdk/issues/44)) ([9d7cf51](https://github.com/sanity-io/sdk/commit/9d7cf517186ee274fe3bd9ea32b36b590ddb7150))
- **components:** DocumentList & Storybook upgrades ([#54](https://github.com/sanity-io/sdk/issues/54)) ([71e8eca](https://github.com/sanity-io/sdk/commit/71e8eca3da0995f3a8dd4f6eb5b606fdfa139b6c))
- **components:** update DocumentList & DocumentPreview ([#61](https://github.com/sanity-io/sdk/issues/61)) ([c00b292](https://github.com/sanity-io/sdk/commit/c00b292dd99bdc6c5b4ee1615b0f3e49106d09c5))
- **core:** create client store ([#38](https://github.com/sanity-io/sdk/issues/38)) ([8545333](https://github.com/sanity-io/sdk/commit/8545333c02c5691674e90be19951458ab3abbd6a))
- **core:** use separate client for auth and refresh client store with token ([#64](https://github.com/sanity-io/sdk/issues/64)) ([9d18fbf](https://github.com/sanity-io/sdk/commit/9d18fbfd2fc2708e0f9505617343720c5d7fafb0))
- **react:** add AuthBoundary ([#102](https://github.com/sanity-io/sdk/issues/102)) ([bd657a0](https://github.com/sanity-io/sdk/commit/bd657a058c4ae0989018503fe2fafa319fcdbc7d))
- refactor to internal auth store ([#95](https://github.com/sanity-io/sdk/issues/95)) ([5807a2b](https://github.com/sanity-io/sdk/commit/5807a2b0b823f9187c25ab82233ad6d30df664f1))
- replace jsdoc with tsdoc ([#75](https://github.com/sanity-io/sdk/issues/75)) ([7074a38](https://github.com/sanity-io/sdk/commit/7074a383b58de66fe2a9badc7122d0345e354b2a))

### Bug Fixes

- add lint to turbo.json and run prettier ([909f0d3](https://github.com/sanity-io/sdk/commit/909f0d34339c9c8ff8c013dfa13e5d607a2012fc))
- **deps:** Update eslint-tooling ([#69](https://github.com/sanity-io/sdk/issues/69)) ([d9d8e09](https://github.com/sanity-io/sdk/commit/d9d8e099e4711bb6ae90e926ce804715f56ef5d3))
- mark packages as private for now ([#11](https://github.com/sanity-io/sdk/issues/11)) ([a103825](https://github.com/sanity-io/sdk/commit/a1038257192e2c493132b96233d461bdd9a31744))
- package access and version ([#89](https://github.com/sanity-io/sdk/issues/89)) ([c4eb26d](https://github.com/sanity-io/sdk/commit/c4eb26dac12ec56c5a569c8edc895ffcd46a63a7))
