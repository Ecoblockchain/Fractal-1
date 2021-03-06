import {
  run,
  // DEV
  logFns,
  mergeStates,
} from '../../core'
import { styleHandler } from '../../groups/style'
import { viewHandler } from '../../interfaces/view'

import * as root from './Root'

let app = run({
  root,
  groups: {
    style: styleHandler('', true),
  },
  interfaces: {
    view: viewHandler('#app'),
  },
  // DEV ONLY (you can handle it manually)
  ...logFns,
})

// Hot reload - DEV ONLY
if (module.hot) {
  module.hot.accept('./Root', () => {
    let m = require('./Root')
    app.moduleAPI.reattach(m, mergeStates)
  })
}
