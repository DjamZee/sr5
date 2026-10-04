import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
      _onDragStart(){}
    }
  }
})

import {
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'

// Dragging inside the sheet (a deck's attribute array, a swap between two matrix attributes)
// never touches the canvas: it must work with no scene displayed.
function dragFrom(dataset){
  const setData = vi.fn()
  const target = {
    dataset, id: 'value1', closest: () => target
  }
  return {
    event: {
      target, dataTransfer: {
        setData
      }
    }, setData
  }
}

describe('sheet drag start without a scene', () => {
  it('carries a deck value from the attribute array when no canvas is ready', async () => {
    globalThis.canvas = {
      ready: false
    }
    const sheet = Object.create(ActorSheetSR5.prototype)
    const {
      event, setData 
    } = dragFrom({
      matrixattribute: '6'
    })
    await sheet._onDragStart(event)
    expect(setData).toHaveBeenCalledWith('text/plain', JSON.stringify({
      value: '6', valueFromCollection: 'value1'
    }))
  })

  it('carries a swap between two matrix attributes when no canvas is ready', async () => {
    globalThis.canvas = {
      ready: false
    }
    const sheet = Object.create(ActorSheetSR5.prototype)
    const {
      event, setData 
    } = dragFrom({
      dropmatrixattribute: 'attack', droppedvalue: '5'
    })
    await sheet._onDragStart(event)
    expect(setData).toHaveBeenCalledWith('text/plain', JSON.stringify({
      value: '5', valueFromAttribute: 'attack'
    }))
  })
})
