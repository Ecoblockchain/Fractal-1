import { Interface, ModuleAPI } from '../../core'
import { init } from 'snabbdom'
import classModule from 'snabbdom/modules/class'
import attributesModule from 'snabbdom/modules/attributes'
import propsModule from 'snabbdom/modules/props'
import eventlistenersModule from './eventListeners'
import styleModule from 'snabbdom/modules/style'
import { default as _h } from './h'
import { VNode } from './vnode'

export const h = _h

export type View<S> = Interface<VNode, S>

export const viewHandler = selectorElm => (mod: ModuleAPI) => {
  let selector = (typeof selectorElm === 'string') ? selectorElm : ''
  let lastContainer
  let state

  // Common snabbdom patch function (convention over configuration)
  let patchFn = init([
    classModule,
    attributesModule,
    propsModule,
    eventlistenersModule(mod),
    styleModule,
  ])

  function handler (vnode: VNode) {
    let vnode_mapped = h('div' + selector, { key: selector }, [vnode])
    state = patchFn(state, <any> vnode_mapped)
    lastContainer = state
  }

  return {
    state,
    handle: (value: VNode) => {
      if (!state) {
        let container = selector !== '' ? document.querySelector(selector) : selectorElm
        if (!container) {
          return mod.error('view', `There are no element matching selector '${selector}'`)
        }
        state = container
        handler(state)
        handler(value)
      } else {
        handler(value)
      }
    },
    dispose: () => {},
  }
}