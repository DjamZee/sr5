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
    }
  }
})

import {
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'
import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

// Cora's review, point 1: between the deploy click and the sheet being drawn again, the wireless
// toggle of the vehicle row still showed; a click there switched an item that no longer decides
function rowWithToggle(on){
  const icon = {
    classList: new Set(on ? ['fas', 'fa-wifi', 'SR-SubColor'] : ['fas', 'fa-wifi'])
  }
  icon.classList.replace = (a, b) => {
    icon.classList.delete(a); icon.classList.add(b)
  }
  icon.classList.contains = (c) => icon.classList.has(c)
  const cell = {
    inert: false, dataset: {
    }
  }
  const toggle = {
    parentElement: cell, querySelector: () => icon
  }
  return {
    row: {
      querySelector: (sel) => sel.includes('system.wirelessTurnedOn') ? toggle : null
    }, cell, icon
  }
}

describe('vehicle row at the deploy click (N83, review)', () => {
  globalThis.game ??= {
  }
  globalThis.game.i18n = {
    localize: (k) => k
  }

  it('greys the wireless cell and makes it unclickable at once', () => {
    const {
      row, cell, icon 
    } = rowWithToggle(true)
    ActorSheetSR5.lockDeployedWireless(row)
    expect(cell.inert).toBe(true)
    expect(cell.dataset.title).toBe('SR5.WirelessHeldByDeployedDrone')
    expect(icon.classList.has('SR-GreyColor')).toBe(true)
    expect(icon.classList.has('SR-SubColor')).toBe(false)
  })

  it('greys an off switch lighter, as the drawn row does', () => {
    const {
      row, icon 
    } = rowWithToggle(false)
    ActorSheetSR5.lockDeployedWireless(row)
    expect(icon.classList.has('SR-LightGreyColor')).toBe(true)
  })

  it('draws the owner sheet again once the drone actor exists', () => {
    const render = vi.fn()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue({
      sheet: {
        rendered: true, render
      }
    })
    SR5_ActorHelper.redrawCreatorSheet({
      type: 'actorDrone', system: {
        creatorId: 'owner'
      }
    })
    expect(SR5_EntityHelpers.getRealActorFromID).toHaveBeenCalledWith('owner')
    expect(render).toHaveBeenCalled()
    render.mockClear()
    SR5_ActorHelper.redrawCreatorSheet({
      type: 'actorPc', system: {
      }
    })
    expect(render).not.toHaveBeenCalled()
  })
})
