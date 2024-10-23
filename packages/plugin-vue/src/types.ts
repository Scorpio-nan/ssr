import { ESMFeRouteItem, ISSRContext, ISSRMidwayKoaContext, ISSRNestContext } from 'ssr-types'
import { Component } from 'vue'
import { Route } from 'vue-router'
import { Store, StoreOptions } from 'vuex'

export type Fetch = (params: Params, ctx?: ISSRContext) => Promise<any>
export type ESMFetch = () => Promise<{
	default: Fetch
}>

export type IFeRouteItem = ESMFeRouteItem<{
	fetch?: ESMFetch
}>

export interface ParamsNest<T = {}, U = {}> {
	store: Store<T>
	router: Route
	ctx?: ISSRNestContext<U>
}

export interface ParamsKoa<T = {}, U = {}> {
	store: Store<T>
	router: Route
	ctx?: ISSRMidwayKoaContext<U>
}
export interface Params<T = {}, U = {}> {
	store: Store<T>
	router: Route
	ctx?: ISSRContext<U>
}

export interface RoutesType {
	Layout: Component
	App: Component
	layoutFetch?: (params: Params, ctx?: ISSRContext) => Promise<any>
	FeRoutes: IFeRouteItem[]
	store: StoreOptions<any>
}

export interface VueRouterOptions {
	base?: string
}
