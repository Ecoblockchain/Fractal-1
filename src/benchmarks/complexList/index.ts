import {
  run,
  // DEV
  // logFns,
  mergeStates,
} from '../../core'
import { viewHandler } from '../../interfaces/view'
import { styleHandler } from '../../groups/style'

import * as root from './Root'

const app = run({
  root,
  groups: {
    style: styleHandler('', true),
  },
  interfaces: {
    view: viewHandler('#app'),
  },
  // ...logFns,
  afterInput: (ctx, inputName, data) => {
    end = window.performance.now()
    results[i] = end - start
    i++
    sim()
  },
})

let input = <HTMLInputElement> document.querySelector('#app input')

function simulateKeyEvent(el: HTMLElement, name, keyCode, cb) {
  var evt = new KeyboardEvent(name, { bubbles:true })
  Object.defineProperty(evt, 'keyCode', {
    get: function() {
        return this.charCodeVal
    }
  })
  Object.defineProperty(evt, 'which', {
    get: function() {
        return this.charCodeVal
    }
  })
  ;(<any> evt).charCodeVal = keyCode
  el.dispatchEvent(evt)
  if (cb) {
    cb()
  }
}

let results = []
let start, end
let i = 0
let sim = () => i < 2000 ? (() =>{
  input.value = 'Hello guys!! ' + i
  simulateKeyEvent(input, 'keyup', 13, () => {
    start = window.performance.now()
  })
})() : console.log(JSON.stringify(results))

sim()

// Hot reload - DEV ONLY
if (module.hot) {
  module.hot.accept('./Root', () => {
    let m = require('./Root')
    app.moduleAPI.reattach(m, mergeStates)
  })
}
