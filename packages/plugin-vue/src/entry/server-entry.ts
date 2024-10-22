import {
  findRoute, getManifest, logGreen, normalizePath, getAsyncCssChunk,
  getAsyncJsChunk, getUserScriptVue, remInitial, localStorageWrapper, getInlineOrder, checkRoute, splitPageInfo, getStaticConfig
} from 'ssr-common-utils'
import type { ISSRContext, IConfig } from 'ssr-types'
import { serialize } from 'ssr-serialize-javascript'
import { createRenderer } from 'vue-server-renderer'

import { Routes } from './create-router'
import { createRouter, createStore, getInlineVNode, getVNode, RealVue } from './create'
import { IFeRouteItem } from '../types'

const { renderToStream, renderToString } = createRenderer()
const { FeRoutes, App, layoutFetch, Layout } = Routes

const staticConfig = getStaticConfig()

const serverRender = async (ctx: ISSRContext, config: IConfig) => {
  const { mode, customeHeadScript, customeFooterScript, isDev, parallelFetch, prefix, isVite, clientPrefix, stream, rootId, bigpipe, hashRouter } = config
  const router = createRouter()
  const store = createStore()
  const fn = async () => {
    const rawPath = ctx.request.path ?? ctx.request.url
    const [path, url] = [normalizePath(rawPath, prefix), normalizePath(ctx.request.url, prefix)]
    const routeItem = findRoute<IFeRouteItem>(FeRoutes, path)
    checkRoute({ routeItem, path })

    const { fetch, webpackChunkName } = routeItem
    const dynamicCssOrder = await getAsyncCssChunk(ctx, webpackChunkName, config)
    const dynamicJsOrder = await getAsyncJsChunk(ctx, webpackChunkName, config)
    const manifest = await getManifest(config)
    const {
      inlineCssOrder,
      extraCssOrder,
      inlineJsOrder,
      extraJsOrder
    } = await getInlineOrder({ dynamicCssOrder, dynamicJsOrder, manifest, config, type: 'vue3' })
    const isCsr = !!(mode === 'csr' || ctx.request.query?.csr)

    let [layoutFetchData, fetchData] = [{}, {}]

    if (!isCsr && !bigpipe) {
      router.push(url)
      // not fetch when generate <head>
      const currentFetch = fetch ? (await fetch()).default : null
      const lF = layoutFetch ? layoutFetch({ store, router: router.currentRoute, ctx }, ctx) : Promise.resolve({})
      const CF = currentFetch ? currentFetch({ store, router: router.currentRoute, ctx }, ctx) : Promise.resolve({});
      [layoutFetchData, fetchData] = parallelFetch ? await Promise.all([lF, CF]) : [await lF, await CF]
    } else {
      logGreen(`Current path ${path} use csr render mode`)
    }

    const combineAysncData = Object.assign({}, layoutFetchData ?? {}, fetchData ?? {})
    const state = Object.assign({}, store.state ?? {}, combineAysncData)
    const ssrDevInfo = { manifest: isDev ? manifest : '', rootId }
    const app = new RealVue({
      // @ts-ignore
      router,
      store,
      render: function (h: Vue.CreateElement) {
        const injectCss = (isVite && isDev) ? [h('script', {
          attrs: {
            type: 'module',
            src: '/@vite/client'
          }
        })] : extraCssOrder.map(css => manifest[css]).filter(Boolean).map(css => h('link', {
          attrs: {
            rel: 'stylesheet',
            href: css
          }
        }))
        const injectScript = (isVite && isDev) ? [h('script', {
          attrs: {
            type: 'module',
            src: '/node_modules/ssr-plugin-vue/esm/entry/client-entry.js'
          }
        })] : extraJsOrder.map(js => manifest[js]).filter(Boolean).map(js => h('script', {
          attrs: {
            src: js,
            type: isVite ? 'module' : 'text/javascript'
          }
        }))
        const innerHTML = splitPageInfo({
          'window.__USE_SSR__': !isCsr,
          'window.__INITIAL_DATA__': isCsr ? {} : serialize(state),
          'window.__USE_VITE__': isVite,
          'window.prefix': `"${prefix}"`,
          'window.clientPrefix': `"${clientPrefix ?? ''}"`,
          'window.ssrDevInfo': JSON.stringify(ssrDevInfo),
          'window.hashRouter': Boolean(hashRouter)
        })
        const customeHeadScriptArr: Vue.VNode[] = getVNode(getUserScriptVue({ script: customeHeadScript, ctx, position: 'header', staticConfig }), h).concat(getInlineVNode(inlineCssOrder, h, 'style'))
        const customeFooterScriptArr: Vue.VNode[] = getVNode(getUserScriptVue({ script: customeFooterScript, ctx, position: 'footer', staticConfig }), h).concat(getInlineVNode(inlineJsOrder, h, 'script'))

        const initialData = h('script', {
          domProps: {
            innerHTML
          }
        })
        const children = h('div', {
          attrs: {
            id: rootId.replace('#', '')
          }
        }, [bigpipe ? '' : h(App, {
          props: { ctx, config, fetchData: combineAysncData, asyncData: { value: combineAysncData }, reactiveFetchData: { value: combineAysncData } }
        })])
        return h(
          Layout,
          {
            props: { ctx, config, asyncData: Object.assign(combineAysncData, { value: combineAysncData }), fetchData: layoutFetchData, reactiveFetchData: { value: layoutFetchData } }
          },
          [
            h('template', {
              slot: 'remInitial'
            }, [
              h('script', {}, [
                remInitial
              ])
            ]),

            h('template', {
              slot: 'customeHeadScript'
            }, customeHeadScriptArr),
            h('template', {
              slot: 'customeFooterScript'
            }, customeFooterScriptArr),

            h('template', {
              slot: 'children'
            }, [
              children
            ]),

            h('template', {
              slot: 'initialData'
            }, [
              initialData
            ]),

            h('template', {
              slot: 'cssInject'
            }, injectCss),

            h('template', {
              slot: 'jsInject'
            }, injectScript),

            h('template', {
              slot: 'injectHeader'
            }, [
              customeHeadScriptArr,
              injectCss
            ]),

            h('template', {
              slot: 'content'
            }, [
              children,
              initialData,
              customeFooterScriptArr,
              injectScript
            ])
          ]
        )
      }
    })
    return stream ? renderToStream(app) : await renderToString(app)
  }
  const res = await localStorageWrapper.run({
    store,
    ctx
  }, fn)
  return res
}

export {
  serverRender,
  Routes
}
