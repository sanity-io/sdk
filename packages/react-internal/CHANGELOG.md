# Changelog

## [0.0.0-alpha.29](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.28...sdk-react-internal-v0.0.0-alpha.29) (2025-04-23)


### Bug Fixes

* **build:** fixes build to not include node libraries ([#456](https://github.com/sanity-io/sdk/issues/456)) ([11a8d8a](https://github.com/sanity-io/sdk/commit/11a8d8a6c35dcfd0eeba3f5ca926b5e263aa56e8))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/sdk-react bumped to 0.0.0-alpha.29

## [0.0.0-alpha.28](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.27...sdk-react-internal-v0.0.0-alpha.28) (2025-04-22)


### Bug Fixes

* **core:** refactor calculatePermissions to fix initialization error ([#443](https://github.com/sanity-io/sdk/issues/443)) ([e59d6e5](https://github.com/sanity-io/sdk/commit/e59d6e54b1da22194446ffffc747ddbf0711f134))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/sdk-react bumped to 0.0.0-alpha.28

## [0.0.0-alpha.27](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.26...sdk-react-internal-v0.0.0-alpha.27) (2025-04-22)


### Miscellaneous

* **sdk-react-internal:** Synchronize sdk versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/sdk-react bumped to 0.0.0-alpha.27

## [0.0.0-alpha.26](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.25...sdk-react-internal-v0.0.0-alpha.26) (2025-04-21)


### Bug Fixes

* **deps:** update dependency @sanity/ui to ^2.15.13 ([#426](https://github.com/sanity-io/sdk/issues/426)) ([ec2cbc5](https://github.com/sanity-io/sdk/commit/ec2cbc569b05c1b980bbd4ffe61994872bf1ec4f))


### Documentation

* fix duplication/entrypoints; add SDK Core note ([#430](https://github.com/sanity-io/sdk/issues/430)) ([f1046fa](https://github.com/sanity-io/sdk/commit/f1046faec1c70d3690ddc9b4d4f92d7c433178a2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/sdk-react bumped to 0.0.0-alpha.26

## [0.0.0-alpha.25](https://github.com/sanity-io/sdk/compare/v0.0.0-alpha.24...v0.0.0-alpha.25) (2025-04-09)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/sdk-react bumped to 0.0.0-alpha.25

## [0.0.0-alpha.24](https://github.com/sanity-io/sdk/compare/v0.0.0-alpha.23...v0.0.0-alpha.24) (2025-04-09)


### ⚠ BREAKING CHANGES

* use hosted login for standalone apps ([#386](https://github.com/sanity-io/sdk/issues/386))
* replace `sanityConfigs` prop with `config` prop in `<SanityApp />` and `<SDKProvider />`
* replace `resourceId` concept with explicit `projectId` and `dataset` fields in handles
* rename `_type` to `documentType` in DocumentHandle interface and related usages
* rename `_id` to `documentId` in DocumentHandle interface and related usages
* update document hooks and actions to expect `DocumentHandle` props
* update project and dataset hooks to use `ProjectHandle` or `DatasetHandle`
* remove `<SanityProvider />`, introduce `<ResourceProvider />` for configuration
* rename useHandleCallback → useHandleAuthCallback and HandleCallback → HandleAuthCallback ([#358](https://github.com/sanity-io/sdk/issues/358))
* **react:** flatten sdk-react imports ([#319](https://github.com/sanity-io/sdk/issues/319))
* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271))

### Features

* add sdk-react-internal package and remove @sanity/ui package ([#193](https://github.com/sanity-io/sdk/issues/193)) ([7fa201e](https://github.com/sanity-io/sdk/commit/7fa201ee49b75bbc71a741503ed0336f94785201))
* add versions information to all packages ([#275](https://github.com/sanity-io/sdk/issues/275)) ([afb2fec](https://github.com/sanity-io/sdk/commit/afb2fec63ea3bae53cab9d8f05081daf2f3c2733))
* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271)) ([6f4d541](https://github.com/sanity-io/sdk/commit/6f4d5410671e8b75759e33380464656a8c961ad6))
* introduce consistent Handle pattern (`ProjectHandle`, `DatasetHandle`, `DocumentHandle`) across the SDK ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* **react:** add react compiler to the build process ([#298](https://github.com/sanity-io/sdk/issues/298)) ([bfb74eb](https://github.com/sanity-io/sdk/commit/bfb74ebe538b1218a980b03493890b70dc1311d2))
* **react:** flatten sdk-react imports ([#319](https://github.com/sanity-io/sdk/issues/319)) ([3922025](https://github.com/sanity-io/sdk/commit/3922025569abfa4cd824e81222495913875246d7))
* remove `<SanityProvider />`, introduce `<ResourceProvider />` for configuration ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* rename `_id` to `documentId` in DocumentHandle interface and related usages ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* rename `_type` to `documentType` in DocumentHandle interface and related usages ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* replace `resourceId` concept with explicit `projectId` and `dataset` fields in handles ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* replace `sanityConfigs` prop with `config` prop in `<SanityApp />` and `<SDKProvider />` ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* update document hooks and actions to expect `DocumentHandle` props ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* update project and dataset hooks to use `ProjectHandle` or `DatasetHandle` ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* update query and list hooks to accept optional `DatasetHandle` for configuration ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* use hosted login for standalone apps ([#386](https://github.com/sanity-io/sdk/issues/386)) ([9c1ad58](https://github.com/sanity-io/sdk/commit/9c1ad58bc0b302073c90dd6e584f566eba3d0d17))


### Bug Fixes

* **deps:** update dependency react-error-boundary to v5 ([#334](https://github.com/sanity-io/sdk/issues/334)) ([a128d7c](https://github.com/sanity-io/sdk/commit/a128d7c7a64f0e724028e0a6f0e0e2f17a399f82))
* **deps:** update pkg-utils to v7 ([#384](https://github.com/sanity-io/sdk/issues/384)) ([ce9a952](https://github.com/sanity-io/sdk/commit/ce9a952a295a32ec86c12cbf9b967128ba5eaf4f))
* **deps:** Update vitest monorepo to v3 ([#250](https://github.com/sanity-io/sdk/issues/250)) ([4e33d12](https://github.com/sanity-io/sdk/commit/4e33d123d6f5415073e8d64b9b4a6aadb2146f83))
* fix typedoc annotations for hooks ([#361](https://github.com/sanity-io/sdk/issues/361)) ([778a63a](https://github.com/sanity-io/sdk/commit/778a63ac5cb52ed6c1e28b1ff22605caad54db33))
* handle env variable for react and react-internal ([#294](https://github.com/sanity-io/sdk/issues/294)) ([0b733ff](https://github.com/sanity-io/sdk/commit/0b733ffbe00bbcb8c29fbee6628ba53c704e1c11))
* **react:** remove react compiler runtime package ([#311](https://github.com/sanity-io/sdk/issues/311)) ([08046b5](https://github.com/sanity-io/sdk/commit/08046b565b187cad00f45f8790940e5735a77d5a))
* trigger release ([#210](https://github.com/sanity-io/sdk/issues/210)) ([2b36c98](https://github.com/sanity-io/sdk/commit/2b36c985a91d44be95a9e6c8446e9a11ffa59d61))


### Code Refactoring

* rename useHandleCallback → useHandleAuthCallback and HandleCallback → HandleAuthCallback ([#358](https://github.com/sanity-io/sdk/issues/358)) ([014dc69](https://github.com/sanity-io/sdk/commit/014dc695320273b4e166d946753e851c9701d159))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @sanity/sdk-react bumped to 0.0.0-alpha.24

## [0.0.0-alpha.6](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.5...sdk-react-internal-v0.0.0-alpha.6) (2025-04-03)


### ⚠ BREAKING CHANGES

* use hosted login for standalone apps ([#386](https://github.com/sanity-io/sdk/issues/386))
* replace `sanityConfigs` prop with `config` prop in `<SanityApp />` and `<SDKProvider />`
* replace `resourceId` concept with explicit `projectId` and `dataset` fields in handles
* rename `_type` to `documentType` in DocumentHandle interface and related usages
* rename `_id` to `documentId` in DocumentHandle interface and related usages
* update document hooks and actions to expect `DocumentHandle` props
* update project and dataset hooks to use `ProjectHandle` or `DatasetHandle`
* remove `<SanityProvider />`, introduce `<ResourceProvider />` for configuration

### Features

* introduce consistent Handle pattern (`ProjectHandle`, `DatasetHandle`, `DocumentHandle`) across the SDK ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* remove `<SanityProvider />`, introduce `<ResourceProvider />` for configuration ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* rename `_id` to `documentId` in DocumentHandle interface and related usages ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* rename `_type` to `documentType` in DocumentHandle interface and related usages ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* replace `resourceId` concept with explicit `projectId` and `dataset` fields in handles ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* replace `sanityConfigs` prop with `config` prop in `<SanityApp />` and `<SDKProvider />` ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* update document hooks and actions to expect `DocumentHandle` props ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* update project and dataset hooks to use `ProjectHandle` or `DatasetHandle` ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* update query and list hooks to accept optional `DatasetHandle` for configuration ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* use hosted login for standalone apps ([#386](https://github.com/sanity-io/sdk/issues/386)) ([9c1ad58](https://github.com/sanity-io/sdk/commit/9c1ad58bc0b302073c90dd6e584f566eba3d0d17))


### Bug Fixes

* **deps:** update pkg-utils to v7 ([#384](https://github.com/sanity-io/sdk/issues/384)) ([ce9a952](https://github.com/sanity-io/sdk/commit/ce9a952a295a32ec86c12cbf9b967128ba5eaf4f))

## [0.0.0-alpha.5](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.4...sdk-react-internal-v0.0.0-alpha.5) (2025-03-25)


### ⚠ BREAKING CHANGES

* rename useHandleCallback → useHandleAuthCallback and HandleCallback → HandleAuthCallback ([#358](https://github.com/sanity-io/sdk/issues/358))

### Bug Fixes

* fix typedoc annotations for hooks ([#361](https://github.com/sanity-io/sdk/issues/361)) ([778a63a](https://github.com/sanity-io/sdk/commit/778a63ac5cb52ed6c1e28b1ff22605caad54db33))


### Code Refactoring

* rename useHandleCallback → useHandleAuthCallback and HandleCallback → HandleAuthCallback ([#358](https://github.com/sanity-io/sdk/issues/358)) ([014dc69](https://github.com/sanity-io/sdk/commit/014dc695320273b4e166d946753e851c9701d159))

## [0.0.0-alpha.4](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.3...sdk-react-internal-v0.0.0-alpha.4) (2025-03-21)


### Bug Fixes

* **deps:** update dependency react-error-boundary to v5 ([#334](https://github.com/sanity-io/sdk/issues/334)) ([a128d7c](https://github.com/sanity-io/sdk/commit/a128d7c7a64f0e724028e0a6f0e0e2f17a399f82))

## [0.0.0-alpha.3](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.2...sdk-react-internal-v0.0.0-alpha.3) (2025-03-14)


### ⚠ BREAKING CHANGES

* **react:** flatten sdk-react imports ([#319](https://github.com/sanity-io/sdk/issues/319))

### Features

* **react:** flatten sdk-react imports ([#319](https://github.com/sanity-io/sdk/issues/319)) ([3922025](https://github.com/sanity-io/sdk/commit/3922025569abfa4cd824e81222495913875246d7))

## [0.0.0-alpha.2](https://github.com/sanity-io/sdk/compare/sdk-react-internal-v0.0.0-alpha.1...sdk-react-internal-v0.0.0-alpha.2) (2025-03-14)


### ⚠ BREAKING CHANGES

* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271))

### Features

* add sdk-react-internal package and remove @sanity/ui package ([#193](https://github.com/sanity-io/sdk/issues/193)) ([7fa201e](https://github.com/sanity-io/sdk/commit/7fa201ee49b75bbc71a741503ed0336f94785201))
* add versions information to all packages ([#275](https://github.com/sanity-io/sdk/issues/275)) ([afb2fec](https://github.com/sanity-io/sdk/commit/afb2fec63ea3bae53cab9d8f05081daf2f3c2733))
* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271)) ([6f4d541](https://github.com/sanity-io/sdk/commit/6f4d5410671e8b75759e33380464656a8c961ad6))
* **react:** add react compiler to the build process ([#298](https://github.com/sanity-io/sdk/issues/298)) ([bfb74eb](https://github.com/sanity-io/sdk/commit/bfb74ebe538b1218a980b03493890b70dc1311d2))


### Bug Fixes

* **deps:** Update vitest monorepo to v3 ([#250](https://github.com/sanity-io/sdk/issues/250)) ([4e33d12](https://github.com/sanity-io/sdk/commit/4e33d123d6f5415073e8d64b9b4a6aadb2146f83))
* handle env variable for react and react-internal ([#294](https://github.com/sanity-io/sdk/issues/294)) ([0b733ff](https://github.com/sanity-io/sdk/commit/0b733ffbe00bbcb8c29fbee6628ba53c704e1c11))
* **react:** remove react compiler runtime package ([#311](https://github.com/sanity-io/sdk/issues/311)) ([08046b5](https://github.com/sanity-io/sdk/commit/08046b565b187cad00f45f8790940e5735a77d5a))
* trigger release ([#210](https://github.com/sanity-io/sdk/issues/210)) ([2b36c98](https://github.com/sanity-io/sdk/commit/2b36c985a91d44be95a9e6c8446e9a11ffa59d61))
