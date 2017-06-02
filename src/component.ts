import {
  Actions,
  Update,
  Component,
  Context,
  Group,
  Module,
  toIt,
} from './core'

// set of helpers for building components

// generic action input
export const action = (actions: Actions<any>) => ([arg1, arg2]: any): Update<any> => {
  let name
  let value
  if (arg1 instanceof Array) {
    name = arg1[0]
    value = arg1[1]
    if (arg2 !== undefined) {
      // add fetch value
      value = [value, arg2]
    }
  } else {
    name = arg1
    value = arg2
  }
  return actions[name](value)
}

// generic action self caller
export const toAct = (ctx: Context, actionName: string, data?: any, isPropagated = true) => {
  return toIt(ctx, 'action', [actionName, data], isPropagated)
}

// --- Message interchange between components

// send a message to an input of a component from outside a Module
/* istanbul ignore next */
export function sendMsg (mod: Module, id: string, inputName: string, msg?, isPropagated = true) {
  let ctx = mod.ctx
  toIt(ctx.components[id].ctx, inputName, msg, isPropagated)
}

// send a message to an input of a component from its parent
export function toChild (ctx: Context, name: string, inputName: string, msg = undefined, isPropagated = true) {
  let childId = ctx.id + '$' + name
  toIt(ctx.components[childId].ctx, inputName, msg, isPropagated)
}

// ---

// make a new component from another merging her state
export function props (state) {
  return function (comp: Component<any>): Component<any> {
    if (comp.state !== null && typeof comp.state === 'object'
    && state !== null && typeof state === 'object') {
      comp.state = Object.assign(comp.state, state)
    } else {
      comp.state = state
    }
    return comp
  }
}

export function setGroup (name: string, group: Group) {
  return function (comp: Component<any>): Component<any> {
    comp.groups[name] = group
    return comp
  }
}

export function stateOf (ctx: Context, name?: string): any {
  let id = name ? ctx.id + '$' + name : ctx.id
  let space = ctx.components[id]
  if (space) {
    return space.state
  } else {
    ctx.error('stateOf',
      name
      ? `there are no child '${name}' in space '${ctx.id}'`
      : `there are no space '${id}'`
    )
  }
}

export function spaceOf (ctx: Context): any {
  return ctx.components[ctx.id]
}
