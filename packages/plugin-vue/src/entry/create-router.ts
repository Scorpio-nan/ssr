import * as declareRoutes from '_build/ssr-declare-routes'
import * as ManualRoutes from '_build/ssr-manual-routes'
import { combineRoutes } from 'ssr-common-utils'
import { RoutesType } from '../types'

const Routes = combineRoutes(declareRoutes, ManualRoutes) as RoutesType

export { Routes }
