import {
  describe, it, expect, afterEach
} from 'vitest'

const {
  sr5HookMarkForeignWindow, applyModuleDress, modulesDressed, isDressExcluded,
  FOREIGN_WINDOW_CLASS, DRESS_OFF_CLASS, DRESS_BODY_CLASS, DRESS_EXCLUDED, DRESS_SETTING
} = await import('../modules/hooks/window-scope.js')

// A window element: its classes, and the classes of what it holds for querySelector
const el = (classes, inner = []) => {
  const set = new Set(classes)
  return {
    id: '',
    classList: {
      contains: c => set.has(c), toggle: (c, on) => (on ? set.add(c) : set.delete(c)), [Symbol.iterator]: () => set[Symbol.iterator]()
    },
    matches: sel => sel.split(',').some(s => s.trim().startsWith('.') && set.has(s.trim().slice(1))),
    querySelector: sel => (inner.includes(sel.slice(1)) ? {
    } : null),
    has: c => set.has(c),
  }
}

// A module's window (its class is not one of Foundry's)
class ModuleApp {}
const render = element => {
  globalThis.foundry = {
    applications: {
    }, appv1: {
    } 
  }
  sr5HookMarkForeignWindow(Object.assign(new ModuleApp(), {
    element, options: {
      classes: [] 
    } 
  }))
  return element
}

afterEach(() => {
  delete globalThis.game
  delete globalThis.document
})

describe('the SR5 dress of the modules\' windows', () => {
  it('dresses a module\'s window: marked foreign, not excluded', () => {
    const w = render(el(['application', 'dice-so-nice']))
    expect(w.has(FOREIGN_WINDOW_CLASS)).toBe(true)
    expect(w.has(DRESS_OFF_CLASS)).toBe(false)
  })

  it('leaves Matrice and Topologie in their own look, by their class or what the window holds', () => {
    expect(render(el(['application', 'matrice-sr5', 'matrice-dark-dialog'])).has(DRESS_OFF_CLASS)).toBe(true)
    expect(render(el(['application', 'some-dialog'], ['topologie-sr5'])).has(DRESS_OFF_CLASS)).toBe(true)
    expect(DRESS_EXCLUDED).toEqual(expect.arrayContaining(['.matrice-sr5', '.topologie-sr5']))
  })

  it('never marks the system\'s windows excluded, nor keeps the mark once a window is no longer foreign', () => {
    const w = el(['application', 'sr-application', 'matrice-sr5', DRESS_OFF_CLASS, FOREIGN_WINDOW_CLASS])
    render(w)
    expect(w.has(FOREIGN_WINDOW_CLASS)).toBe(false)
    expect(w.has(DRESS_OFF_CLASS)).toBe(false)
  })

  it('a second render keeps the window foreign: the exclusion mark is not taken for a module class', () => {
    const w = render(el(['application', 'matrice-sr5']))
    render(w)
    expect(w.has(FOREIGN_WINDOW_CLASS)).toBe(true)
    expect(w.has(DRESS_OFF_CLASS)).toBe(true)
  })

  it('isDressExcluded survives an element without querySelector', () => {
    expect(isDressExcluded({
      matches: () => false 
    })).toBe(false)
  })

  it('the setting is checked by default, and its value puts the body class on or off', () => {
    const body = el([])
    globalThis.document = {
      body 
    }
    globalThis.game = {
      settings: {
        get: () => { throw new Error('not registered') } 
      } 
    }
    expect(modulesDressed()).toBe(true)
    applyModuleDress()
    expect(body.has(DRESS_BODY_CLASS)).toBe(true)

    globalThis.game = {
      settings: {
        get: (ns, key) => (ns === 'sr5' && key === DRESS_SETTING ? false : undefined) 
      } 
    }
    expect(modulesDressed()).toBe(false)
    applyModuleDress()
    expect(body.has(DRESS_BODY_CLASS)).toBe(false)
    applyModuleDress(true)
    expect(body.has(DRESS_BODY_CLASS)).toBe(true)
  })
})
