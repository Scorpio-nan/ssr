import { execSync } from 'child_process'
import { join } from 'path'
import { accessFile, checkTsConfig, getCwd, judgeVersion } from 'ssr-common-utils'
import { Argv } from 'ssr-types'

const build = async (argv: Argv) => {
	const { cli } = require('@midwayjs/cli/bin/cli')
	const cwd = getCwd()
	if (judgeVersion(require(join(cwd, './package.json')).dependencies['@midwayjs/decorator'])?.major === 2) {
		execSync('npx cross-env ets')
	}
	argv.tsConfig = (await accessFile(join(cwd, './tsconfig.build.json'))) ? join(cwd, './tsconfig.build.json') : join(cwd, './tsconfig.json')
	argv.c = true
	await checkTsConfig()
	await cli(argv)
}

export { build }
