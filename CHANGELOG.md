# Changelog

## 1.0.0 (2024-12-11)


### Features

* `createStore` prototype ([#46](https://github.com/sanity-io/sdk/issues/46)) ([d3d69f8](https://github.com/sanity-io/sdk/commit/d3d69f8164ed406c77a3586a8a29987fd5aa1b2e))
* add authorization ([#52](https://github.com/sanity-io/sdk/issues/52)) ([59501f1](https://github.com/sanity-io/sdk/commit/59501f1525e271e8d724c4eb69a27f01726bb64e))
* add document list store ([#58](https://github.com/sanity-io/sdk/issues/58)) ([b66ea04](https://github.com/sanity-io/sdk/commit/b66ea04a386207704512a4b5cd1c5e77e0a48eb6))
* add hooks for AuthStore ([#91](https://github.com/sanity-io/sdk/issues/91)) ([4367719](https://github.com/sanity-io/sdk/commit/43677193fccc08fcf7074f906edf2acdfc440e1c))
* add initial SanityInstance provider ([#63](https://github.com/sanity-io/sdk/issues/63)) ([2e816b9](https://github.com/sanity-io/sdk/commit/2e816b94c6a706de7792907e7e593970d1570256))
* add React and Vitest ([#3](https://github.com/sanity-io/sdk/issues/3)) ([e55dc32](https://github.com/sanity-io/sdk/commit/e55dc32f080ffaa7470bdcb2ed97f992cfcbe584))
* add session hooks and store ([#59](https://github.com/sanity-io/sdk/issues/59)) ([65ac911](https://github.com/sanity-io/sdk/commit/65ac9111d79211aee621f7bfed47bb5cfcf565e1))
* add storybook and dev affordances ([#6](https://github.com/sanity-io/sdk/issues/6)) ([15b45e8](https://github.com/sanity-io/sdk/commit/15b45e8d7821ec7abc1852998143e19553c06f1e))
* add turborepo ([#2](https://github.com/sanity-io/sdk/issues/2)) ([19c53e1](https://github.com/sanity-io/sdk/commit/19c53e1408edacbda4105c75c6fa5c4fe0a6b744))
* add TypeDoc ([#43](https://github.com/sanity-io/sdk/issues/43)) ([2274873](https://github.com/sanity-io/sdk/commit/227487372c1d04799f7c2ed06839dae06113887c))
* add useClient hook ([#96](https://github.com/sanity-io/sdk/issues/96)) ([c50883b](https://github.com/sanity-io/sdk/commit/c50883bbf3eed32977a1033615582690234154fc))
* **auth:** fetch current user when token is present ([#92](https://github.com/sanity-io/sdk/issues/92)) ([f38008c](https://github.com/sanity-io/sdk/commit/f38008c71d55bb3b54bbf5318045a52a918084c2))
* AuthStore ([#79](https://github.com/sanity-io/sdk/issues/79)) ([f52e68e](https://github.com/sanity-io/sdk/commit/f52e68e43d5552b061415aba6c2758bcd6243c7c))
* **components:** add initial presentational components ([#44](https://github.com/sanity-io/sdk/issues/44)) ([9d7cf51](https://github.com/sanity-io/sdk/commit/9d7cf517186ee274fe3bd9ea32b36b590ddb7150))
* **components:** DocumentList & Storybook upgrades ([#54](https://github.com/sanity-io/sdk/issues/54)) ([71e8eca](https://github.com/sanity-io/sdk/commit/71e8eca3da0995f3a8dd4f6eb5b606fdfa139b6c))
* **components:** update DocumentList & DocumentPreview ([#61](https://github.com/sanity-io/sdk/issues/61)) ([c00b292](https://github.com/sanity-io/sdk/commit/c00b292dd99bdc6c5b4ee1615b0f3e49106d09c5))
* **core:** create client store ([#38](https://github.com/sanity-io/sdk/issues/38)) ([8545333](https://github.com/sanity-io/sdk/commit/8545333c02c5691674e90be19951458ab3abbd6a))
* **core:** update client store to subscribe to changes in auth ([#85](https://github.com/sanity-io/sdk/issues/85)) ([a42d58d](https://github.com/sanity-io/sdk/commit/a42d58d3227e7d884a5449192f176e66bf404144))
* **core:** use separate client for auth and refresh client store with token ([#64](https://github.com/sanity-io/sdk/issues/64)) ([9d18fbf](https://github.com/sanity-io/sdk/commit/9d18fbfd2fc2708e0f9505617343720c5d7fafb0))
* create sanity instance and store map ([#40](https://github.com/sanity-io/sdk/issues/40)) ([a7bf3e1](https://github.com/sanity-io/sdk/commit/a7bf3e12ea0f36ee63e42b4ba9088a9413b0742b))
* **react:** add AuthBoundary ([#102](https://github.com/sanity-io/sdk/issues/102)) ([bd657a0](https://github.com/sanity-io/sdk/commit/bd657a058c4ae0989018503fe2fafa319fcdbc7d))
* refactor to internal auth store ([#95](https://github.com/sanity-io/sdk/issues/95)) ([5807a2b](https://github.com/sanity-io/sdk/commit/5807a2b0b823f9187c25ab82233ad6d30df664f1))
* replace jsdoc with tsdoc ([#75](https://github.com/sanity-io/sdk/issues/75)) ([7074a38](https://github.com/sanity-io/sdk/commit/7074a383b58de66fe2a9badc7122d0345e354b2a))


### Bug Fixes

* add lint to turbo.json and run prettier ([909f0d3](https://github.com/sanity-io/sdk/commit/909f0d34339c9c8ff8c013dfa13e5d607a2012fc))
* **ci:** fix the typo in release please workflow ([#106](https://github.com/sanity-io/sdk/issues/106)) ([9e3ecd3](https://github.com/sanity-io/sdk/commit/9e3ecd36b64500ace0b937a4491d6a4b44c53659))
* correct auth state subscription ([#101](https://github.com/sanity-io/sdk/issues/101)) ([9ba03d0](https://github.com/sanity-io/sdk/commit/9ba03d03f00df6d6aac29036cdca6a880fb3c52d))
* **deps:** Update eslint-tooling ([#69](https://github.com/sanity-io/sdk/issues/69)) ([d9d8e09](https://github.com/sanity-io/sdk/commit/d9d8e099e4711bb6ae90e926ce804715f56ef5d3))
* **lint:** fixes linting issues with jsdoc ([#65](https://github.com/sanity-io/sdk/issues/65)) ([09d4ec5](https://github.com/sanity-io/sdk/commit/09d4ec574b17abbef69475db2e7cc6cfeb0d3948))
* mark packages as private for now ([#11](https://github.com/sanity-io/sdk/issues/11)) ([a103825](https://github.com/sanity-io/sdk/commit/a1038257192e2c493132b96233d461bdd9a31744))
* package access and version ([#89](https://github.com/sanity-io/sdk/issues/89)) ([c4eb26d](https://github.com/sanity-io/sdk/commit/c4eb26dac12ec56c5a569c8edc895ffcd46a63a7))
* **storybook:** fixes build dependencies for storybook ([#37](https://github.com/sanity-io/sdk/issues/37)) ([347079f](https://github.com/sanity-io/sdk/commit/347079fb7f1175c2dbde8277e0a43eeb8232a00a))
* update storybook and kitchensink commands ([#32](https://github.com/sanity-io/sdk/issues/32)) ([024a1d8](https://github.com/sanity-io/sdk/commit/024a1d8a1ac9a080a1dbcf7d5444f95c6c68452b))
