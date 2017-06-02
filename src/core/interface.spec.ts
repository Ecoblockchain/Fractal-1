import { Context, Component } from './core'
import { createContext, run, nest } from './module'
import { ev, act, interfaceOf, makeInterfaceHelpers, vw } from './interface'
import { ValueInterface } from '../interfaces/value'

describe('Interface functions and helpers', () => {

  describe('interfaceOf function', () => {

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

    let childValue: ValueInterface<any> =
      ({ ctx }) => s => ({
        tagName: ctx.id,
        content: s,
      })

    let root: Component<any> = {
      name: 'Child',
      state: 0,
      inputs: () => ({}),
      actions: {},
      interfaces: {
        value: childValue,
      },
    }

    nest(rootCtx, 'Child', root)


    it('should get an interface message from a certain component (interfaceOf)', () => {
      let state = rootCtx.components[rootCtx.id + '$Child'].state
      expect(interfaceOf(rootCtx)('Child', 'value'))
        .toEqual(
          childValue(
            makeInterfaceHelpers(createContext(rootCtx, 'Child'))
          )(state)
        )
    })

    it('should log an error if try to get an interface message from an inexistent component (interfaceOf)', () => {
      interfaceOf(rootCtx)('Wrong', 'value')
      expect(lastLog).toEqual([
        'interfaceOf',
        `there are no component space 'Main$Wrong'`,
      ])
    })

    it('should log an error if try to get an inexistent interface message from a certain component (interfaceOf)', () => {
      interfaceOf(rootCtx)('Child', 'wrong')
      expect(lastLog).toEqual([
        'interfaceOf',
        `there are no interface 'wrong' in component 'Child' from space 'Main$Child'`,
      ])
    })

  })

  describe('act function sugar for generic inputs', () => {
    let ctx = {}
    let ctxEv = ev(<any> ctx)
    it('should return the same as ev without the input name', () => {
      expect(act(ctxEv)('actionName', 's', 'value')).toEqual(ev(<any> ctx)('action', ['actionName', 's'], 'value'))
    })

    it('should return the same as ev without the input name when context data is undefined', () => {
      expect(act(ctxEv)('actionName', undefined, 'value')).toEqual(ev(<any> ctx)('action', 'actionName', 'value'))
    })

  })

    describe('vw function sugar for components', () => {
    let child: Component<any> = {
      name: 'Child',
      state: {
        count: 0,
        data: 10,
      },
      inputs: ctx => ({}),
      actions: {},
      interfaces: {},
    }
    let comp: Component<any> = {
      name: 'MyComp',
      components: {
        child,
      },
      state: {
        count: 0,
        data: 10,
      },
      inputs: ctx => ({}),
      actions: {},
      interfaces: {},
    }
    let app = run({
      root: comp,
      interfaces: {},
    })

    it ('should be the same to use vw and interfaceOf functions', () => {
      let ctxInterfaceOf = interfaceOf(app.ctx)
      let interfaceObj = vw(ctxInterfaceOf)('child')
      expect(interfaceObj).toEqual(interfaceOf(app.ctx.components['MyComp'].ctx)('child', 'view'))
    })

  })

})
