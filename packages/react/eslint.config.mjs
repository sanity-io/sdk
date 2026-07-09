// @ts-check
import baseESLintConfig from '@repo/config-eslint'
import reactConfig from '@repo/config-eslint/react'
import tsdocConfig from '@repo/config-eslint/tsdoc'

export default [...baseESLintConfig, ...tsdocConfig, ...reactConfig]
