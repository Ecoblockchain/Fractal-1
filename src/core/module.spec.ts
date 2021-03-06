import {
  Component,
  Module,
  Context,
  run,
  nest,
  unnest,
  _interfaceOf,
  _ev,
  Executable,
  createContext,
  Task,
  Handler,
  computeEvent,
  EventData,
  dispatch,
  HandlerInterface,
  notifyInterfaceHandlers,
  clone,
  Inputs,
  assoc,
  toChild,
} from './index'
import { mergeStates } from '../utils/reattach'
import { valueHandler, ValueInterface } from '../interfaces/value'
import { toIt } from './module'

// Component definition to perform tests

let name = 'Main'

let state = 0

type S = typeof state

let actions = {
  Set: (count: number) => () => count,
  Inc: () => s => s + 1,
}

let inputs: Inputs<S> = ({ ctx }) => ({
  set: (n: number) => actions.Set(n),
  setExtra: ([value, extra]) => actions.Set(value + extra),
  toParent: () => {},
  $child1_toParent: () => actions.Set(17), // child input detection
  $toParentGlobal: () => {},
  $$Child_toParentGlobal: () => actions.Set(21), // child input detection
  inc: () => actions.Inc(),
  action: ([name, value]) => actions[name](value), // generic action input
  dispatch: () => {
    dispatch(ctx, computeEvent({}, _ev(ctx)('inc')))
  },
  task: (): Task => ['log', { info: 'info', cb: _ev(ctx)('inc') }],
  wrongTask: (): Task => ['wrongTask', {}],
  executableListWrong: (): Executable<S>[] => [
    ['wrongTask2', {}],
  ],
  executableListTask: (): Executable<S>[] => [
    ['log', { info: 'info2', cb: _ev(ctx)('inc') }],
  ],
  executableListAction: (): Executable<S>[] => [
    actions.Inc(),
  ],
})

let _ = undefined // gap for undefined

let childValue: ValueInterface<any> =
  ({ctx}) => s => ({
    tagName: ctx.id,
    content: s,
    inc: _ev(ctx)('inc'),
    task: _ev(ctx)('task'),
    set: _ev(ctx)('set', 10),
    setFnAll: _ev(ctx)('set', _, '*'),
    setFnValue: _ev(ctx)('set', _, 'value'),
    setFnPath: _ev(ctx)('set', _, ['target', 'value']),
    setFnExtra: _ev(ctx)('setExtra', 5, 'value'),
    setFnGeneric: _ev(ctx)('action', 'Set', 'value'),
    setFnKeys: _ev(ctx)('set', _, [['a', 'b']]),
    setFnPathKeys: _ev(ctx)('set', _, ['p1', 'p2', ['a', 'b', 'c']]),
    setFnPaths: _ev(ctx)('set', _, [['p1', 'z'], ['a'], ['p1', 'p2', ['a', 'b', 'c']]]),
    toParent: _ev(ctx)('toParent'),
    toParentGlobal: _ev(ctx)('$toParentGlobal'),
    wrongTask: _ev(ctx)('wrongTask'),
    dispatch: _ev(ctx)('dispatch'),
    executableListWrong: _ev(ctx)('executableListWrong'),
    executableListTask: _ev(ctx)('executableListTask'),
    executableListAction: _ev(ctx)('executableListAction'),
  })

let root: Component<S> = {
  name,
  state,
  inputs,
  actions,
  interfaces: {
    value: childValue,
  },
}

let emptyHandler: HandlerInterface = mod => ({
  state: undefined,
  handle: () => {},
  dispose: () => {},
})

describe('Context functions', function () {

  let lastLog

  let rootCtx: Context = {
    id: 'Main',
    name: 'Main',
    groups: {},
    global: {
      initialized: false,
    },
    groupHandlers: {},
    taskHandlers: {},
    interfaceHandlers: {},
    components: {}, // component index
    // error and warning handling
    warn: (source, description) => {
      lastLog = [source, description]
    },
    error: (source, description) => {
      lastLog = [source, description]
    },
  }

  let ctx: Context
  it('should create a child context (createContext)', () => {
    ctx = createContext(rootCtx, 'child')
    expect(ctx).toBeDefined()
  })

  it('should put an entry in warnLog when warn function is invoked', () => {
    let warn = ['child', 'warn 1']
    rootCtx.warn(warn[0], warn[1])
    expect(lastLog).toEqual(warn)
  })

  it('should put an entry in errorLog when error function is invoked', () => {
    let error = ['child', 'error 1']
    ctx.error(error[0], error[1])
    expect(lastLog).toEqual(error)
  })

  describe('ev function helper for sintetizing InputData', () => {

    it('should accept * for returning all the event object', () => {
      let data = _ev(ctx)('inputName', '*')
      expect(data).toEqual(['Main$child', 'inputName', '*', undefined, undefined])
    })

    it('should accept a property name for returning a part of the event object', () => {
      let data = _ev(ctx)('inputName', 'value')
      expect(data).toEqual(['Main$child', 'inputName', 'value', undefined, undefined])
    })

    it('should accept an extra argument', () => {
      let data = _ev(ctx)('inputName', 'value', 'extra')
      expect(data).toEqual(['Main$child', 'inputName', 'value', 'extra', undefined])
    })

    it('should accept an options argument', () => {
      let data = _ev(ctx)('inputName', 'value', 'extra', { default: false })
      expect(data).toEqual(['Main$child', 'inputName', 'value', 'extra', { default: false }])
    })

  })

  it('should nest a component to context (nest)', () => {
    nest(rootCtx)('child', root)
    expect(ctx.components[`Main$child`]).toBeDefined()
  })

  it('should nest a component to context (nest) and mark it as dynamic', () => {
    nest(rootCtx)('childDynamic', root, false)
    expect(ctx.components[`Main$childDynamic`]).toBeDefined()
  })

  it('should overwrite a component if has the same name and log a warning', () => {
    ctx.components[`Main$child`].state = 17
    nest(rootCtx)('child', root)
    expect(ctx.components[`Main$child`]).toBeDefined()
    // should overwrite
    expect(ctx.components[`Main$child`].state).toEqual(0)
    expect(lastLog)
      .toEqual(['nest', `component 'Main' has overwritten component space 'Main$child'`])
  })

})

describe('One Component + module functionality', function () {

  let valueFn
  let lastValue
  function onValue(val) {
    lastValue = val
    if (valueFn) {
      valueFn(val)
    }
  }

  let taskLog = []

  let logTask: Handler = log => mod => ({
    state: undefined,
    handle: (data: {info: any, cb: EventData}) => {
      log.push(data.info)
      mod.dispatch(data.cb)
    },
    dispose: () => {},
  })

  let lastLog
  let beforeInitCalled = false
  let initialized = false
  let disposed = false

  let app = run({
    root,
    beforeInit: () => {
      beforeInitCalled = true
    },
    init: () => {
      initialized = true
    },
    destroy: () => {
      disposed = true
    },
    tasks: {
      log: logTask(taskLog),
    },
    interfaces: {
      value: valueHandler(onValue),
    },
    warn: (source, description) => lastLog = [source, description],
    error: (source, description) => lastLog = [source, description],
  })

  it('should have initial state', () => {
    expect(lastValue.tagName).toBe('Main')
    expect(lastValue.content).toBe(0)
  })

  it('should call beforeInit hook after initialize a module', () => {
    expect(beforeInitCalled).toBe(true)
  })

  it('should call init hook when initialize a module', () => {
    expect(initialized).toBe(true)
  })

  it('should clone the state when nest a component if is an object', () => {
    let root: Component<any> = {
      name,
      state: {},
      inputs,
      actions,
      interfaces: {
        value: childValue,
      },
    }
    let app = run({
      root,
      interfaces: {
        value: emptyHandler,
      },
    })
    expect(app.ctx.components['Main'].state === root.state).toBeFalsy()
  })

  it('a component should work with no inputs', () => {
    let root: Component<any> = {
      name,
      state: {},
      interfaces: {
        value: childValue,
      },
    }
    let app = run({
      root,
      interfaces: {
        value: emptyHandler,
      },
    })
    expect(app).toBeDefined()
  })

  it('should log an error and notify error callback when module dont have an InterfaceHandler', () => {
    let lastLog
    run({
      root,
      interfaces: {},
      warn: (source, description) => lastLog = [source, description],
      error: (source, description) => lastLog = [source, description],
    })
    expect(lastLog).toEqual([
      'InterfaceHandlers',
      `'Main' component has no interface called 'value', missing interface handler`,
    ])
  })

  it('should log an error when call notifyInterfaceHandlers and one handler is missing', () => {
    let lastLog
    let app = run({
      root,
      interfaces: {},
      warn: (source, description) => lastLog = [source, description],
      error: (source, description) => lastLog = [source, description],
    })
    app.moduleAPI.nest('child', root)
    let space = app.ctx.components['Main$child']
    notifyInterfaceHandlers(space.ctx)
    expect(lastLog).toEqual([
      'notifyInterfaceHandlers',
      `module does not have interface handler named 'value' for component 'Main' from space 'Main$child'`,
    ])
  })

  // Inputs should dispatch actions and intefaces are recalculated

  let value

  it('should react to an input (dispatch function)', done => {
    valueFn = value => {
      expect(value.content).toBe(1)
      done()
    }
    // extract value and dispatch interface handlers
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({}, value.inc))
  })

  it('should dispatch an input with an extra as argument', done => {
    valueFn = value => {
      expect(value.content).toBe(10)
      done()
    }
    // extract value and dispatch interface handlers
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({}, value.set))
  })

  // fetch parameters for InputData

  it('should dispatch an input with a fetch parameter * as argument', done => {
    valueFn = value => {
      expect(value.content).toBe(24)
      done()
    }
    // extract value and dispatch interface handlers
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent(24, value.setFnAll))
  })

  it('should dispatch an input with a fetch parameter "value" as argument', done => {
    valueFn = value => {
      expect(value.content).toBe(35)
      done()
    }
    // extract value and dispatch interface handlers
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({ value: 35 }, value.setFnValue))
  })

  it('should dispatch an input with a function path string target.value as argument', done => {
    valueFn = value => {
      expect(value.content).toBe(37)
      done()
    }
    // extract value and dispatch interface handlers
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({ target: { value: 37 } }, value.setFnPath))
  })

  it('should dispatch an input with a fetch parameter "value" as argument and an extra argument', done => {
    valueFn = value => {
      expect(value.content).toBe(40)
      done()
    }
    // extract value and dispatch interface handlers
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({ value: 35 }, value.setFnExtra))
  })

  it('should dispatch an input with a fetch parameter "value" as argument and an extra argument and value are an empty string', done => {
    valueFn = value => {
      expect(value.content).toBe('')
      done()
    }
    // extract value and dispatch interface handlers
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({ value: '' }, value.setFnGeneric))
  })

  it('should return the keys of the event info when dispatch an input with keys in the fetch parameter', done => {
    valueFn = value => {
      expect(value.content).toEqual({ a: 10, b: 'Fractal' })
      done()
    }
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({ value: 35, a: 10, b: 'Fractal' }, value.setFnKeys))
  })

  it('should return the keys of the path of event info when dispatch an input with path and keys in the fetch parameter', done => {
    valueFn = value => {
      expect(value.content).toEqual({ a: 10, b: 'Fractal', c: 17 })
      done()
    }
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({
      a: 0,
      p1: {
        z: 1,
        p2: {
          value: 35,
          a: 10,
          b: 'Fractal',
          c: 17,
          z: 'WWW',
        },
      },
    }, value.setFnPathKeys))
  })

  it('should return multiple paths if there are an array of arrays in the fetch parameter', done => {
    valueFn = value => {
      expect(value.content).toEqual([
        1,
        0,
        { a: 10, b: 'Fractal', c: 17 },
      ])
      done()
    }
    value = lastValue // this catch the scope variable
    value._dispatch(computeEvent({
      a: 0,
      p1: {
        z: 1,
        p2: {
          value: 35,
          a: 10,
          b: 'Fractal',
          c: 17,
          z: 'WWW',
        },
      },
    }, value.setFnPaths))
  })

  it('should put an entry in errorLog when error function is invoked', () => {
    let error = ['child', 'error 1']
    app.ctx.error(error[0], error[1])
    expect(lastLog).toEqual(error)
  })

  it('should execute beforeInput before dispatch an input', done => {
    let valueFn
    let lastValue
    function onValue(val) {
      lastValue = val
      if (valueFn) {
        valueFn(val)
      }
    }

    let app = run({
      root,
      interfaces: {
        value: valueHandler(onValue),
      },
      beforeInput: (ctx, inputName, data) => {
        expect(ctx === app.ctx)
        expect(inputName).toEqual('set')
        expect(data).toEqual(10)
        expect(ctx.components.Main.state).toEqual(0)
        done()
      },
    })

    lastValue._dispatch(computeEvent({}, value.set))

  })

it('should execute afterInput before dispatch an input', done => {
    let valueFn
    let lastValue
    function onValue(val) {
      lastValue = val
      if (valueFn) {
        valueFn(val)
      }
    }

    let app = run({
      root,
      interfaces: {
        value: valueHandler(onValue),
      },
      afterInput: (ctx, inputName, data) => {
        expect(ctx === app.ctx)
        expect(inputName).toEqual('set')
        expect(data).toEqual(10)
        expect(ctx.components.Main.state).toEqual(10)
        done()
      },
    })

    lastValue._dispatch(computeEvent({}, value.set))

  })


  it('should delegate warn function', () => {
    let warn = ['child', 'warn 1']
    app.ctx.warn(warn[0], warn[1])
    expect(lastLog).toEqual(warn)
  })

  it('should log an error when try to dispatch an input of an inexistent module', () => {
    value._dispatch(['Main$someId', 'someInput'])
    expect(lastLog).toEqual([
      'dispatch',
      `there are no component space 'Main$someId'`,
    ])
  })

  it('should log an error when try to dispatch an inexistent input of a module', () => {
    value._dispatch(['Main', 'someInput'])
    expect(lastLog).toEqual([
      'execute',
      `there are no input named 'someInput' in component 'Main' from space 'Main'`,
    ])
  })

  // Events should dispatch tasks to its handlers and those can dispatch events

  it('should dispatch an executable (action / task) asyncronusly from an event when it return a Task with EventData', done => {
    app.ctx.components['Main'].state = 1
    valueFn = value => {
      expect(value.content).toBe(2)
      expect(taskLog[taskLog.length - 1]).toEqual('info')
      done()
    }
    value._dispatch(value.task)
  })

  it('should log an error when try to dispatch an task that has no task handler', () => {
    valueFn = undefined
    value._dispatch(value.wrongTask)
    expect(lastLog).toEqual([
      'execute',
      `there are no task handler for 'wrongTask' in component 'Main' from space 'Main'`,
    ])
  })

  // Executable lists

  it('should dispatch an error if try to dispatch an executable list with a task with no handler', () => {
    valueFn = undefined
    value._dispatch(value.executableListWrong)
    expect(lastLog).toEqual([
      'execute',
      `there are no task handler for 'wrongTask2' in component 'Main' from space 'Main'`,
    ])
  })

  it('should dispatch an executable list that contains a task', done => {
    valueFn = value => {
      expect(value.content).toBe(3)
      expect(taskLog[taskLog.length - 1]).toEqual('info2')
      done()
    }
    value._dispatch(value.executableListTask)
  })

  it('should dispatch an executable list that contains an action', done => {
    valueFn = value => {
      expect(value.content).toBe(4)
      done()
    }
    value._dispatch(value.executableListAction)
  })

  // dispose module

  it('should dispose a module', () => {
    app.moduleAPI.dispose()
    expect(app.ctx.components).toEqual({})
  })

  it('should call destroy hook when dispose a module', () => {
    expect(disposed).toEqual(true)
  })

})


describe('toIt core function for executing inputs', () => {
  let rootData
  const actions = {
    Set: assoc('count'),
  }
  let root: Component<any> = {
    name: 'Root',
    state: {
      count: 0,
      data: 10,
    },
    inputs: () => ({
      input: data => {
        rootData = data
      },
      set: actions.Set,
    }),
    actions,
    interfaces: {
      value: ({ ctx }) => s => ({
        count: s.count,
      }),
    },
  }
  let valueCb
  let app = run({
    root,
    interfaces: {
      value: valueHandler(v => {
        if (valueCb) {
          valueCb(v)
        }
      }),
    },
  })

  it ('toIt should send a message to an input sync', () => {
    let data = 129
    toIt(app.ctx.components['Root'].ctx)('input', data, false, true)
    expect(rootData).toEqual(data)
  })

  it ('toIt should send a message to an input async', done => {
    let data = 127
    let value
    valueCb = v => {
      value = v.count
      expect(value).toEqual(data)
      done()
    }
    toIt(app.ctx.components['Root'].ctx)('set', data, true, true)
    expect(value).toEqual(undefined)
  })

})

describe('Component composition', () => {

  // Managed composition

  // for building new components reutilize the existents

  let child: Component<any> = {
    name: 'Child',
    groups: {
      value: 'ChildValueGroup',
    },
    state,
    inputs,
    actions,
    interfaces: {
      value: childValue,
    },
  }

  let components = {
    child1: child,
    child2: child,
    child3: child,
  }

  let mainValue: ValueInterface<any> =
    ({ ctx }) => s => ({
      tagName: s.key,
      content: s,
      inc: _ev(ctx)('inc'),
      childValue1: _interfaceOf(ctx)('child1', 'value'),
      childValue2: _interfaceOf(ctx)('child2', 'value'),
      childValue3: _interfaceOf(ctx)('child3', 'value'),
    })

  let main: Component<any> = {
    name: 'Main',
    groups: {
      value: 'MainValueGroup',
    },
    state,
    components,
    inputs,
    actions,
    interfaces: {
      value: mainValue,
    },
  }

  let app: Module

  let valueFn
  let lastValue
  function onValue(val) {
    lastValue = val
    if (valueFn) {
      valueFn(val)
    }
  }
  let lastGroup
  let groupLog = []
  let groupHandler: Handler = () => mod => ({
    state: undefined,
    handle: ([id, group]) => {
      lastGroup = group
      groupLog.push(group)
      mod.setGroup(id, 'value', group + 'F1')
    },
    dispose: () => 0,
  })

  it('should nest child components', () => {
    app = run({
      root: main,
      groups: {
        value: groupHandler(),
      },
      interfaces: {
        value: valueHandler(onValue),
      }
    })
    expect(app.ctx.components['Main$child1']).toBeDefined()
    expect(app.ctx.components['Main$child2']).toBeDefined()
    expect(app.ctx.components['Main$child3']).toBeDefined()
  })

  it('should handle groups', () => {
    expect(groupLog).toEqual(['ChildValueGroup', 'ChildValueGroup', 'ChildValueGroup', 'MainValueGroup'])
  })

  it('should nest groups', () => {
    expect(app.ctx.components['Main'].ctx.groups['value']).toEqual('MainValueGroupF1')
    expect(app.ctx.components['Main$child1'].ctx.groups['value']).toEqual('ChildValueGroupF1')
    expect(app.ctx.components['Main$child2'].ctx.groups['value']).toEqual('ChildValueGroupF1')
    expect(app.ctx.components['Main$child3'].ctx.groups['value']).toEqual('ChildValueGroupF1')
  })

  it('should log an error when module does not have group handler for a certain group from a component', () => {
    let log
    run({
      root: main,
      groups: {
        wrong: groupHandler(),
      },
      interfaces: {
        value: emptyHandler,
      },
      error: (source, description) => log = [source, description],
    })
    expect(log).toEqual([
      'nest',
      `module has no group handler for 'value' of component 'Main' from space 'Main'`
    ])
  })

  it('a child should react to events', done => {
    let value = lastValue
    valueFn = value => {
      expect(value.childValue1.content).toBe(1)
      expect(value.childValue2.content).toBe(0)
      expect(value.childValue3.content).toBe(0)
      done()
    }
    value._dispatch(value.childValue1.inc)
  })

  it('a child should dispatch his own inputs', done => {
    let value = lastValue
    valueFn = value => {
      expect(value.childValue1.content).toBe(2)
      done()
    }
    value._dispatch(value.childValue1.dispatch)
  })

describe('toChild function', () => {
    let childData
    let Child: Component<any> = {
      name: 'Child',
      state: {
        count: 0,
        data: 10,
      },
      inputs: ctx => ({
        childInput: data => {
          childData = data
        },
      }),
      actions: {},
      interfaces: {},
    }
    let root: Component<any> = {
      name: 'Root',
      components: {
        Child,
      },
      state: {},
      inputs: ctx => ({}),
      actions: {},
      interfaces: {},
    }
    let error
    let app = run({
      root,
      interfaces: {},
      error: (source, description) => error = [source, description],
    })

    it ('should send a message to a child component from the parent correctly', () => {
      let data1 = 129
      let data2 = 129
      toChild(app.ctx.components['Root'].ctx)('Child', 'childInput', data1)
      expect(childData).toEqual(data1)
      toChild(app.ctx.components['Root'].ctx)('Child', 'childInput', data2, false, true)
      expect(childData).toEqual(data2)
    })

    it ('should send an undefined message to a child component from the parent correctly', () => {
      toChild(app.ctx.components['Root'].ctx)('Child', 'childInput')
      expect(childData).toEqual(undefined)
    })

    it ('should log an error when there is no child', () => {
      toChild(app.ctx.components['Root'].ctx)('Wrong', 'childInput')
      expect(error).toEqual(['toChild', `there are no child 'Wrong' in space 'Root'`])
    })

  })


  describe('Input propagation', () => {
    let valueCb
    let app
    let propagationSequence = []

    beforeEach(() => {
      let Child: Component<any> = {
        name: 'CompName',
        state: {},
        inputs: ctx => ({
          childInput: x => {},
        }),
        actions: {},
        interfaces: {},
      }
      const actions = {
        Set: ([name, value]) => assoc(name)(value),
      }
      let root: Component<any> = {
        name: 'Root',
        components: {
          SpaceName: Child,
        },
        state: {
          simpleCount: 0,
          dynamicCount: 0,
          generalCount: 0,
        },
        inputs: ctx => ({
          $SpaceName_childInput: x => {
            propagationSequence.push('simple')
            return actions.Set(['simpleCount', x])
          },
          $$CompName_childInput: x => {
            propagationSequence.push('dynamic')
            return actions.Set(['dynamicCount', x])
          },
          $_childInput: x => {
            propagationSequence.push('general')
            return actions.Set(['generalCount', x])
          },
        }),
        actions,
        interfaces: {
          value: () => s => ({
            simpleCount: s.simpleCount,
            dynamicCount: s.dynamicCount,
            generalCount: s.generalCount,
          }),
        },
      }
      app = run({
        root,
        interfaces: {
          value: valueHandler(v => {
            if (valueCb) {
              valueCb(v)
            }
          }),
        },
      })

    })

    it('simple propagation: parent should react to childInput when have an input called $SpaceName_childInput', done => {
      let data = 17
      let calls = 0
      valueCb = value => {
        calls++
        if (calls === 1) {
          expect(value.simpleCount).toEqual(data)
          done()
        }
      }
      toIt(app.ctx.components.Root$SpaceName.ctx)('childInput', data)
    })

    it('dynamic propagation: parent should react to childInput when have an input called $$CompName_childInput', done => {
      let data = 23
      let calls = 0
      valueCb = value => {
        calls++
        if (calls === 2) {
          expect(value.dynamicCount).toEqual(['SpaceName', data])
          done()
        }
      }
      toIt(app.ctx.components.Root$SpaceName.ctx)('childInput', data)
    })

    it('general propagation: parent should react to childInput when have an input called $_childInput', done => {
      let data = 31
      let calls = 0
      valueCb = value => {
        calls++
        if (calls === 3) {
          expect(value.generalCount).toEqual(['SpaceName', data, 'CompName'])
          done()
        }
      }
      toIt(app.ctx.components.Root$SpaceName.ctx)('childInput', data)
    })

    it('propagation sequence: simple, dynamic and general', done => {
      propagationSequence = []
      let data = 37
      let calls = 0
      valueCb = value => {
        calls++
        if (calls === 3) {
          expect(propagationSequence).toEqual(['simple', 'dynamic', 'general'])
          done()
        }
      }
      toIt(app.ctx.components.Root$SpaceName.ctx)('childInput', data)
    })

  })

  it('should unnest a component tree', () => {
    unnest(app.ctx)()
    expect(Object.keys(app.ctx.components).length).toEqual(0)
  })

  it('should log an error when unnest an inexistent component', () => {
    let lastLog
    app = run({
      root: main,
      groups: {
        value: emptyHandler,
      },
      interfaces: {
        value: valueHandler(() => 0),
      },
      error: (source, description) => lastLog = [source, description],
    })
    unnest(app.ctx)('wrong')
    expect(lastLog).toEqual([
      'unnest',
      `there is no component with name 'wrong' at component 'Main'`,
    ])
  })

  // module API

  it('module API nest should nest a component', () => {
    app = run({
      root: main,
      groups: {
        value: emptyHandler,
      },
      interfaces: {
        value: valueHandler(() => 0),
      },
    })
    app.moduleAPI.nest('mainChild', main)
    expect(app.ctx.components['Main$mainChild']).toBeDefined()
    expect(app.ctx.components['Main$mainChild$child1']).toBeDefined()
    expect(app.ctx.components['Main$mainChild$child2']).toBeDefined()
    expect(app.ctx.components['Main$mainChild$child3']).toBeDefined()
  })

  it('module API nestAll should nest many components', () => {
    app.moduleAPI.nestAll({
      fancyChild1: child,
      fancyChild2: child,
      fancyChild3: child,
    })
    expect(app.ctx.components['Main$fancyChild1']).toBeDefined()
    expect(app.ctx.components['Main$fancyChild2']).toBeDefined()
    expect(app.ctx.components['Main$fancyChild3']).toBeDefined()
  })

  it('module API unnest should unnest a component tree', () => {
    app.moduleAPI.unnest('mainChild')
    expect(app.ctx.components['Main$mainChild']).toBeUndefined()
    expect(app.ctx.components['Main$mainChild$child1']).toBeUndefined()
    expect(app.ctx.components['Main$mainChild$child2']).toBeUndefined()
    expect(app.ctx.components['Main$mainChild$child3']).toBeUndefined()
  })

  it('module API unnestAll should unnest many components', () => {
    app.moduleAPI.nestAll({
      fancyChild1: child,
      fancyChild2: child,
      fancyChild3: child,
    })
    app.moduleAPI.unnestAll([
      'fancyChild1',
      'fancyChild2',
      'fancyChild3',
    ])
    expect(app.ctx.components['Main$fancyChild1']).toBeUndefined()
    expect(app.ctx.components['Main$fancyChild2']).toBeUndefined()
    expect(app.ctx.components['Main$fancyChild3']).toBeUndefined()
  })

})

describe('Lifecycle hooks', () => {
  let disposeLog = []

  let init = ctx => {
    toIt(ctx)('inc')
  }
  let destroy = ctx => {
    let parts = ctx.id.split('$')
    disposeLog.push(parts[parts.length - 1])
  }

  let child: Component<any> = {
    name: 'Child',
    state,
    init,
    destroy,
    inputs,
    actions,
    interfaces: {
      value: childValue,
    },
  }
  let components = {
    child1: child,
    child2: child,
    child3: child,
  }
  let mainValue: ValueInterface<any> =
    ({ ctx }) => s => ({
      tagName: s.key,
      content: s,
      inc: _ev(ctx)('inc'),
      childValue1: _interfaceOf(ctx)('child1', 'value'),
      childValue2: _interfaceOf(ctx)('child2', 'value'),
      childValue3: _interfaceOf(ctx)('child3', 'value'),
    })

  let main: Component<any> = {
    name: 'Main',
    state,
    init,
    destroy,
    components,
    inputs,
    actions,
    interfaces: {
      value: mainValue,
    },
  }

  let app: Module

  let valueFn
  let lastValue
  function onValue(val) {
    lastValue = val
    if (valueFn) {
      valueFn(val)
    }
  }

  let value

  it('should call init in all component tree when initialize the module', () => {
    app = run({
      root: main,
      interfaces: {
        value: valueHandler(onValue),
      },
    })
    value = lastValue
    expect(value.childValue1.content).toBe(1)
    expect(value.childValue2.content).toBe(1)
    expect(value.childValue3.content).toBe(1)
  })

  it('should call destroy in all component tree when dispose the module', () => {
    app.moduleAPI.dispose()
    expect(disposeLog).toEqual(['child1', 'child2', 'child3', 'Main'])
  })

})

describe('Hot swapping', () => {

  let child: Component<any> = {
    name: 'Child',
    state,
    inputs,
    actions,
    interfaces: {
      value: childValue,
    },
  }
  let components = {
    child1: child,
    child2: child,
    child3: child,
  }
  let actions2 = {
    Inc: () => s => {
      s.count++
      return s
    },
  }
  let inputs2 = ({ ctx }) => ({
    inc: () => actions2.Inc(),
  })
  let mainValueV1: ValueInterface<any> =
    ({ ctx }) => s => ({
      tagName: ctx.name,
      content: s.count,
      content2: s.count2,
      inc: _ev(ctx)('inc'),
      childValue1: _interfaceOf(ctx)('child1', 'value'),
      childValue2: _interfaceOf(ctx)('child2', 'value'),
      childValue3: _interfaceOf(ctx)('child3', 'value'),
    })

  let mainV1: Component<any> = {
    name: 'Main',
    state: {
      count: 0,
      count2: 12,
    },
    components,
    actions: actions2,
    inputs: inputs2,
    interfaces: {
      value: mainValueV1,
    },
  }

  let mainValueV2: ValueInterface<any> =
    ({ ctx }) => s => ({
      tagName: ctx.name,
      content: 'Fractal is awesome V2!! ' + s.count + ' :D',
      content2: 'Fractal is awesome V2!! ' + s.count2 + ' :D',
      inc: _ev(ctx)('inc'),
      childValue1: _interfaceOf(ctx)('child1', 'value'),
      childValue2: _interfaceOf(ctx)('child2', 'value'),
      childValue3: _interfaceOf(ctx)('child3', 'value'),
    })

  let mainV2: Component<any> = {
    name: 'Main',
    state: {
      count: 0,
      count2: 125,
    },
    components,
    actions: actions2,
    inputs: inputs2,
    interfaces: {
      value: mainValueV2,
    },
  }

  let app: Module

  let valueFn
  let lastValue
  function onValue(val) {
    lastValue = val
    if (valueFn) {
      valueFn(val)
    }
  }

  let value

  it('should reattach root component', () => {
    app = run({
      root: mainV1,
      interfaces: {
        value: valueHandler(onValue),
      },
    })
    app.moduleAPI.reattach(mainV2)
    value = lastValue
    expect(value.content).toBe('Fractal is awesome V2!! 0 :D')
    expect(value.childValue1.content).toBe(0)
    expect(value.childValue2.content).toBe(0)
    expect(value.childValue3.content).toBe(0)
  })

  it('should reattach root component merging the states using ', () => {
    app = run({
      root: mainV1,
      interfaces: {
        value: valueHandler(onValue),
      },
    })
    value = lastValue
    value._dispatch(value.inc)
    value = lastValue
    expect(value.content).toBe(1)
    expect(value.content2).toBe(12)
    app.moduleAPI.reattach(mainV2, mergeStates)
    value = lastValue
    expect(value.content).toBe('Fractal is awesome V2!! 1 :D')
    expect(value.content2).toBe('Fractal is awesome V2!! 125 :D')
  })

})

describe('Clone function helper', () => {

  let obj2 = {
    a: 9,
    b: [],
  }
  let obj = {
    c: {
      obj2,
    },
  }
  let obj3 = clone(obj)

  it('should deep clone an object', () => {
    obj3.c.obj2.a = 3
    expect(obj3.c.obj2.a === obj2.a).toBeFalsy()
    expect(obj3.c.obj2.b === obj2.b).toBeFalsy()
  })

})
