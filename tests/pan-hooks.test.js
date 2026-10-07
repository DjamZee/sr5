import {
  describe, it, expect, vi
} from 'vitest'
import {
  PAN_CROWN_HOOKS, contributeToGraph, applyVisibilityHooks, contributeActions, normalizeContributedNode
} from '../modules/canvas/pan-crown/pan-hooks.js'
import {
  registerPanIcon, iconPathOf, nodeIconPathOf
} from '../modules/canvas/pan-crown/pan-icons.js'

// The hooks of the crown of a PAN for the modules (couronne du PAN, lot 11): a subscriber adds nodes and lines, can
// only hide, greys out or adds entries of the menu; an error of a subscriber is ignored.

// A dispatcher like Hooks.callAll: every subscriber of the hook, in order
function dispatcher(subscribers){
  return (hook, ...args) => {
    for (const fn of subscribers[hook] ?? []) fn(...args)
    return true
  }
}

function graphOf(){
  return {
    owner: {
      id: 'A1'
    },
    master: 'Item.M',
    nodes: [
      {
        uuid: 'Item.M', kind: 'master', name: 'Commlink', mode: 'active', ownerIds: ['A1'], holderIds: ['A1'], marks: [], revealed: false
      },
      {
        uuid: 'Item.S', kind: 'slave', name: 'Smartgun', mode: 'silent', ownerIds: ['A1'], holderIds: ['A1'], marks: [], revealed: false
      },
    ],
    links: [{
      from: 'owner', to: 'Item.M', kind: 'persona'
    }, {
      from: 'Item.M', to: 'Item.S', kind: 'slave'
    }],
  }
}

describe('pan hooks: the graph', () => {
  it('lets a subscriber add a node and a line', () => {
    const graph = contributeToGraph(graphOf(), {
    }, dispatcher({
      [PAN_CROWN_HOOKS.graph]: [g => {
        g.nodes.push({
          uuid: 'matrice.zone.hall', name: 'Hall', icon: 'matrice-zone'
        })
        g.links.push({
          from: 'Item.M', to: 'matrice.zone.hall', kind: 'zone'
        })
      }]
    }))
    const zone = graph.nodes.find(n => n.uuid === 'matrice.zone.hall')
    expect(zone).toMatchObject({
      kind: 'module', name: 'Hall', icon: 'matrice-zone', mode: 'active', contributed: true, revealed: false
    })
    expect(graph.links).toContainEqual({
      from: 'Item.M', to: 'matrice.zone.hall', kind: 'zone'
    })
  })

  it('lets a subscriber link two nodes of the system (a trait between existing icons)', () => {
    const graph = contributeToGraph(graphOf(), {
    }, dispatcher({
      [PAN_CROWN_HOOKS.graph]: [g => g.links.push({
        from: 'Item.S', to: 'Item.M', kind: 'zone'
      })]
    }))
    expect(graph.links).toHaveLength(3)
  })

  it('keeps the nodes of the system whatever the subscriber removes or changes', () => {
    const graph = contributeToGraph(graphOf(), {
    }, dispatcher({
      [PAN_CROWN_HOOKS.graph]: [g => {
        g.nodes[1].revealed = true
        g.nodes[1].mode = 'active'
        g.nodes.shift()
        g.links.length = 0
        g.master = null
      }]
    }))
    expect(graph).toEqual(graphOf())
  })

  it('ignores a node without uuid, a node that takes the uuid of the system, and a line to nowhere', () => {
    const graph = contributeToGraph(graphOf(), {
    }, dispatcher({
      [PAN_CROWN_HOOKS.graph]: [g => {
        g.nodes.push({
          name: 'sans uuid'
        }, {
          uuid: 'Item.S', name: 'Imposteur', revealed: true
        })
        g.links.push({
          from: 'Item.M', to: 'Item.X'
        }, {
          from: 'Item.M', to: 'Item.S'
        })
      }]
    }))
    expect(graph).toEqual(graphOf())
  })

  it('ignores a subscriber that throws: the graph is the system\'s', () => {
    const call = dispatcher({
      [PAN_CROWN_HOOKS.graph]: [() => {
        throw new Error('module en panne')
      }]
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => contributeToGraph(graphOf(), {
    }, call)).not.toThrow()
    expect(contributeToGraph(graphOf(), {
    }, call)).toEqual(graphOf())
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('without a subscriber, changes nothing', () => {
    expect(contributeToGraph(graphOf(), {
    }, dispatcher({
    }))).toEqual(graphOf())
  })

  it('gives an added node the holder as owner unless told otherwise', () => {
    expect(normalizeContributedNode({
      uuid: 'x', holderIds: ['T1']
    }).ownerIds).toEqual(['T1'])
    expect(normalizeContributedNode({
      uuid: 'x', holderIds: ['T1'], ownerIds: []
    }).ownerIds).toEqual([])
    expect(normalizeContributedNode({
      uuid: 'x', mode: 'invisible'
    }).mode).toBe('active')
  })
})

describe('pan hooks: the visibility', () => {
  const node = graphOf().nodes[1]
  const viewer = {
    actor: null, token: null, isGM: false, ids: ['B2']
  }

  it('lets a subscriber hide what the system shows', () => {
    const verdict = applyVisibilityHooks(node, viewer, {
      visible: true, reason: 'inRange'
    }, dispatcher({
      [PAN_CROWN_HOOKS.visibility]: [(n, v, verdict) => {
        verdict.visible = false
        verdict.reason = 'zone'
      }]
    }))
    expect(verdict).toEqual({
      visible: false, reason: 'zone'
    })
  })

  it('never lets a subscriber show what the system hides', () => {
    const hidden = {
      visible: false, reason: 'silent'
    }
    const verdict = applyVisibilityHooks(node, viewer, hidden, dispatcher({
      [PAN_CROWN_HOOKS.visibility]: [(n, v, verdict) => {
        verdict.visible = true
        verdict.reason = 'revealed'
        n.revealed = true
      }]
    }))
    expect(verdict).toEqual({
      visible: false, reason: 'silent'
    })
    expect(node.revealed).toBe(false)
  })

  it('gives a reason of its own to a hidden node without one', () => {
    expect(applyVisibilityHooks(node, viewer, {
      visible: true, reason: 'inRange'
    }, dispatcher({
      [PAN_CROWN_HOOKS.visibility]: [(n, v, verdict) => {
        verdict.visible = false
      }]
    }))).toEqual({
      visible: false, reason: 'module'
    })
  })

  it('keeps the system\'s verdict when a subscriber throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const verdict = {
      visible: true, reason: 'inRange'
    }
    expect(applyVisibilityHooks(node, viewer, verdict, () => {
      throw new Error('module en panne')
    })).toBe(verdict)
    error.mockRestore()
  })
})

describe('pan hooks: the radial menu', () => {
  const node = graphOf().nodes[1]
  const entries = [{
    key: 'hackOnTheFly', label: 'Piratage', enabled: true, tooltip: '', group: 'actions'
  }, {
    key: 'bruteForce', label: 'Force brute', enabled: false, tooltip: 'Il manque 1 mark', group: 'actions'
  }]

  it('lets a subscriber add an entry and grey out an entry of the system', () => {
    const onClick = () => {}
    const {
      greyed, added
    } = contributeActions(node, {
    }, entries, dispatcher({
      [PAN_CROWN_HOOKS.actions]: [(n, v, list) => {
        list.find(e => e.key === 'hackOnTheFly').enabled = false
        list.find(e => e.key === 'hackOnTheFly').tooltip = 'Pas depuis cette zone'
        list.push({
          key: 'crossBulkhead', label: 'Franchir une cloison', onClick
        })
      }]
    }))
    expect(greyed.get('hackOnTheFly')).toBe('Pas depuis cette zone')
    expect(added).toEqual([{
      key: 'crossBulkhead', label: 'Franchir une cloison', tooltip: '', enabled: true, onClick
    }])
  })

  it('never lets a subscriber enable an entry the system greys out', () => {
    const {
      greyed, added
    } = contributeActions(node, {
    }, entries, dispatcher({
      [PAN_CROWN_HOOKS.actions]: [(n, v, list) => {
        list.find(e => e.key === 'bruteForce').enabled = true
      }]
    }))
    expect(greyed.size).toBe(0)
    expect(added).toEqual([])
  })

  it('ignores an entry without label or without onClick, and a subscriber that throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const {
      added
    } = contributeActions(node, {
    }, entries, dispatcher({
      [PAN_CROWN_HOOKS.actions]: [(n, v, list) => {
        list.push({
          label: 'sans clic'
        }, {
          onClick: () => {}
        })
        throw new Error('module en panne')
      }]
    }))
    expect(added).toEqual([])
    error.mockRestore()
  })
})

describe('pan icons: registerIcon', () => {
  it('adds a category of a module, and takes the place of a generic one', () => {
    const table = {
    }
    expect(registerPanIcon(table, 'matrice-zone', 'modules/matrice/zone.webp')).toBe(true)
    expect(iconPathOf('matrice-zone', table)).toBe('modules/matrice/zone.webp')
    expect(nodeIconPathOf({
      icon: 'matrice-zone'
    }, table)).toBe('modules/matrice/zone.webp')
    expect(registerPanIcon(table, 'camera', 'modules/matrice/camera.webp')).toBe(true)
    expect(iconPathOf('camera', table)).toBe('modules/matrice/camera.webp')
  })

  it('refuses a key or a path that cannot be used, and an unknown category stays the generic device', () => {
    const table = {
    }
    expect(registerPanIcon(table, 'zone hall', 'a.webp')).toBe(false)
    expect(registerPanIcon(table, 'zone', '  ')).toBe(false)
    expect(registerPanIcon(null, 'zone', 'a.webp')).toBe(false)
    expect(table).toEqual({
    })
    expect(iconPathOf('zone', table)).toBe(iconPathOf('device'))
  })
})
