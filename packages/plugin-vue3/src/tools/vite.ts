import { resolve } from 'path'
import babel from '@rollup/plugin-babel'
import vuePlugin from '@vitejs/plugin-vue'
import vueJSXPlugin from '@vitejs/plugin-vue-jsx'
import { visualizer } from 'rollup-plugin-visualizer'
import { asyncOptimizeChunkPlugin, chunkNamePlugin, commonConfig, getBabelOptions, getCwd, getDefineEnv, getOutputPublicPath, loadConfig, manifestPlugin, rollupOutputOptions } from 'ssr-common-utils'
import { UserConfig, build } from 'vite'

import { AndDesignVueResolve, AntdResolve, ElementPlusResolve, NutuiResolve, VantResolve, createStyleImportPlugin } from 'ssr-vite-plugin-style-import'

const { getOutput, vue3ServerEntry, vue3ClientEntry, viteConfig, supportOptinalChaining, isDev, define, optimize } = loadConfig()
const { clientOutPut, serverOutPut } = getOutput()

const styleImportConfig = {
	include: ['**/*.vue', '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', /chunkName/],
	resolves: [AndDesignVueResolve(), VantResolve(), ElementPlusResolve(), NutuiResolve(), AntdResolve()]
}
const serverPlugins = [
	vuePlugin(viteConfig?.()?.server?.defaultPluginOptions),
	vueJSXPlugin(),
	viteConfig?.()?.common?.extraPlugin,
	viteConfig?.()?.server?.extraPlugin,
	createStyleImportPlugin(styleImportConfig),
	!supportOptinalChaining &&
		babel({
			babelHelpers: 'bundled',
			plugins: ['@babel/plugin-proposal-optional-chaining', '@babel/plugin-proposal-nullish-coalescing-operator'],
			exclude: /node_modules|\.(css|less|sass)/,
			extensions: ['.vue', '.ts', '.tsx', '.js']
		})
].filter(Boolean)

const serverConfig: UserConfig = {
	...commonConfig(),
	...viteConfig?.().server?.otherConfig,
	plugins: viteConfig?.()?.server?.processPlugin?.(serverPlugins) ?? serverPlugins,
	optimizeDeps: {
		...viteConfig?.().server?.otherConfig?.optimizeDeps,
		esbuildOptions: {
			...viteConfig?.().server?.otherConfig?.optimizeDeps?.esbuildOptions,
			// @ts-expect-error
			bundle: isDev
		}
	},
	build: {
		minify: !process.env.NOMINIFY,
		...viteConfig?.().server?.otherConfig?.build,
		ssr: vue3ServerEntry,
		outDir: serverOutPut,
		rollupOptions: {
			...viteConfig?.().server?.otherConfig?.build?.rollupOptions,
			input: isDev ? vue3ClientEntry : vue3ServerEntry, // setting prebundle list by client-entry in dev
			output: {
				entryFileNames: 'Page.server.js',
				assetFileNames: rollupOutputOptions().assetFileNames
			}
		}
	},
	define: {
		...getDefineEnv(),
		...viteConfig?.().server?.otherConfig?.define,
		__isBrowser__: false,
		...define?.base,
		...define?.server
	}
}
const clientPlugins = [vuePlugin(viteConfig?.()?.client?.defaultPluginOptions), vueJSXPlugin(), viteConfig?.()?.common?.extraPlugin, viteConfig?.()?.client?.extraPlugin, createStyleImportPlugin(styleImportConfig)].filter(Boolean)

const analyzePlugin = process.env.GENERATE_ANALYSIS ? visualizer({ filename: resolve(getCwd(), './build/stat.html'), open: true }) : null
const clientConfig: UserConfig = {
	...commonConfig(),
	...viteConfig?.().client?.otherConfig,
	base: isDev ? '/' : getOutputPublicPath(),
	plugins: viteConfig?.()?.client?.processPlugin?.(clientPlugins) ?? clientPlugins,
	build: {
		minify: !process.env.NOMINIFY,
		...viteConfig?.().client?.otherConfig?.build,
		...(optimize ? { write: false } : {}),
		ssrManifest: true,
		outDir: clientOutPut,
		rollupOptions: {
			...viteConfig?.().client?.otherConfig?.build?.rollupOptions,
			input: vue3ClientEntry,
			output: rollupOutputOptions(),
			plugins: [
				chunkNamePlugin(),
				asyncOptimizeChunkPlugin(),
				manifestPlugin(),
				...getBabelOptions({
					babel
				}),
				analyzePlugin
			]
		}
	},
	define: {
		...getDefineEnv(),
		...viteConfig?.().client?.otherConfig?.define,
		__isBrowser__: true,
		...define?.base,
		...define?.client
	}
}
const viteStart = async () => {
	//
}
const viteBuild = async () => {
	await build({ ...clientConfig, mode: 'production' })
	await build({ ...serverConfig, mode: process.env.VITEMODE ?? 'production' })
}

const viteBuildClient = async () => {
	await build({
		...clientConfig,
		mode: process.env.VITEMODE ?? 'production'
	}).catch((_) => {})
}
const viteBuildServer = async () => {
	await build({ ...serverConfig, mode: process.env.VITEMODE ?? 'production' })
}

export { viteBuild, viteStart, viteBuildClient, viteBuildServer, serverConfig, clientConfig }
