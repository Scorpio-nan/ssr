import { promises, accessSync, readFileSync, writeFileSync, realpathSync } from 'fs'
import { resolve } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { UserConfig, IPlugin } from 'ssr-types'
import { coerce } from 'semver'

const getCwd = () => {
  return resolve(process.cwd(), process.env.APP_ROOT ?? '')
}

const getFeDir = () => {
  return resolve(getCwd(), process.env.FE_ROOT ?? 'web')
}

const getPagesDir = () => {
  return resolve(getFeDir(), 'pages')
}

const writeRoutes = async (routes: string, name?: string) => {
  const cwd = getCwd()
  await promises.writeFile(resolve(cwd, `./build/${name ?? 'ssr-declare-routes'}`), routes)
}

const transformConfig = () => {
  try {
    // serverless 发布无需安装 shelljs esbuild, 提前本地 build 好
    const { cp, mkdir } = require('shelljs')
    const { transformSync } = require('esbuild')
    const cwd = getCwd()
    if (!accessFileSync(resolve(cwd, './build'))) {
      mkdir(resolve(cwd, './build'))
    }
    if (accessFileSync(resolve(cwd, './config.js'))) {
      cp('-r', `${resolve(cwd, './config.js')}`, `${resolve(cwd, './build/config.js')}`)
    }
    const configWithTs = accessFileSync(resolve(cwd, './config.ts'))
    if (configWithTs) {
      const fileContent = readFileSync(resolve(cwd, './config.ts')).toString()
      const { code } = transformSync(fileContent, {
        loader: 'ts',
        format: 'cjs',
        keepNames: true
      })
      writeFileSync(resolve(cwd, './build/config.js'), code)
    }
  } catch (error) {

  }
}

const transformManualRoutes = async () => {
  const { transform } = await import('esbuild')
  const declaretiveRoutes = await accessFile(resolve(getFeDir(), './route.ts')) // 是否存在自定义路由
  // without manualRoutes create emtry object
  const manualRoutes = declaretiveRoutes ? (await promises.readFile(resolve(getFeDir(), './route.ts'))).toString() : 'export {}'
  const { code } = await transform(manualRoutes, {
    loader: 'ts',
    format: 'esm',
    keepNames: true
  })
  // remove empty character and wrapline in vite mode for rollup
  const serializeCode = code.replace(/(import\([\s\S]*?,)/g, (match) => {
    return match.replace(/\s/g, '')
  })
  await writeRoutes(serializeCode, 'ssr-manual-routes.js')
}

const getUserConfig = (): UserConfig => {
  let config
  try {
    config = require(resolve(getCwd(), './build/config'))
  } catch (error) {
    transformConfig()
    config = require(resolve(getCwd(), './build/config'))
  }
  return config.userConfig ?? config
}

const loadPlugin = (): IPlugin => {
  return require(resolve(getCwd(), 'plugin'))
}

const readAsyncChunk = async (): Promise<Record<string, string>> => {
  const cwd = getCwd()
  try {
    const str = (await promises.readFile(resolve(cwd, './build/asyncChunkMap.json'))).toString()
    return JSON.parse(str)
  } catch (error) {
    return {}
  }
}

const addAsyncChunk = async (dynamicCssOrder: string[], webpackChunkName: string) => {
  const arr = []
  const asyncChunkMap = await readAsyncChunk()
  for (const key in asyncChunkMap) {
    if (asyncChunkMap[key].includes(webpackChunkName)) {
      arr.push(`${key}.css`)
    }
  }
  return arr.concat(dynamicCssOrder)
}
const cyrb53 = function (str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed; let h2 = 0x41c6ce57 ^ seed
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

const cryptoAsyncChunkName = (chunks: Array<{name: string}>, asyncChunkMap: Record<string, string[]>) => {
  // 加密异步模块 name，防止名称过长
  chunks.sort((a, b) => a.name > b.name ? -1 : 1) // 保证相同值不同顺序的数组最终的加密结果一致
  const allChunksNames = chunks.map((item: any) => item.name).join('~')
  const allChunksNamesArr = allChunksNames.split('~')
  const cryptoAllChunksNames = String(cyrb53(allChunksNames))
  if (allChunksNamesArr.length >= 2 && !asyncChunkMap?.[cryptoAllChunksNames]) {
    asyncChunkMap[cryptoAllChunksNames] = allChunksNamesArr
  }
  return cryptoAllChunksNames
}

const isFaaS = async (fun?: boolean) => {
  const result = await promises.access(resolve(getCwd(), fun ? 'template.yml' : 'f.yml'))
    .then(() => true)
    .catch(() => false)
  return result
}

const judgeFramework = () => {
  const cwd = getCwd()
  const packageJSON = require(resolve(cwd, './package.json'))
  if (packageJSON.dependencies.react || packageJSON.devDependencies.react) {
    return 'ssr-plugin-react'
  }
  if (packageJSON.dependencies.vue || packageJSON.devDependencies.vue) {
    const version = packageJSON.dependencies.vue || packageJSON.devDependencies.vue
    return coerce(version)!.major === 3 ? 'ssr-plugin-vue3' : 'ssr-plugin-vue'
  }
}

const loadModuleFromFramework = (path: string) => {
  try {
    const framework = judgeFramework()
    return require.resolve(path, {
      paths: [realpathSync(resolve(getCwd(), `./node_modules/${framework}`))]
    })
  } catch (error) {
    return ''
  }
}

const getLocalNodeModules = () => resolve(__dirname, '../../../node_modules')

const processError = (err: any) => {
  if (err) {
    console.log(err)
    process.exit(1)
  }
}
const accessFile = async (file: string) => {
  const result = await promises.access(file)
    .then(() => true)
    .catch(() => false)
  return result
}

const accessFileSync = (file: string) => {
  let res = true
  try {
    accessSync(file)
  } catch (error) {
    res = false
  }
  return res
}

const copyReactContext = async () => {
  await promises.copyFile(resolve(getCwd(), './node_modules/ssr-plugin-react/src/entry/create-context.ts'), resolve(getCwd(), './build/create-context.ts'))
}

const execPromisify = promisify(exec)
const normalizeStartPath = (path: string) => {
  if (path.startsWith('//')) {
    path = path.replace('//', '/')
  }
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  return path
}
const normalizeEndPath = (path: string) => {
  if (!path.endsWith('/')) {
    path = `${path}/`
  }
  return path
}

export {
  getCwd,
  getFeDir,
  getPagesDir,
  getUserConfig,
  isFaaS,
  loadPlugin,
  getLocalNodeModules,
  processError,
  accessFile,
  execPromisify,
  readAsyncChunk,
  addAsyncChunk,
  cryptoAsyncChunkName,
  normalizeStartPath,
  normalizeEndPath,
  copyReactContext,
  transformConfig,
  accessFileSync,
  judgeFramework,
  loadModuleFromFramework,
  transformManualRoutes,
  writeRoutes
}
