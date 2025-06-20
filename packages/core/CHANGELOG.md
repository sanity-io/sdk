# Changelog

## [2.0.1](https://github.com/sanity-io/sdk/compare/sdk-v2.0.0...sdk-v2.0.1) (2025-06-20)


### Features

* add new token fetching via comlink ([#475](https://github.com/sanity-io/sdk/issues/475)) ([f646d53](https://github.com/sanity-io/sdk/commit/f646d5309deabec57ebb9bc561ed1849987db5b7))


### Bug Fixes

* **core:** consider negative indexes for inserts ([#555](https://github.com/sanity-io/sdk/issues/555)) ([7a0e07a](https://github.com/sanity-io/sdk/commit/7a0e07a922b2303ffc2476d9a6712a32ded14abd))
* **core:** correct element removal order in `unset`s ([#556](https://github.com/sanity-io/sdk/issues/556)) ([7978b17](https://github.com/sanity-io/sdk/commit/7978b1709ca36334b73cb71eb898649424ebcfbf))
* **core:** correct keyed segment path representation and insert operation behavior ([#552](https://github.com/sanity-io/sdk/issues/552)) ([d8a7968](https://github.com/sanity-io/sdk/commit/d8a7968eb8544aea5280e87c524614213c406af4))
* **core:** prevent race condition in document store ([#551](https://github.com/sanity-io/sdk/issues/551)) ([d88dc29](https://github.com/sanity-io/sdk/commit/d88dc29b30562b791e3288d4d2a373919b7f6134))


### Documentation

* update readme logos ([#549](https://github.com/sanity-io/sdk/issues/549)) ([857f8ee](https://github.com/sanity-io/sdk/commit/857f8eec2811f411e7ff21668ef12853730c4368))

## [2.0.0](https://github.com/sanity-io/sdk/compare/sdk-v1.0.0...sdk-v2.0.0) (2025-05-23)


### ⚠ BREAKING CHANGES

* change `status` to `_status` in projection and preview ([#527](https://github.com/sanity-io/sdk/issues/527))

### Bug Fixes

* change `status` to `_status` in projection and preview ([#527](https://github.com/sanity-io/sdk/issues/527)) ([79f6df6](https://github.com/sanity-io/sdk/commit/79f6df6fcf5479bb144447c246e093551ed8c865))
* **core:** align release order with studio release order ([#534](https://github.com/sanity-io/sdk/issues/534)) ([afd4b2c](https://github.com/sanity-io/sdk/commit/afd4b2cd9242763403d30796afd8ad73a45dd075))
* **deps:** update dependency @sanity/client to ^7.2.1 ([#526](https://github.com/sanity-io/sdk/issues/526)) ([34b4f26](https://github.com/sanity-io/sdk/commit/34b4f260c1d639414908dd2f1dd8f375e7d1b73e))
* **deps:** update dependency @sanity/comlink to ^3.0.3 ([#525](https://github.com/sanity-io/sdk/issues/525)) ([e0599ea](https://github.com/sanity-io/sdk/commit/e0599ea7965555b16a4ae4e9b45a91a91ae94b13))
* **deps:** update dependency @sanity/comlink to ^3.0.4 ([#542](https://github.com/sanity-io/sdk/issues/542)) ([7365c97](https://github.com/sanity-io/sdk/commit/7365c97f2100367cbdc9eaa7adebdeee9f596733))


### Miscellaneous

* release 2.0.0 ([#544](https://github.com/sanity-io/sdk/issues/544)) ([048cb50](https://github.com/sanity-io/sdk/commit/048cb503ea2e7852c984c376e48ff74d2a7023be))

## [1.0.0](https://github.com/sanity-io/sdk/compare/sdk-v1.0.0...sdk-v1.0.0) (2025-05-07)


### Miscellaneous

* release 1.0.0 ([#517](https://github.com/sanity-io/sdk/issues/517)) ([52c00a1](https://github.com/sanity-io/sdk/commit/52c00a1eb99a6a34681bba363207ebcf4a9b5371))

## [0.0.3](https://github.com/sanity-io/sdk/compare/sdk-v0.0.2...sdk-v0.0.3) (2025-05-07)


### ⚠ BREAKING CHANGES

* bump versions ([#516](https://github.com/sanity-io/sdk/issues/516))

### Bug Fixes

* bump versions ([#516](https://github.com/sanity-io/sdk/issues/516)) ([3601ade](https://github.com/sanity-io/sdk/commit/3601adeebe986af4102f639500a754d585694d9e))
* **core:** use raw perspective for functions that coalesce drafts and published ([#503](https://github.com/sanity-io/sdk/issues/503)) ([0bf6c57](https://github.com/sanity-io/sdk/commit/0bf6c577183fd0796fa9c00347af258cbb9b607c))


### Documentation

* update package readmes ([#513](https://github.com/sanity-io/sdk/issues/513)) ([aa79bc7](https://github.com/sanity-io/sdk/commit/aa79bc74e904cfcac119be415d871fc71fe17277))

## [0.0.2](https://github.com/sanity-io/sdk/compare/sdk-v0.0.1...sdk-v0.0.2) (2025-05-06)


### ⚠ BREAKING CHANGES

* make all comlink hooks suspend ([#504](https://github.com/sanity-io/sdk/issues/504))

### Features

* make all comlink hooks suspend ([#504](https://github.com/sanity-io/sdk/issues/504)) ([d49bf0e](https://github.com/sanity-io/sdk/commit/d49bf0e4be9268d68dbec186ed3ba6afc075bedb))


### Bug Fixes

* **core:** bump default api versions ([#507](https://github.com/sanity-io/sdk/issues/507)) ([dc4f6f6](https://github.com/sanity-io/sdk/commit/dc4f6f67a1c86e0a30cb69ebc23c11ca06ff4ac2))
* **deps:** update dependency zustand to ^5.0.4 ([#500](https://github.com/sanity-io/sdk/issues/500)) ([0847430](https://github.com/sanity-io/sdk/commit/0847430c57d170ccbecd853f0e9621ccc74664d7))

## [0.0.1](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0...sdk-v0.0.1) (2025-05-02)


### Bug Fixes

* **docs:** remove custom docs entrypoint names ([#498](https://github.com/sanity-io/sdk/issues/498)) ([4499e85](https://github.com/sanity-io/sdk/commit/4499e85a3a30a5086bceb164c19cb18c71376471))

## 0.0.0 (2025-05-02)


### Features

* allow ~experimental_resource client option ([08b4582](https://github.com/sanity-io/sdk/commit/08b4582840ddbd39e1343b07704dfb758a4e988d))


### Bug Fixes

* **deps:** update dependency @sanity/message-protocol to ^0.12.0 ([#484](https://github.com/sanity-io/sdk/issues/484)) ([f3beb42](https://github.com/sanity-io/sdk/commit/f3beb42ddad7ad9bf7826783602d57be006c15ee))


### Miscellaneous

* release 0.0.0 ([08c9acc](https://github.com/sanity-io/sdk/commit/08c9acc0a34954cd611a53753fac2b788b61da9b))

## [0.0.0-alpha.31](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.30...sdk-v0.0.0-alpha.31) (2025-05-01)


### Bug Fixes

* **deps:** update dependency @sanity/comlink to ^3.0.2 ([#482](https://github.com/sanity-io/sdk/issues/482)) ([f9b3eca](https://github.com/sanity-io/sdk/commit/f9b3eca4a0a21a456ebda46b42b836efd9f7718f))

## [0.0.0-alpha.30](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.29...sdk-v0.0.0-alpha.30) (2025-05-01)


### ⚠ BREAKING CHANGES

* fetch favorites from dashboard ([#437](https://github.com/sanity-io/sdk/issues/437))

### Features

* add releases store ([#420](https://github.com/sanity-io/sdk/issues/420)) ([b5a376c](https://github.com/sanity-io/sdk/commit/b5a376c86e700031fe1700fb55b7f0d1236aaea3))
* **auth:** add studio mode ([#429](https://github.com/sanity-io/sdk/issues/429)) ([cef0f72](https://github.com/sanity-io/sdk/commit/cef0f7229d519709b4f069b982110c32a4d23217))
* fetch favorites from dashboard ([#437](https://github.com/sanity-io/sdk/issues/437)) ([1a8ecb8](https://github.com/sanity-io/sdk/commit/1a8ecb89217b05c6ed90699c7ee162592cedb896))
* integrate typegen ([#452](https://github.com/sanity-io/sdk/issues/452)) ([8416864](https://github.com/sanity-io/sdk/commit/8416864533f0f14851e8e71c15be4a1596711b52))
* verify projects match current org for dashboard apps ([#464](https://github.com/sanity-io/sdk/issues/464)) ([52c8c76](https://github.com/sanity-io/sdk/commit/52c8c7668f09b119d6ca618381e1a44d134612a3))


### Bug Fixes

* **deps:** update dependency @sanity/client to ^6.29.1 ([#466](https://github.com/sanity-io/sdk/issues/466)) ([f25ba2b](https://github.com/sanity-io/sdk/commit/f25ba2b2aa32e3c010a6adf5658367c6fa3e149e))
* **deps:** update dependency @sanity/client to v7 ([#478](https://github.com/sanity-io/sdk/issues/478)) ([e5ed504](https://github.com/sanity-io/sdk/commit/e5ed5047c84c3864cdbebd2c158184d57dfdaff9))


### Documentation

* cleanup for Apr 30 ([#479](https://github.com/sanity-io/sdk/issues/479)) ([8793c1e](https://github.com/sanity-io/sdk/commit/8793c1e0d93bc9184d9a65f6e11d35dc148e4ac5))
* update readmes ([#474](https://github.com/sanity-io/sdk/issues/474)) ([042a853](https://github.com/sanity-io/sdk/commit/042a85316c8179b8a135abbae4d66a4e467f5ee0))

## [0.0.0-alpha.29](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.28...sdk-v0.0.0-alpha.29) (2025-04-23)


### Features

* **auth:** check for a token being passed into the url hash from the dashboard ([#451](https://github.com/sanity-io/sdk/issues/451)) ([59893e2](https://github.com/sanity-io/sdk/commit/59893e2216acdf01f5187617cd42b2bc3760a068))


### Bug Fixes

* **build:** fixes build to not include node libraries ([#456](https://github.com/sanity-io/sdk/issues/456)) ([11a8d8a](https://github.com/sanity-io/sdk/commit/11a8d8a6c35dcfd0eeba3f5ca926b5e263aa56e8))

## [0.0.0-alpha.28](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.27...sdk-v0.0.0-alpha.28) (2025-04-22)


### Bug Fixes

* **core:** refactor calculatePermissions to fix initialization error ([#443](https://github.com/sanity-io/sdk/issues/443)) ([e59d6e5](https://github.com/sanity-io/sdk/commit/e59d6e54b1da22194446ffffc747ddbf0711f134))

## [0.0.0-alpha.27](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.26...sdk-v0.0.0-alpha.27) (2025-04-22)


### Miscellaneous

* **sdk:** Synchronize sdk versions

## [0.0.0-alpha.26](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.25...sdk-v0.0.0-alpha.26) (2025-04-21)


### Features

* **auth:** don't store tokens in localstorage if running in dashboard ([#409](https://github.com/sanity-io/sdk/issues/409)) ([637f17c](https://github.com/sanity-io/sdk/commit/637f17cc3d38037a0fbc3020173ef619c24acbc1))


### Bug Fixes

* **auth:** ensure initial url does not contain an sid and improve error handling ([#418](https://github.com/sanity-io/sdk/issues/418)) ([4d76bfc](https://github.com/sanity-io/sdk/commit/4d76bfc52542896128efd7cbd6d5342f1c275cd5))
* **authentication:** use web lock to ensure only one token refresh process runs over multiple tabs ([#398](https://github.com/sanity-io/sdk/issues/398)) ([64aa9fa](https://github.com/sanity-io/sdk/commit/64aa9fa0ecd4efeda8dd6ff7277a272d7e0945a8))
* **auth:** fix bug with incorrect refreshing with newly acquired tokens ([#422](https://github.com/sanity-io/sdk/issues/422)) ([1218361](https://github.com/sanity-io/sdk/commit/121836143486c7c40d770ed5748d9c09b4911e9f))
* **core:** allow multiple projections per doc ([#403](https://github.com/sanity-io/sdk/issues/403)) ([d30c5ae](https://github.com/sanity-io/sdk/commit/d30c5ae58de5710cd6ed6bbcaa83fb02c29b7e6c))
* **deps:** update dependency @sanity/client to ^6.29.0 ([#435](https://github.com/sanity-io/sdk/issues/435)) ([c6c7b35](https://github.com/sanity-io/sdk/commit/c6c7b35f0e71c5e40747866704b7b16ebf10e4fb))
* **deps:** update dependency @sanity/types to ^3.83.0 ([#412](https://github.com/sanity-io/sdk/issues/412)) ([b40b289](https://github.com/sanity-io/sdk/commit/b40b289ea67026e7f0a0b7a2f95486e7a27a71c1))
* **deps:** update dependency rxjs to ^7.8.2 ([#427](https://github.com/sanity-io/sdk/issues/427)) ([cbbf964](https://github.com/sanity-io/sdk/commit/cbbf9645eb2b4d43746d6283e237fbdfd5068080))


### Documentation

* fix duplication/entrypoints; add SDK Core note ([#430](https://github.com/sanity-io/sdk/issues/430)) ([f1046fa](https://github.com/sanity-io/sdk/commit/f1046faec1c70d3690ddc9b4d4f92d7c433178a2))

## [0.0.0-alpha.25](https://github.com/sanity-io/sdk/compare/v0.0.0-alpha.24...v0.0.0-alpha.25) (2025-04-09)


### Features

* **core, react:** introduce createGroqSearchFilter utility for search ([#407](https://github.com/sanity-io/sdk/issues/407)) ([77766bb](https://github.com/sanity-io/sdk/commit/77766bbf3fdc7efef4cd8a24f0ca206bef3179ec))


### Bug Fixes

* **deps:** update dependency zustand to ^5.0.3 ([#404](https://github.com/sanity-io/sdk/issues/404)) ([a1ff448](https://github.com/sanity-io/sdk/commit/a1ff448d4fd5370d9d868e5da19348247fc30ddc))

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
* rename usePermissions → useDocumentPermissions ([#365](https://github.com/sanity-io/sdk/issues/365))
* rename useActions → useDocumentActions and useActions → useDocumentActions ([#362](https://github.com/sanity-io/sdk/issues/362))
* rename useHandleCallback → useHandleAuthCallback and HandleCallback → HandleAuthCallback ([#358](https://github.com/sanity-io/sdk/issues/358))
* rename `results` to `data` for useProjection hook ([#335](https://github.com/sanity-io/sdk/issues/335))
* rename `result` to `data` for usePreview hook ([#325](https://github.com/sanity-io/sdk/issues/325))
* **react:** flatten sdk-react imports ([#319](https://github.com/sanity-io/sdk/issues/319))
* remove `schema` from sanity config
* remove schema state and schema manager
* remove `useDocuments` and `useSearch` hooks
* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271))
* renames `org` auth scope to `global` ([#187](https://github.com/sanity-io/sdk/issues/187))

### Features

* `createStore` prototype ([#46](https://github.com/sanity-io/sdk/issues/46)) ([d3d69f8](https://github.com/sanity-io/sdk/commit/d3d69f8164ed406c77a3586a8a29987fd5aa1b2e))
* `useProjects`, `useProject`, `useDatasets` ([#235](https://github.com/sanity-io/sdk/issues/235)) ([cc95dfd](https://github.com/sanity-io/sdk/commit/cc95dfd45a82171fa7ccf05a8ca331e8de97fbee))
* add `useQuery`, `useInfiniteList`, `usePaginatedList` hooks ([1a3f4ad](https://github.com/sanity-io/sdk/commit/1a3f4ad98abf2ab68c552fea20d60639462f3aac))
* add authorization ([#52](https://github.com/sanity-io/sdk/issues/52)) ([59501f1](https://github.com/sanity-io/sdk/commit/59501f1525e271e8d724c4eb69a27f01726bb64e))
* add document list store ([#58](https://github.com/sanity-io/sdk/issues/58)) ([b66ea04](https://github.com/sanity-io/sdk/commit/b66ea04a386207704512a4b5cd1c5e77e0a48eb6))
* add hooks for AuthStore ([#91](https://github.com/sanity-io/sdk/issues/91)) ([4367719](https://github.com/sanity-io/sdk/commit/43677193fccc08fcf7074f906edf2acdfc440e1c))
* add preview store ([#62](https://github.com/sanity-io/sdk/issues/62)) ([c343f1e](https://github.com/sanity-io/sdk/commit/c343f1e15f30afd66dbd4c0309b9152600ceb1be))
* add React and Vitest ([#3](https://github.com/sanity-io/sdk/issues/3)) ([e55dc32](https://github.com/sanity-io/sdk/commit/e55dc32f080ffaa7470bdcb2ed97f992cfcbe584))
* add session hooks and store ([#59](https://github.com/sanity-io/sdk/issues/59)) ([65ac911](https://github.com/sanity-io/sdk/commit/65ac9111d79211aee621f7bfed47bb5cfcf565e1))
* add storybook and dev affordances ([#6](https://github.com/sanity-io/sdk/issues/6)) ([15b45e8](https://github.com/sanity-io/sdk/commit/15b45e8d7821ec7abc1852998143e19553c06f1e))
* add turborepo ([#2](https://github.com/sanity-io/sdk/issues/2)) ([19c53e1](https://github.com/sanity-io/sdk/commit/19c53e1408edacbda4105c75c6fa5c4fe0a6b744))
* add TypeDoc ([#43](https://github.com/sanity-io/sdk/issues/43)) ([2274873](https://github.com/sanity-io/sdk/commit/227487372c1d04799f7c2ed06839dae06113887c))
* add useClient hook ([#96](https://github.com/sanity-io/sdk/issues/96)) ([c50883b](https://github.com/sanity-io/sdk/commit/c50883bbf3eed32977a1033615582690234154fc))
* add useDashboardOrganizationId hook ([#339](https://github.com/sanity-io/sdk/issues/339)) ([401468e](https://github.com/sanity-io/sdk/commit/401468e07b8c74deb02d4b7df78af808bddd9242))
* add useProjection hook ([#257](https://github.com/sanity-io/sdk/issues/257)) ([fbaafe0](https://github.com/sanity-io/sdk/commit/fbaafe031e235f61b9d60bf5938f18a4683aafe5))
* add useUsers hook ([#239](https://github.com/sanity-io/sdk/issues/239)) ([b89bcf0](https://github.com/sanity-io/sdk/commit/b89bcf00bc4a849409ae80f45b1917cb1e51c66e))
* add versions information to all packages ([#275](https://github.com/sanity-io/sdk/issues/275)) ([afb2fec](https://github.com/sanity-io/sdk/commit/afb2fec63ea3bae53cab9d8f05081daf2f3c2733))
* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271)) ([6f4d541](https://github.com/sanity-io/sdk/commit/6f4d5410671e8b75759e33380464656a8c961ad6))
* **auth:** fetch current user when token is present ([#92](https://github.com/sanity-io/sdk/issues/92)) ([f38008c](https://github.com/sanity-io/sdk/commit/f38008c71d55bb3b54bbf5318045a52a918084c2))
* **auth:** refresh stamped tokens ([#225](https://github.com/sanity-io/sdk/issues/225)) ([10b2745](https://github.com/sanity-io/sdk/commit/10b2745c62f9169b8cd1c66d7fb641d7fda37429))
* AuthStore ([#79](https://github.com/sanity-io/sdk/issues/79)) ([f52e68e](https://github.com/sanity-io/sdk/commit/f52e68e43d5552b061415aba6c2758bcd6243c7c))
* **client:** add a global api client ([#209](https://github.com/sanity-io/sdk/issues/209)) ([5898b1d](https://github.com/sanity-io/sdk/commit/5898b1d82fc07d12f736d1361e48287e41ae0608))
* **core:** add comlink controller and channel store ([#141](https://github.com/sanity-io/sdk/issues/141)) ([cf1e5d5](https://github.com/sanity-io/sdk/commit/cf1e5d5a8cbcb27beacba2362b462176071200e4))
* **core:** add comlink node store ([#156](https://github.com/sanity-io/sdk/issues/156)) ([a080357](https://github.com/sanity-io/sdk/commit/a0803574dacbe86455fc60b1b9f3775ea33e7a89))
* **core:** add README and npm keywords ([#115](https://github.com/sanity-io/sdk/issues/115)) ([8a3c492](https://github.com/sanity-io/sdk/commit/8a3c4928647f6e8c4a8fe3f43da9cb8e904af522))
* **core:** create client store ([#38](https://github.com/sanity-io/sdk/issues/38)) ([8545333](https://github.com/sanity-io/sdk/commit/8545333c02c5691674e90be19951458ab3abbd6a))
* **core:** update client store to subscribe to changes in auth ([#85](https://github.com/sanity-io/sdk/issues/85)) ([a42d58d](https://github.com/sanity-io/sdk/commit/a42d58d3227e7d884a5449192f176e66bf404144))
* **core:** use separate client for auth and refresh client store with token ([#64](https://github.com/sanity-io/sdk/issues/64)) ([9d18fbf](https://github.com/sanity-io/sdk/commit/9d18fbfd2fc2708e0f9505617343720c5d7fafb0))
* create sanity instance and store map ([#40](https://github.com/sanity-io/sdk/issues/40)) ([a7bf3e1](https://github.com/sanity-io/sdk/commit/a7bf3e12ea0f36ee63e42b4ba9088a9413b0742b))
* **document hooks:** update the documentation for the Document hook s an optional resourceId ([#280](https://github.com/sanity-io/sdk/issues/280)) ([eb65378](https://github.com/sanity-io/sdk/commit/eb65378c884f3aaf9b2c0dbc95dd86075c76f9e0))
* document permissions ([#226](https://github.com/sanity-io/sdk/issues/226)) ([107f434](https://github.com/sanity-io/sdk/commit/107f4349d7defab04d1282ee1ab20766d157eab7))
* document store ([#197](https://github.com/sanity-io/sdk/issues/197)) ([497bb26](https://github.com/sanity-io/sdk/commit/497bb2641d5766128dfca4db8247f2f9555b83b1))
* export the SanityDocument type ([#221](https://github.com/sanity-io/sdk/issues/221)) ([dc6dbc8](https://github.com/sanity-io/sdk/commit/dc6dbc85fe6d80c6e3b08de76e666da340aa62f6))
* introduce consistent Handle pattern (`ProjectHandle`, `DatasetHandle`, `DocumentHandle`) across the SDK ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* **kitchen-sink:** add routing to kitchen-sink ([#99](https://github.com/sanity-io/sdk/issues/99)) ([50483ea](https://github.com/sanity-io/sdk/commit/50483ea66073bfccdc28e51f7606673eb213bebe))
* make packages public ([#320](https://github.com/sanity-io/sdk/issues/320)) ([8c94c29](https://github.com/sanity-io/sdk/commit/8c94c29b0aadd86273db59da1b0577aad682d6e9))
* **react:** add AuthBoundary ([#102](https://github.com/sanity-io/sdk/issues/102)) ([bd657a0](https://github.com/sanity-io/sdk/commit/bd657a058c4ae0989018503fe2fafa319fcdbc7d))
* **react:** add react compiler to the build process ([#298](https://github.com/sanity-io/sdk/issues/298)) ([bfb74eb](https://github.com/sanity-io/sdk/commit/bfb74ebe538b1218a980b03493890b70dc1311d2))
* **react:** add useDocuments hook ([#98](https://github.com/sanity-io/sdk/issues/98)) ([d0f0c1a](https://github.com/sanity-io/sdk/commit/d0f0c1ad753b56b7e7cc6ff0830682d4fc6be0d1))
* **react:** flatten sdk-react imports ([#319](https://github.com/sanity-io/sdk/issues/319)) ([3922025](https://github.com/sanity-io/sdk/commit/3922025569abfa4cd824e81222495913875246d7))
* refactor to internal auth store ([#95](https://github.com/sanity-io/sdk/issues/95)) ([5807a2b](https://github.com/sanity-io/sdk/commit/5807a2b0b823f9187c25ab82233ad6d30df664f1))
* remove `<SanityProvider />`, introduce `<ResourceProvider />` for configuration ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* remove `schema` from sanity config ([6257fe3](https://github.com/sanity-io/sdk/commit/6257fe39b4521ace71db54f1d0d173a6019db38d))
* remove `useDocuments` and `useSearch` hooks ([9f37daf](https://github.com/sanity-io/sdk/commit/9f37daf1243ee0fda558ffd7259c45da9e4ba259))
* remove schema state and schema manager ([6257fe3](https://github.com/sanity-io/sdk/commit/6257fe39b4521ace71db54f1d0d173a6019db38d))
* rename `_id` to `documentId` in DocumentHandle interface and related usages ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* rename `_type` to `documentType` in DocumentHandle interface and related usages ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* rename `result` to `data` for usePreview hook ([#325](https://github.com/sanity-io/sdk/issues/325)) ([1e5813e](https://github.com/sanity-io/sdk/commit/1e5813e2e26a72c463cafa8c5502043176930a5b))
* rename `results` to `data` for useProjection hook ([#335](https://github.com/sanity-io/sdk/issues/335)) ([026dd26](https://github.com/sanity-io/sdk/commit/026dd26bffb9fc2a03801ef05a8d075a2968c725))
* rename useActions → useDocumentActions and useActions → useDocumentActions ([#362](https://github.com/sanity-io/sdk/issues/362)) ([c753897](https://github.com/sanity-io/sdk/commit/c75389759a57c6da5ad306dbac46c6d58b4f8dda))
* rename usePermissions → useDocumentPermissions ([#365](https://github.com/sanity-io/sdk/issues/365)) ([6ca2ada](https://github.com/sanity-io/sdk/commit/6ca2ada0b0d9a0633d46ccf8c0170c1712a3afb4))
* replace `resourceId` concept with explicit `projectId` and `dataset` fields in handles ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* replace `sanityConfigs` prop with `config` prop in `<SanityApp />` and `<SDKProvider />` ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* replace jsdoc with tsdoc ([#75](https://github.com/sanity-io/sdk/issues/75)) ([7074a38](https://github.com/sanity-io/sdk/commit/7074a383b58de66fe2a9badc7122d0345e354b2a))
* resolve preview projections ([#130](https://github.com/sanity-io/sdk/issues/130)) ([d30997e](https://github.com/sanity-io/sdk/commit/d30997e4a3d40c0edd1b3f31f48934bf846ab56a))
* store Dashboard context ([#307](https://github.com/sanity-io/sdk/issues/307)) ([a6c454e](https://github.com/sanity-io/sdk/commit/a6c454e33acea6d33d004751615b226bd60c49b3))
* update document hooks and actions to expect `DocumentHandle` props ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* update project and dataset hooks to use `ProjectHandle` or `DatasetHandle` ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* update query and list hooks to accept optional `DatasetHandle` for configuration ([969d70e](https://github.com/sanity-io/sdk/commit/969d70e41f6987234323f99753f5cf937469532b))
* use hosted login for standalone apps ([#386](https://github.com/sanity-io/sdk/issues/386)) ([9c1ad58](https://github.com/sanity-io/sdk/commit/9c1ad58bc0b302073c90dd6e584f566eba3d0d17))
* use projection for previews and remove schema usage ([6257fe3](https://github.com/sanity-io/sdk/commit/6257fe39b4521ace71db54f1d0d173a6019db38d))


### Bug Fixes

* add access api types inside the SDK ([#261](https://github.com/sanity-io/sdk/issues/261)) ([ff53123](https://github.com/sanity-io/sdk/commit/ff53123f2e01a242c22df22b9dc109d2cbc3b1d4))
* add lint to turbo.json and run prettier ([909f0d3](https://github.com/sanity-io/sdk/commit/909f0d34339c9c8ff8c013dfa13e5d607a2012fc))
* all client requests are properly tagged ([#274](https://github.com/sanity-io/sdk/issues/274)) ([6df8938](https://github.com/sanity-io/sdk/commit/6df893891e7b12eff122de5147ab03b65b51bcbe))
* **auth:** ensure that authStore is a true shared resource store ([#371](https://github.com/sanity-io/sdk/issues/371)) ([1709d95](https://github.com/sanity-io/sdk/commit/1709d95dd62082b5e46ae909e2531448ff979074))
* **auth:** only attempt to refresh stamped tokens ([#304](https://github.com/sanity-io/sdk/issues/304)) ([b08a319](https://github.com/sanity-io/sdk/commit/b08a3194a061031400e2ded654269adf71130ea5))
* **build:** fixes build warning ([#252](https://github.com/sanity-io/sdk/issues/252)) ([bed82f8](https://github.com/sanity-io/sdk/commit/bed82f8d87521dd0cc9d827af5a7f908749ad711))
* **comlink:** expose statuses and destroy unused resources ([#233](https://github.com/sanity-io/sdk/issues/233)) ([8b8a40c](https://github.com/sanity-io/sdk/commit/8b8a40c5ac0b5ba76cda043ffc9bc3b740bce5bd))
* **core:** add correct perspective to useProjection ([#295](https://github.com/sanity-io/sdk/issues/295)) ([8792e00](https://github.com/sanity-io/sdk/commit/8792e00db7f5f5926e5c311e5cf0bf74bc78f041))
* **core:** add raw perspective to client ([#237](https://github.com/sanity-io/sdk/issues/237)) ([202c4ba](https://github.com/sanity-io/sdk/commit/202c4ba7bb9fdbc7f635ac8691ba840717cafc69))
* **core:** determine env for version ([#293](https://github.com/sanity-io/sdk/issues/293)) ([643eac4](https://github.com/sanity-io/sdk/commit/643eac4c69c117c7b08866afb1f92b32010c9a83))
* **core:** emit current token state on subscribe ([#139](https://github.com/sanity-io/sdk/issues/139)) ([7ec0d98](https://github.com/sanity-io/sdk/commit/7ec0d984f2c7f2da519206165cb7a2c1e2213c79))
* **core:** fixes apiVersion in usersStore ([#262](https://github.com/sanity-io/sdk/issues/262)) ([248eb19](https://github.com/sanity-io/sdk/commit/248eb192dc331ce64c05721172f2855a44dad0ca))
* **core:** use drafts instead of previewDrafts ([#279](https://github.com/sanity-io/sdk/issues/279)) ([45305ad](https://github.com/sanity-io/sdk/commit/45305ad0ecc72d60ca1ccba15703bb8a0a6a53f5))
* correct auth state subscription ([#101](https://github.com/sanity-io/sdk/issues/101)) ([9ba03d0](https://github.com/sanity-io/sdk/commit/9ba03d03f00df6d6aac29036cdca6a880fb3c52d))
* **deps:** update dependency @sanity/client to ^6.28.3 ([#287](https://github.com/sanity-io/sdk/issues/287)) ([fc5c5a1](https://github.com/sanity-io/sdk/commit/fc5c5a1fd54bca5b7b7138e4cab49113449eebe2))
* **deps:** update dependency @sanity/comlink to v3 ([#296](https://github.com/sanity-io/sdk/issues/296)) ([14fbe1b](https://github.com/sanity-io/sdk/commit/14fbe1b89a79d2532e8735a58abbe4a5cff6d635))
* **deps:** update dependency @sanity/mutate to ^0.12.4 ([#395](https://github.com/sanity-io/sdk/issues/395)) ([6cbb54a](https://github.com/sanity-io/sdk/commit/6cbb54a343b81fb0da0bd4852b1bdf36ae29de42))
* **deps:** Update eslint-tooling ([#69](https://github.com/sanity-io/sdk/issues/69)) ([d9d8e09](https://github.com/sanity-io/sdk/commit/d9d8e099e4711bb6ae90e926ce804715f56ef5d3))
* **deps:** update pkg-utils to v7 ([#384](https://github.com/sanity-io/sdk/issues/384)) ([ce9a952](https://github.com/sanity-io/sdk/commit/ce9a952a295a32ec86c12cbf9b967128ba5eaf4f))
* **deps:** Update sanity monorepo to ^3.78.1 ([#297](https://github.com/sanity-io/sdk/issues/297)) ([835b594](https://github.com/sanity-io/sdk/commit/835b5942d3870a92e0fd1387ab9baa5e555a3ee5))
* **deps:** upgrade `@sanity/client`, do not use `withCredentials` ([#368](https://github.com/sanity-io/sdk/issues/368)) ([8e1cbd9](https://github.com/sanity-io/sdk/commit/8e1cbd92501892bf116c3a3473ae693062518f89))
* environment variable access for Remix ([#168](https://github.com/sanity-io/sdk/issues/168)) ([4ad3587](https://github.com/sanity-io/sdk/commit/4ad3587fd0ea262b09c3add20c2ba2bd8d5d15c2))
* fix typedoc annotations for hooks ([#361](https://github.com/sanity-io/sdk/issues/361)) ([778a63a](https://github.com/sanity-io/sdk/commit/778a63ac5cb52ed6c1e28b1ff22605caad54db33))
* initialize client with configured apiHost ([#186](https://github.com/sanity-io/sdk/issues/186)) ([13c72cb](https://github.com/sanity-io/sdk/commit/13c72cbb0dc9aa2fe1b4c0384f1cf28eb7f40d2e))
* make apiVersion required in getClient ([#230](https://github.com/sanity-io/sdk/issues/230)) ([91458d3](https://github.com/sanity-io/sdk/commit/91458d35251be6cf02592f0d4391f58838921ff8))
* mark packages as private for now ([#11](https://github.com/sanity-io/sdk/issues/11)) ([a103825](https://github.com/sanity-io/sdk/commit/a1038257192e2c493132b96233d461bdd9a31744))
* package access and version ([#89](https://github.com/sanity-io/sdk/issues/89)) ([c4eb26d](https://github.com/sanity-io/sdk/commit/c4eb26dac12ec56c5a569c8edc895ffcd46a63a7))
* trigger release ([#210](https://github.com/sanity-io/sdk/issues/210)) ([2b36c98](https://github.com/sanity-io/sdk/commit/2b36c985a91d44be95a9e6c8446e9a11ffa59d61))
* update typedoc to use package mode ([#117](https://github.com/sanity-io/sdk/issues/117)) ([7f4e0e1](https://github.com/sanity-io/sdk/commit/7f4e0e1f08610fb3861e5dc8eb67fb1556b4d965))


### Miscellaneous Chores

* renames `org` auth scope to `global` ([#187](https://github.com/sanity-io/sdk/issues/187)) ([3220d57](https://github.com/sanity-io/sdk/commit/3220d5729c8012ffc47bfa2d75bfca1f2642df76))


### Code Refactoring

* rename useHandleCallback → useHandleAuthCallback and HandleCallback → HandleAuthCallback ([#358](https://github.com/sanity-io/sdk/issues/358)) ([014dc69](https://github.com/sanity-io/sdk/commit/014dc695320273b4e166d946753e851c9701d159))

## [0.0.0-alpha.23](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.22...sdk-v0.0.0-alpha.23) (2025-04-03)


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

## [0.0.0-alpha.22](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.21...sdk-v0.0.0-alpha.22) (2025-03-28)


### Bug Fixes

* **auth:** ensure that authStore is a true shared resource store ([#371](https://github.com/sanity-io/sdk/issues/371)) ([1709d95](https://github.com/sanity-io/sdk/commit/1709d95dd62082b5e46ae909e2531448ff979074))

## [0.0.0-alpha.21](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.20...sdk-v0.0.0-alpha.21) (2025-03-27)


### Bug Fixes

* **deps:** upgrade `@sanity/client`, do not use `withCredentials` ([#368](https://github.com/sanity-io/sdk/issues/368)) ([8e1cbd9](https://github.com/sanity-io/sdk/commit/8e1cbd92501892bf116c3a3473ae693062518f89))

## [0.0.0-alpha.20](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.19...sdk-v0.0.0-alpha.20) (2025-03-25)


### ⚠ BREAKING CHANGES

* rename usePermissions → useDocumentPermissions ([#365](https://github.com/sanity-io/sdk/issues/365))
* rename useActions → useDocumentActions and useActions → useDocumentActions ([#362](https://github.com/sanity-io/sdk/issues/362))
* rename useHandleCallback → useHandleAuthCallback and HandleCallback → HandleAuthCallback ([#358](https://github.com/sanity-io/sdk/issues/358))

### Features

* rename useActions → useDocumentActions and useActions → useDocumentActions ([#362](https://github.com/sanity-io/sdk/issues/362)) ([c753897](https://github.com/sanity-io/sdk/commit/c75389759a57c6da5ad306dbac46c6d58b4f8dda))
* rename usePermissions → useDocumentPermissions ([#365](https://github.com/sanity-io/sdk/issues/365)) ([6ca2ada](https://github.com/sanity-io/sdk/commit/6ca2ada0b0d9a0633d46ccf8c0170c1712a3afb4))


### Bug Fixes

* fix typedoc annotations for hooks ([#361](https://github.com/sanity-io/sdk/issues/361)) ([778a63a](https://github.com/sanity-io/sdk/commit/778a63ac5cb52ed6c1e28b1ff22605caad54db33))


### Code Refactoring

* rename useHandleCallback → useHandleAuthCallback and HandleCallback → HandleAuthCallback ([#358](https://github.com/sanity-io/sdk/issues/358)) ([014dc69](https://github.com/sanity-io/sdk/commit/014dc695320273b4e166d946753e851c9701d159))

## [0.0.0-alpha.19](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.18...sdk-v0.0.0-alpha.19) (2025-03-21)


### ⚠ BREAKING CHANGES

* rename `results` to `data` for useProjection hook ([#335](https://github.com/sanity-io/sdk/issues/335))
* rename `result` to `data` for usePreview hook ([#325](https://github.com/sanity-io/sdk/issues/325))

### Features

* add useDashboardOrganizationId hook ([#339](https://github.com/sanity-io/sdk/issues/339)) ([401468e](https://github.com/sanity-io/sdk/commit/401468e07b8c74deb02d4b7df78af808bddd9242))
* make packages public ([#320](https://github.com/sanity-io/sdk/issues/320)) ([8c94c29](https://github.com/sanity-io/sdk/commit/8c94c29b0aadd86273db59da1b0577aad682d6e9))
* rename `result` to `data` for usePreview hook ([#325](https://github.com/sanity-io/sdk/issues/325)) ([1e5813e](https://github.com/sanity-io/sdk/commit/1e5813e2e26a72c463cafa8c5502043176930a5b))
* rename `results` to `data` for useProjection hook ([#335](https://github.com/sanity-io/sdk/issues/335)) ([026dd26](https://github.com/sanity-io/sdk/commit/026dd26bffb9fc2a03801ef05a8d075a2968c725))

## [0.0.0-alpha.18](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.17...sdk-v0.0.0-alpha.18) (2025-03-14)


### ⚠ BREAKING CHANGES

* **react:** flatten sdk-react imports ([#319](https://github.com/sanity-io/sdk/issues/319))

### Features

* **react:** flatten sdk-react imports ([#319](https://github.com/sanity-io/sdk/issues/319)) ([3922025](https://github.com/sanity-io/sdk/commit/3922025569abfa4cd824e81222495913875246d7))

## [0.0.0-alpha.17](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.16...sdk-v0.0.0-alpha.17) (2025-03-14)


### ⚠ BREAKING CHANGES

* remove `schema` from sanity config
* remove schema state and schema manager

### Features

* remove `schema` from sanity config ([6257fe3](https://github.com/sanity-io/sdk/commit/6257fe39b4521ace71db54f1d0d173a6019db38d))
* remove schema state and schema manager ([6257fe3](https://github.com/sanity-io/sdk/commit/6257fe39b4521ace71db54f1d0d173a6019db38d))
* store Dashboard context ([#307](https://github.com/sanity-io/sdk/issues/307)) ([a6c454e](https://github.com/sanity-io/sdk/commit/a6c454e33acea6d33d004751615b226bd60c49b3))
* use projection for previews and remove schema usage ([6257fe3](https://github.com/sanity-io/sdk/commit/6257fe39b4521ace71db54f1d0d173a6019db38d))

## [0.0.0-alpha.16](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.15...sdk-v0.0.0-alpha.16) (2025-03-12)


### Features

* **react:** add react compiler to the build process ([#298](https://github.com/sanity-io/sdk/issues/298)) ([bfb74eb](https://github.com/sanity-io/sdk/commit/bfb74ebe538b1218a980b03493890b70dc1311d2))


### Bug Fixes

* all client requests are properly tagged ([#274](https://github.com/sanity-io/sdk/issues/274)) ([6df8938](https://github.com/sanity-io/sdk/commit/6df893891e7b12eff122de5147ab03b65b51bcbe))
* **auth:** only attempt to refresh stamped tokens ([#304](https://github.com/sanity-io/sdk/issues/304)) ([b08a319](https://github.com/sanity-io/sdk/commit/b08a3194a061031400e2ded654269adf71130ea5))

## [0.0.0-alpha.15](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.14...sdk-v0.0.0-alpha.15) (2025-03-10)


### ⚠ BREAKING CHANGES

* remove `useDocuments` and `useSearch` hooks

### Features

* add `useQuery`, `useInfiniteList`, `usePaginatedList` hooks ([1a3f4ad](https://github.com/sanity-io/sdk/commit/1a3f4ad98abf2ab68c552fea20d60639462f3aac))
* add versions information to all packages ([#275](https://github.com/sanity-io/sdk/issues/275)) ([afb2fec](https://github.com/sanity-io/sdk/commit/afb2fec63ea3bae53cab9d8f05081daf2f3c2733))
* **document hooks:** update the documentation for the Document hook s an optional resourceId ([#280](https://github.com/sanity-io/sdk/issues/280)) ([eb65378](https://github.com/sanity-io/sdk/commit/eb65378c884f3aaf9b2c0dbc95dd86075c76f9e0))
* remove `useDocuments` and `useSearch` hooks ([9f37daf](https://github.com/sanity-io/sdk/commit/9f37daf1243ee0fda558ffd7259c45da9e4ba259))


### Bug Fixes

* **core:** add correct perspective to useProjection ([#295](https://github.com/sanity-io/sdk/issues/295)) ([8792e00](https://github.com/sanity-io/sdk/commit/8792e00db7f5f5926e5c311e5cf0bf74bc78f041))
* **core:** determine env for version ([#293](https://github.com/sanity-io/sdk/issues/293)) ([643eac4](https://github.com/sanity-io/sdk/commit/643eac4c69c117c7b08866afb1f92b32010c9a83))
* **deps:** update dependency @sanity/client to ^6.28.3 ([#287](https://github.com/sanity-io/sdk/issues/287)) ([fc5c5a1](https://github.com/sanity-io/sdk/commit/fc5c5a1fd54bca5b7b7138e4cab49113449eebe2))
* **deps:** update dependency @sanity/comlink to v3 ([#296](https://github.com/sanity-io/sdk/issues/296)) ([14fbe1b](https://github.com/sanity-io/sdk/commit/14fbe1b89a79d2532e8735a58abbe4a5cff6d635))
* **deps:** Update sanity monorepo to ^3.78.1 ([#297](https://github.com/sanity-io/sdk/issues/297)) ([835b594](https://github.com/sanity-io/sdk/commit/835b5942d3870a92e0fd1387ab9baa5e555a3ee5))

## [0.0.0-alpha.14](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.13...sdk-v0.0.0-alpha.14) (2025-03-07)


### ⚠ BREAKING CHANGES

* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271))

### Features

* add useProjection hook ([#257](https://github.com/sanity-io/sdk/issues/257)) ([fbaafe0](https://github.com/sanity-io/sdk/commit/fbaafe031e235f61b9d60bf5938f18a4683aafe5))
* allow multiple resources via instances ([#271](https://github.com/sanity-io/sdk/issues/271)) ([6f4d541](https://github.com/sanity-io/sdk/commit/6f4d5410671e8b75759e33380464656a8c961ad6))


### Bug Fixes

* **core:** use drafts instead of previewDrafts ([#279](https://github.com/sanity-io/sdk/issues/279)) ([45305ad](https://github.com/sanity-io/sdk/commit/45305ad0ecc72d60ca1ccba15703bb8a0a6a53f5))

## [0.0.0-alpha.13](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.12...sdk-v0.0.0-alpha.13) (2025-03-05)


### Features

* `useProjects`, `useProject`, `useDatasets` ([#235](https://github.com/sanity-io/sdk/issues/235)) ([cc95dfd](https://github.com/sanity-io/sdk/commit/cc95dfd45a82171fa7ccf05a8ca331e8de97fbee))


### Bug Fixes

* add access api types inside the SDK ([#261](https://github.com/sanity-io/sdk/issues/261)) ([ff53123](https://github.com/sanity-io/sdk/commit/ff53123f2e01a242c22df22b9dc109d2cbc3b1d4))
* **build:** fixes build warning ([#252](https://github.com/sanity-io/sdk/issues/252)) ([bed82f8](https://github.com/sanity-io/sdk/commit/bed82f8d87521dd0cc9d827af5a7f908749ad711))
* **core:** fixes apiVersion in usersStore ([#262](https://github.com/sanity-io/sdk/issues/262)) ([248eb19](https://github.com/sanity-io/sdk/commit/248eb192dc331ce64c05721172f2855a44dad0ca))

## [0.0.0-alpha.12](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.11...sdk-v0.0.0-alpha.12) (2025-02-28)


### Features

* add useUsers hook ([#239](https://github.com/sanity-io/sdk/issues/239)) ([b89bcf0](https://github.com/sanity-io/sdk/commit/b89bcf00bc4a849409ae80f45b1917cb1e51c66e))

## [0.0.0-alpha.11](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.10...sdk-v0.0.0-alpha.11) (2025-02-28)


### Features

* **auth:** refresh stamped tokens ([#225](https://github.com/sanity-io/sdk/issues/225)) ([10b2745](https://github.com/sanity-io/sdk/commit/10b2745c62f9169b8cd1c66d7fb641d7fda37429))
* document permissions ([#226](https://github.com/sanity-io/sdk/issues/226)) ([107f434](https://github.com/sanity-io/sdk/commit/107f4349d7defab04d1282ee1ab20766d157eab7))


### Bug Fixes

* **comlink:** expose statuses and destroy unused resources ([#233](https://github.com/sanity-io/sdk/issues/233)) ([8b8a40c](https://github.com/sanity-io/sdk/commit/8b8a40c5ac0b5ba76cda043ffc9bc3b740bce5bd))
* **core:** add raw perspective to client ([#237](https://github.com/sanity-io/sdk/issues/237)) ([202c4ba](https://github.com/sanity-io/sdk/commit/202c4ba7bb9fdbc7f635ac8691ba840717cafc69))
* make apiVersion required in getClient ([#230](https://github.com/sanity-io/sdk/issues/230)) ([91458d3](https://github.com/sanity-io/sdk/commit/91458d35251be6cf02592f0d4391f58838921ff8))

## [0.0.0-alpha.10](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.9...sdk-v0.0.0-alpha.10) (2025-02-13)


### Features

* export the SanityDocument type ([#221](https://github.com/sanity-io/sdk/issues/221)) ([dc6dbc8](https://github.com/sanity-io/sdk/commit/dc6dbc85fe6d80c6e3b08de76e666da340aa62f6))

## [0.0.0-alpha.9](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.8...sdk-v0.0.0-alpha.9) (2025-02-11)


### Features

* document store ([#197](https://github.com/sanity-io/sdk/issues/197)) ([497bb26](https://github.com/sanity-io/sdk/commit/497bb2641d5766128dfca4db8247f2f9555b83b1))

## [0.0.0-alpha.8](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.7...sdk-v0.0.0-alpha.8) (2025-02-06)


### Features

* **client:** add a global api client ([#209](https://github.com/sanity-io/sdk/issues/209)) ([5898b1d](https://github.com/sanity-io/sdk/commit/5898b1d82fc07d12f736d1361e48287e41ae0608))

## [0.0.0-alpha.7](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.6...sdk-v0.0.0-alpha.7) (2025-02-05)


### Bug Fixes

* trigger release ([#210](https://github.com/sanity-io/sdk/issues/210)) ([2b36c98](https://github.com/sanity-io/sdk/commit/2b36c985a91d44be95a9e6c8446e9a11ffa59d61))

## [0.0.0-alpha.6](https://github.com/sanity-io/sdk/compare/sdk-v0.0.0-alpha.5...sdk-v0.0.0-alpha.6) (2025-01-30)


### ⚠ BREAKING CHANGES

* renames `org` auth scope to `global` ([#187](https://github.com/sanity-io/sdk/issues/187))

### Miscellaneous Chores

* renames `org` auth scope to `global` ([#187](https://github.com/sanity-io/sdk/issues/187)) ([3220d57](https://github.com/sanity-io/sdk/commit/3220d5729c8012ffc47bfa2d75bfca1f2642df76))

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
