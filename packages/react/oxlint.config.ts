import baseConfig from '@repo/config-oxlint'
import reactConfig from '@repo/config-oxlint/react'
import tsdocConfig from '@repo/config-oxlint/tsdoc'

export default {extends: [baseConfig, tsdocConfig, reactConfig]}
