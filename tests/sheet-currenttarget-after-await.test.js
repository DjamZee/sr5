import {
  describe, it, expect, vi, afterEach
} from 'vitest'
import {
  readFileSync, readdirSync, statSync
} from 'node:fs'
import {
  join
} from 'node:path'
import * as espree from 'espree'

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {}
  }
})

import {
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'
import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_SocketHandler
} from '../modules/socket.js'

// A browser clears event.currentTarget as soon as the listener yields to its first await:
// a handler that reads it afterwards gets null ("retirer du PAN" crashed on it).
function browserClick(target){
  let dispatching = true
  const event = {
    preventDefault(){},
    target,
    get currentTarget(){
      return dispatching ? target : null
    },
  }
  return {
    event, run: (handler) => {
      const done = handler(event)
      dispatching = false
      return done
    }
  }
}

function sheetWith(props){
  const sheet = Object.create(ActorSheetSR5.prototype)
  for (const [key, value] of Object.entries(props)) Object.defineProperty(sheet, key, {
    value, configurable: true
  })
  return sheet
}

describe('a sheet button still knows what was clicked after an await', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function panSheet(unsaved){
    globalThis.foundry.applications.ux ??= {
    }
    globalThis.foundry.applications.ux.FormDataExtended ??= class {}
    const document = {
      update: vi.fn(async () => {
        await Promise.resolve()
      })
    }
    return sheetWith({
      actor: {
        id: 'A1', isToken: false
      },
      document, element: {
      }, isEditable: true,
      _processFormData: () => unsaved,
    })
  }
  const removeButton = {
    dataset: {
      index: '2', key: 'Actor.A1.Item.I1'
    }
  }

  it('the GM removes the device from the PAN after saving the unsaved changes', async () => {
    vi.stubGlobal('game', {
      ...globalThis.game, user: {
        isGM: true
      }
    })
    const remove = vi.spyOn(SR5_ActorHelper, 'deleteItemFromPan').mockResolvedValue()
    const sheet = panSheet({
      name: 'changed'
    })
    await browserClick(removeButton).run(e => sheet._onDeleteItemFromPan(e))
    expect(sheet.document.update).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith('Actor.A1.Item.I1', 'A1', '2')
  })

  it('a player asks the GM for the same device', async () => {
    vi.stubGlobal('game', {
      ...globalThis.game, user: {
        isGM: false
      }
    })
    const emit = vi.spyOn(SR5_SocketHandler, 'emitForGM').mockResolvedValue()
    const sheet = panSheet({
      name: 'changed'
    })
    await browserClick(removeButton).run(e => sheet._onDeleteItemFromPan(e))
    expect(emit).toHaveBeenCalledWith('deleteItemFromPan', {
      targetItem: 'Actor.A1.Item.I1', index: '2', actorId: 'A1'
    })
  })

  it('an item summary opens, with the accessory indent of the clicked row', async () => {
    const made = []
    const element = () => {
      const el = {
        className: '', children: [], innerHTML: '',
        appendChild: c => el.children.push(c),
        insertAdjacentHTML(){}, addEventListener(){}, querySelectorAll: () => [],
      }
      made.push(el)
      return el
    }
    vi.stubGlobal('document', {
      createElement: element
    })
    const classes = new Set()
    const li = {
      dataset: {
        itemId: 'I1'
      },
      classList: {
        contains: c => classes.has(c), toggle: c => classes.has(c) ? classes.delete(c) : classes.add(c)
      },
      appendChild: vi.fn(),
      querySelector: () => null,
    }
    const clicked = {
      closest: () => li,
      classList: {
        contains: c => c === 'SR-MarginLeft10'
      },
    }
    const item = {
      id: 'I1',
      getExpandData: async () => ({
        properties: ['Indice 3'], gameEffect: 'effet'
      })
    }
    const sheet = sheetWith({
      actor: {
        isOwner: true, items: {
          get: () => item
        }
      },
      _expandedItems: new Set(),
    })
    await browserClick(clicked).run(e => sheet._onItemSummary({
      ...e, target: {
        closest: () => null
      }, get currentTarget(){
        return e.currentTarget
      }
    }))
    expect(li.appendChild).toHaveBeenCalled()
    expect(made[0].className).toBe('col-x item-summary SR-MarginLeft10')
    expect(sheet._expandedItems.has('I1')).toBe(true)
  })
})

// The same mistake anywhere else in the system: event.currentTarget read, in a handler,
// after one of its awaits (or from inside a callback that runs later).
function lateCurrentTargetReads(dir){
  const found = []
  const files = []
  ;(function walk(d){
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.js')) files.push(p)
    }
  })(dir)
  const isFn = n => /Function/.test(n.type)
  const children = n => Object.values(n).flatMap(v => Array.isArray(v) ? v : [v]).filter(v => v && typeof v.type === 'string')
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const ast = espree.parse(src, {
      ecmaVersion: 'latest', sourceType: 'module', range: true
    })
    const line = at => src.slice(0, at).split('\n').length
    const visitFn = (fn, outer) => {
      const params = new Set(fn.params.filter(p => p.type === 'Identifier').map(p => p.name))
      const awaits = [], reads = []
      const walk = n => {
        if (n !== fn && isFn(n)) return visitFn(n, new Set([...outer, ...params]))
        if (n.type === 'AwaitExpression' || (n.type === 'ForOfStatement' && n.await)) awaits.push(n.range[1])
        if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'currentTarget') reads.push(n)
        children(n).forEach(walk)
      }
      walk(fn.body)
      for (const r of reads) {
        const name = r.object.type === 'Identifier' ? r.object.name : null
        const closure = name && !params.has(name) && outer.has(name)
        if (closure || awaits.some(end => end <= r.range[0])) found.push(`${file}:${line(r.range[0])}`)
      }
    }
    const top = n => isFn(n) ? visitFn(n, new Set()) : children(n).forEach(top)
    top(ast)
  }
  return found
}

describe('no handler reads event.currentTarget after an await', () => {
  it('in any module of the system', () => {
    expect(lateCurrentTargetReads('modules')).toEqual([])
  })
})
