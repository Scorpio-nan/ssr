import type { Chain, StyleOptions } from 'ssr-types'
import { loadModuleFromFramework } from '../cwd'
import { loadConfig } from '../loadConfig'

const loadModule = loadModuleFromFramework
const setStyle = (chain: Chain, reg: RegExp, options: StyleOptions) => {
	const { css } = loadConfig()
	const { include, exclude, importLoaders, loader, isServer } = options
	const userCssloaderOptions = css?.().loaderOptions?.cssOptions ?? {}
	const defaultCssloaderOptions = {
		importLoaders: importLoaders,
		modules: {
			// 对 .module.xxx 的文件开启 css-modules
			auto: true
		},

		url: (url: string) => {
			// 绝对路径开头的静态资源地址不处理
			return !url.startsWith('/')
		}
	}

	const finalCssloaderOptions = Object.assign({}, defaultCssloaderOptions, userCssloaderOptions)
	const postCssPlugins = css?.().loaderOptions?.postcss?.plugins ?? [] // 用户自定义 postcss 插件
	const userPostcssOptions = css?.().loaderOptions?.postcss?.options // postCssOptions maybe function|object
	const postcssOptions =
		typeof userPostcssOptions === 'function'
			? userPostcssOptions
			: Object.assign(
					{
						plugins: [
							require(loadModule('postcss-flexbugs-fixes')),
							require(loadModule('postcss-discard-comments')),
							[
								require(loadModule('postcss-preset-env')),
								{
									autoprefixer: {
										flexbox: 'no-2009'
									},
									stage: 3
								}
							]
						].concat(postCssPlugins)
					},
					userPostcssOptions ?? {}
				) // 合并用户自定义 postcss options

	chain.module
		.rule(options.rule)
		.test(reg)
		.when(Boolean(include), (rule) => {
			include && rule.include.add(include).end()
		})
		.when(Boolean(exclude), (rule) => {
			exclude && rule.exclude.add(exclude).end()
		})
		.use('MiniCss')
		.loader(loadModule('ssr-mini-css-extract-plugin/dist/loader'))
		.options({
			emit: !isServer
		})
		.end()
		.use('css-loader')
		.loader(loadModule('css-loader'))
		.options(finalCssloaderOptions)
		.end()
		.use('postcss-loader')
		.loader(loadModule('postcss-loader'))
		.options({
			postcssOptions: postcssOptions
		})
		.end()
		.when(Boolean(loader), (rule) => {
			loader &&
				rule
					.use(loader)
					.loader(loadModule(loader))
					.when(loader === 'less-loader', (rule) => {
						rule.options(
							Object.assign(
								{
									lessOptions: {
										javascriptEnabled: true
									}
								},
								css?.().loaderOptions?.less
							)
						)
					})
					.when(loader === 'sass-loader', (rule) => {
						rule.options(css?.().loaderOptions?.sass ?? {})
					})
					.end()
		})
}

export { setStyle }
