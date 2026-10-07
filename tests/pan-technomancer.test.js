import {
  describe, it, expect
} from 'vitest'
import {
  buildPanGraph, hasAntenna, spritesOf
} from '../modules/canvas/pan-crown/pan-graph.js'
import {
  nodeVisibility
} from '../modules/canvas/pan-crown/pan-visibility.js'
import {
  layoutCrown
} from '../modules/canvas/pan-crown/pan-layout.js'
import {
  actionsForNode, aimedItemUuid, menuEntries, PAN_PERSONA_ACTIONS
} from '../modules/canvas/pan-crown/pan-actions.js'

// The crown of a technomancer (lot Technomanciens): her living persona is her master and carries her antenna while
// she is awake (SR5 p. 236); through a commlink she looks like any user (her cover, SR5 p. 253, DT p. 63); her sprites
// are personas of their own, placed where she stands (SR5 p. 256), the line to her seen by her and the gamemaster alone.

let n = 0
function item(type, system = {
}, extra = {
}){
  const id = extra.id ?? `i${++n}`
  return {
    id, uuid: `Actor.${extra.actorId ?? 'tm'}.Item.${id}`, name: extra.name ?? id, type,
    system: {
      isWireless: true, wirelessTurnedOn: true, isActive: true, marks: [], ...system
    },
    flags: {
    },
  }
}
function actor(items, {
  id = 'tm', type = 'actorPc', special = 'resonance', system = {
  }, statuses
} = {
}){
  const a = {
    id, name: id, type, isToken: false, items, statuses,
    system: {
      activeSpecialAttribute: special, matrix: {
        runningSilent: false
      }, conditionMonitors: {
        stun: {
          value: 10, actual: {
            value: 0
          }
        }, physical: {
          value: 10, actual: {
            value: 0
          }
        }
      }, ...system
    },
  }
  for (const i of items) i.parent = a
  return a
}
const persona = (system = {
}) => item('itemDevice', {
  type: 'livingPersona', managed: true, pan: {
    max: 0, content: []
  }, ...system
}, {
  name: 'Persona incarné'
})
const commlink = (system = {
}) => item('itemDevice', {
  type: 'commlink', deviceRating: 3, pan: {
    max: 9, content: []
  }, ...system
}, {
  name: 'Meta Link'
})
function sprite(creatorId, system = {
}, id = 'sp1'){
  const device = item('itemDevice', {
    type: 'baseDevice', ...system
  }, {
    actorId: id
  })
  const a = actor([device], {
    id, type: 'actorSprite', special: '', system: {
      creatorId
    }
  })
  a.name = 'Sprite coursier'
  return a
}
const other = {
  isGM: false, ids: ['other'], hasAntenna: true
}

describe('technomancer: her persona is her master', () => {
  it('the persona is the master, with its antenna (SR5 p. 236)', () => {
    const p = persona()
    const tm = actor([p])
    const g = buildPanGraph(tm)
    expect(g.master).toBe(p.uuid)
    expect(g.nodes.map(x => [x.kind, x.icon, x.mode])).toEqual([['master', 'persona', 'active']])
    expect(hasAntenna(tm)).toBe(true)
  })

  it('asleep, she is out of the Matrix: no antenna, her persona offline (SR5 p. 236)', () => {
    const tm = actor([persona()], {
      statuses: new Set(['unconscious'])
    })
    expect(hasAntenna(tm)).toBe(false)
    expect(buildPanGraph(tm).nodes[0].mode).toBe('offline')
    const knockedOut = actor([persona()])
    knockedOut.system.conditionMonitors.stun.actual.value = 10
    expect(hasAntenna(knockedOut)).toBe(false)
  })

  it('takes no slave by the book: the capacity is the persona\'s own (0, SR5 p. 253)', () => {
    expect(buildPanGraph(actor([persona()])).capacity).toEqual({
      max: 0, used: 0
    })
  })
})

describe('technomancer: her commlink is her cover (SR5 p. 253, DT p. 63)', () => {
  it('through a commlink, the master is the commlink and her persona is drawn for her alone', () => {
    const p = persona({
      isActive: false
    })
    const c = commlink()
    const tm = actor([p, c])
    const g = buildPanGraph(tm)
    expect(g.master).toBe(c.uuid)
    const dormant = g.nodes.find(x => x.kind === 'persona')
    expect(dormant).toMatchObject({
      uuid: p.uuid, mode: 'offline', ownerOnly: true
    })
    expect(nodeVisibility(dormant, other, {
      distance: 5
    })).toEqual({
      visible: false, reason: 'ownerOnly'
    })
    expect(nodeVisibility(dormant, {
      ids: ['tm']
    }).visible).toBe(true)
    expect(nodeVisibility(dormant, {
      isGM: true
    }).visible).toBe(true)
    // Another user sees an ordinary commlink user, within 100 m
    const master = g.nodes.find(x => x.kind === 'master')
    expect(master.icon).toBe('commlink')
    expect(nodeVisibility(master, other, {
      distance: 50
    }).visible).toBe(true)
    expect(hasAntenna(tm)).toBe(true)
  })

  it('unplugged on purpose (no device in use): no antenna, her persona for her alone', () => {
    const tm = actor([persona({
      isActive: false
    })])
    expect(hasAntenna(tm)).toBe(false)
    expect(buildPanGraph(tm).nodes.map(x => [x.kind, x.ownerOnly])).toEqual([['persona', true]])
  })

  it('a magician has no persona node', () => {
    expect(buildPanGraph(actor([commlink()], {
      special: 'magic'
    })).nodes.map(x => x.kind)).toEqual(['master'])
  })
})

describe('technomancer: her sprites (SR5 p. 236, 256)', () => {
  it('a compiled sprite is a node of her crown, with the sprite icon, placed where she stands', () => {
    const tm = actor([persona()])
    const s = sprite('tm')
    const g = buildPanGraph(tm, {
      actors: [tm, s, sprite('someone else', {
      }, 'sp2')]
    })
    const node = g.nodes.find(x => x.kind === 'sprite')
    expect(node).toMatchObject({
      name: 'Sprite coursier', icon: 'sprite', mode: 'active', anchorIds: ['tm'], linkOwnerOnly: true
    })
    expect(node.ownerOnly).toBeUndefined()
    expect(g.nodes.filter(x => x.kind === 'sprite')).toHaveLength(1)
    expect(node.ownerIds).toEqual(expect.arrayContaining(['sp1', 'tm']))
  })

  it('another user may spot the sprite, but never sees the line to the technomancer', () => {
    const tm = actor([persona()])
    const g = buildPanGraph(tm, {
      actors: [sprite('tm')]
    })
    const node = g.nodes.find(x => x.kind === 'sprite')
    for (const [viewer, lines] of [[other, 0], [{
      ids: ['tm']
    }, 1], [{
      isGM: true
    }, 1]]){
      for (const x of g.nodes) x.visibility = nodeVisibility(x, viewer, {
        distance: 50
      })
      expect(node.visibility.visible).toBe(true)
      expect(layoutCrown(g).lines.filter(l => l.uuid === node.uuid)).toHaveLength(lines)
    }
  })

  it('a silent sprite is not spotted at 50 m', () => {
    const g = buildPanGraph(actor([persona()]), {
      actors: [sprite('tm', {
        isSilent: true
      })]
    })
    const node = g.nodes.find(x => x.kind === 'sprite')
    expect(node.mode).toBe('silent')
    expect(nodeVisibility(node, other, {
      distance: 50
    }).visible).toBe(false)
  })

  it('under her cover, her sprites betray nothing', () => {
    const tm = actor([persona({
      isActive: false
    }), commlink()])
    const node = buildPanGraph(tm, {
      actors: [sprite('tm')]
    }).nodes.find(x => x.kind === 'sprite')
    expect(node.ownerOnly).toBe(true)
    expect(nodeVisibility(node, other, {
      distance: 5
    }).visible).toBe(false)
  })

  it('a sprite found twice (world and token actor) is drawn once', () => {
    const s = sprite('tm')
    expect(spritesOf(actor([persona()]), [s, s])).toHaveLength(1)
  })
})

describe('technomancer: the radial menu', () => {
  it('a sprite is a persona: the persona actions, aimed at the sprite itself', () => {
    const node = {
      kind: 'sprite', uuid: 'Actor.sp1.Item.d'
    }
    expect(actionsForNode(node, {
      master: 'x'
    })).toEqual(expect.arrayContaining(PAN_PERSONA_ACTIONS))
    expect(aimedItemUuid(node, {
      master: 'x'
    })).toBe(null)
  })

  it('her sprite runs silent or not; her persona out of the Matrix has no switch here', () => {
    const graph = {
      viewer: {
        ids: ['tm']
      }, master: 'm'
    }
    expect(menuEntries({
      kind: 'sprite', ownerIds: ['sp1', 'tm'], mode: 'active'
    }, graph, null).modes.map(m => m.mode)).toEqual(['active', 'silent'])
    expect(menuEntries({
      kind: 'persona', ownerIds: ['tm'], mode: 'offline'
    }, graph, null).modes).toEqual([])
  })
})
