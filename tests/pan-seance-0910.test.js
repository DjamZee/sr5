import {
  describe, it, expect, afterEach
} from 'vitest'
import {
  layoutCrown, lineRadiusOf
} from '../modules/canvas/pan-crown/pan-layout.js'
import {
  hasCommDevice
} from '../modules/canvas/pan-crown/pan-graph.js'
import {
  addPanArViewTool, syncPanArViewTool
} from '../modules/canvas/pan-crown/pan-openings.js'
import {
  iconBadgesOf, iconCategoryOf, visionFunctionOf
} from '../modules/canvas/pan-crown/pan-icons.js'

describe('the pieces of vision wear their badges (proposal A, chosen by DjamZ on 09/10)', () => {
  const eye = (name, extra = {
  }) => ({
    type: 'itemAugmentation', name, system: {
      type: 'cyberware', category: 'eyeware', ...extra
    }
  })

  it('reads what it does in its effects, else in its name', () => {
    expect(visionFunctionOf(eye('Compensation anti-flash (NE)'))).toBe('flare')
    expect(visionFunctionOf(eye('Vision nocturne'))).toBe('lowLight')
    expect(visionFunctionOf(eye('Low-light vision'))).toBe('lowLight')
    expect(visionFunctionOf(eye('Mod', {
      customEffects: {
        0: {
          target: 'system.visions.thermographic.augmented'
        }
      }
    }))).toBe('thermo')
    expect(visionFunctionOf(eye('Smartlink'))).toBeNull()
  })

  it('a cog for an implant, none for an accessory, which becomes an eye', () => {
    expect(iconBadgesOf(eye('Vision nocturne'))).toEqual({
      vision: 'lowLight', cyber: true
    })
    expect(iconBadgesOf(eye('Smartlink'))).toEqual({
      vision: null, cyber: true
    })
    const goggles = {
      type: 'itemGear', name: 'Vision thermographique', system: {
      }
    }
    expect(iconBadgesOf(goggles)).toEqual({
      vision: 'thermo', cyber: false
    })
    expect(iconCategoryOf(goggles)).toBe('implant-eye')
    expect(iconBadgesOf({
      type: 'itemGear', name: 'Kit de crochetage', system: {
      }
    })).toBeNull()
    expect(iconBadgesOf({
      type: 'itemDevice', name: 'Commlink', system: {
      }
    })).toBeNull()
  })
})

// Lot 3 of the séance de DjamZ du 09/10 (couronne du PAN): the lines of a small token, a player's crown through her
// commlink, the AR view button, the monitor and the order of the radial menu

// config.js writes CONFIG.statusEffects while it is being imported
globalThis.CONFIG ??= {
}
const {
  menuMonitorOf, sortedByLabel
} = await import('../modules/canvas/pan-crown/pan-radial-menu.js')
const {
  playerMayOpenPan
} = await import('../modules/canvas/pan-crown/pan-crown.js')

describe('the lines of a small token reach it', () => {
  it('start at the edge of the picture of a token the size of its cells', () => {
    expect(lineRadiusOf({
      w: 100, h: 100
    }, 100)).toBe(50)
    expect(lineRadiusOf({
      w: 200, h: 200, scaleX: 0.75, scaleY: 0.75
    }, 100)).toBe(75)
  })

  // Lot 35 (DjamZ 14/10): under the token that makes them, a small picture included
  it('start at the edge of a picture smaller than a cell, never over it', () => {
    expect(lineRadiusOf({
      w: 100, h: 100, scaleX: 0.5, scaleY: 0.5
    })).toBe(25)
    expect(lineRadiusOf({
      w: 50, h: 50
    })).toBe(25)
  })

  it('a crown draws its lines from there, its icons where they were', () => {
    const graph = {
      master: 'deck', nodes: [{
        uuid: 'deck', mode: 'active'
      }], links: [{
        from: 'owner', to: 'deck'
      }]
    }
    const far = layoutCrown(graph, {
      tokenRadius: 50
    })
    const near = layoutCrown(graph, {
      tokenRadius: 50, lineRadius: 0
    })
    expect(near.icons).toEqual(far.icons)
    expect(Math.hypot(near.lines[0].from.x, near.lines[0].from.y)).toBe(0)
    expect(Math.hypot(far.lines[0].from.x, far.lines[0].from.y)).toBeCloseTo(50)
  })
})

describe('a player opens the crown of a token she sees', () => {
  const device = type => ({
    type: 'itemDevice', system: {
      type
    }
  })
  const viewer = items => ({
    actor: {
      items
    }
  })
  const token = (extra = {
  }) => ({
    visible: true, actor: {
      type: 'actorPc'
    }, ...extra
  })

  it('with a commlink, a cyberdeck or a rigger command console', () => {
    for (const type of ['commlink', 'cyberdeck', 'riggerCommandConsole']) expect(hasCommDevice({
      items: [device(type)]
    })).toBe(true)
    expect(playerMayOpenPan(token(), viewer([device('commlink')]))).toBe(true)
  })

  it('not without one, nor on a token she does not see, nor on a storage', () => {
    expect(playerMayOpenPan(token(), viewer([{
      type: 'itemWeapon', system: {
      }
    }]))).toBe(false)
    expect(playerMayOpenPan(token(), null)).toBe(false)
    expect(playerMayOpenPan(token({
      visible: false
    }), viewer([device('commlink')]))).toBe(false)
    expect(playerMayOpenPan(token({
      actor: {
        type: 'actorStorage'
      }
    }), viewer([device('commlink')]))).toBe(false)
  })
})

describe('the button of the AR view', () => {
  afterEach(() => {
    delete globalThis.game
    delete globalThis.canvas
    delete globalThis.ui
  })

  it('is the gamemaster\'s, in the token tools, and toggles the AR view', () => {
    const shown = []
    globalThis.canvas = {
      sr5PanCrown: {
        arView: false, setArView: v => shown.push(v)
      }
    }
    globalThis.game = {
      user: {
        isGM: true
      }
    }
    const controls = {
      tokens: {
        tools: {
          select: {
          }
        }
      }
    }
    addPanArViewTool(controls)
    const tool = controls.tokens.tools.sr5PanArView
    expect(tool.toggle).toBe(true)
    expect(tool.active).toBe(false)
    tool.onChange(null, true)
    expect(shown).toEqual([true])
  })

  it('is not a player\'s', () => {
    globalThis.game = {
      user: {
        isGM: false
      }
    }
    const controls = {
      tokens: {
        tools: {
        }
      }
    }
    addPanArViewTool(controls)
    expect(controls.tokens.tools.sr5PanArView).toBeUndefined()
  })

  it('follows the key', () => {
    let renders = 0
    const tool = {
      active: false
    }
    globalThis.ui = {
      controls: {
        controls: {
          tokens: {
            tools: {
              sr5PanArView: tool
            }
          }
        }, render: () => renders++
      }
    }
    syncPanArViewTool(true)
    syncPanArViewTool(true)
    expect(tool.active).toBe(true)
    expect(renders).toBe(1)
  })
})

describe('the radial menu', () => {
  it('lists the Matrix actions in the order of the alphabet', () => {
    const labels = {
      a: 'Pirater à la volée', b: 'Formater l\'appareil', c: 'éditer un fichier', d: 'Contrôler l\'appareil'
    }
    const sorted = sortedByLabel(Object.keys(labels).map(key => ({
      key
    })), e => labels[e.key], 'fr')
    expect(sorted.map(e => labels[e.key])).toEqual(['Contrôler l\'appareil', 'éditer un fichier', 'Formater l\'appareil', 'Pirater à la volée'])
  })

  it('shows the device\'s own monitor to its owner and the gamemaster, what a perception read to the others', () => {
    const item = {
      isOwner: true, system: {
        conditionMonitors: {
          matrix: {
            value: 10, actual: {
              value: 3
            }
          }
        }
      }
    }
    const node = {
      uuid: 'Item.x', intel: {
        monitor: {
          damage: 1, boxes: 9
        }
      }
    }
    expect(menuMonitorOf(node, {
      resolve: () => item, isGM: false
    })).toEqual({
      damage: 3, boxes: 10
    })
    expect(menuMonitorOf(node, {
      resolve: () => ({
        ...item, isOwner: false
      }), isGM: false
    })).toEqual({
      damage: 1, boxes: 9
    })
    expect(menuMonitorOf({
      uuid: 'Item.x'
    }, {
      resolve: () => ({
        ...item, isOwner: false
      }), isGM: false
    })).toBeNull()
  })
})
