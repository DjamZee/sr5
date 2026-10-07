import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import fs from 'node:fs'

// config.js writes CONFIG.statusEffects while it is being imported
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  uuidTarget
} from '../modules/canvas/pan-crown/pan-actions.js'
import {
  isMatrixScene, nodeVisibility
} from '../modules/canvas/pan-crown/pan-visibility.js'
import {
  contributeToGraph, lineColor
} from '../modules/canvas/pan-crown/pan-hooks.js'
import {
  layoutCrown
} from '../modules/canvas/pan-crown/pan-layout.js'
import {
  buildPanGraph
} from '../modules/canvas/pan-crown/pan-graph.js'
import {
  matrixTargetDistance
} from '../modules/rolls/roll-helpers/matrix-distance.js'
import {
  MATRIX_DIRECT_CONNECTION_HOOK, defendsWithMaster, directConnectionVerdict, wanMasterOf
} from '../modules/rolls/roll-helpers/direct-connection.js'
import {
  showsOverwatchScore
} from '../modules/rolls/roll-helpers/overwatch-notice.js'

const {
  actionRequest, SPENDABLE_ACTION_TYPES
} = await import('../modules/system/combat-api.js')
const {
  SR5_PrepareRollHelper
} = await import('../modules/rolls/roll-prepare-helpers.js')
const {
  matrixTargets
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixAction.js')

// The lot « API pour Matrice v1 » (PLAN-MATRICE-V1 § 2): what the module Matrice v1 needs of the system, with no new
// rule. A1 a target by uuid, A2 the scene of a host, A3 the direct connection attacker by attacker, A4 an action
// counted, A6 the host of an IC, A7 the Overwatch Score kept by the gamemaster, A8 a line's color.

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

// A dispatcher like Hooks.callAll: every subscriber of the hook, in order
function dispatcher(subscribers){
  return (hook, ...args) => {
    for (const fn of subscribers[hook] ?? []) fn(...args)
    return true
  }
}

describe('A1: a target named by its uuid alone', () => {
  const camera = {
    documentName: 'Actor', id: 'cam', isToken: false, uuid: 'Actor.cam'
  }
  const device = {
    documentName: 'Item', uuid: 'Actor.cam.Item.dev', actor: camera
  }

  it('reads an item as its device and the actor that carries it, an actor or a token as the actor', () => {
    expect(uuidTarget(device)).toEqual({
      actor: camera, itemUuid: 'Actor.cam.Item.dev'
    })
    expect(uuidTarget(camera)).toEqual({
      actor: camera, itemUuid: null
    })
    expect(uuidTarget({
      documentName: 'Token', actor: camera
    })).toEqual({
      actor: camera, itemUuid: null
    })
    expect(uuidTarget(null)).toBeNull()
    expect(uuidTarget({
      documentName: 'Item', uuid: 'Item.loose', actor: null
    })).toBeNull()
    expect(uuidTarget({
      documentName: 'Scene'
    })).toBeNull()
  })

  describe('in the roll', () => {
    beforeEach(() => {
      globalThis.game = {
        actors: new Map([['cam', camera]]),
        scenes: [],
        user: {
          targets: new Set([{
            actor: {
              id: 'someone-else'
            }
          }])
        },
      }
      globalThis.canvas = {
        scene: null, tokens: {
          get: () => undefined
        }
      }
    })

    it('puts the actor in the card without a token, and the checks read it instead of the user\'s targets', () => {
      const rollData = SR5_PrepareRollHelper.getPanTargetData({
        target: {
        }
      }, {
        actorId: 'cam', itemUuid: 'Actor.cam.Item.dev'
      })
      expect(rollData.target).toMatchObject({
        hasTarget: true, actorId: 'cam', itemUuid: 'Actor.cam.Item.dev', panPicked: true, panActorOnly: true
      })
      expect(matrixTargets(rollData).map(t => t.actor)).toEqual([camera])
    })

    it('keeps the user\'s targets for a roll aimed by its token', () => {
      expect(matrixTargets({
        target: {
        }
      }).map(t => t.actor.id)).toEqual(['someone-else'])
    })

    it('names nothing when the actor is gone', () => {
      const rollData = SR5_PrepareRollHelper.getPanTargetData({
        target: {
        }
      }, {
        actorId: 'gone'
      })
      expect(rollData.target.hasTarget).toBeUndefined()
    })
  })

  it('releases the user\'s targets and calls no token when the uuid names the target', () => {
    const source = read('../modules/canvas/pan-crown/pan-radial-menu.js')
    const fn = source.slice(source.indexOf('export async function rollMatrixActionOn'))
    expect(fn).toMatch(/uuidTarget\(await globalThis\.fromUuid\?\.\(targetUuid\)\)/)
    expect(fn).toMatch(/targeted\.setTarget\(false/)
    expect(fn).toMatch(/actorId: aimed\.actor\.isToken \? aimed\.actor\.token\.id : aimed\.actor\.id, itemUuid: aimed\.itemUuid/)
  })
})

describe('A2: the scene of a host has no distance (SR5 p. 236)', () => {
  const node = {
    mode: 'active', ownerIds: ['camera'], marks: []
  }
  const viewer = {
    ids: ['decker'], hasAntenna: true
  }

  it('reads the flag of the scene, true only', () => {
    expect(isMatrixScene({
      flags: {
        sr5: {
          matrixScene: true
        }
      }
    })).toBe(true)
    expect(isMatrixScene({
      flags: {
        sr5: {
          matrixScene: 'yes'
        }
      }
    })).toBe(false)
    expect(isMatrixScene({
    })).toBe(false)
    expect(isMatrixScene(null)).toBe(false)
  })

  it('shows at 0 m what the 100 m hide at 150 m', () => {
    expect(nodeVisibility(node, viewer, {
      distance: 150
    })).toEqual({
      visible: false, reason: 'outOfRange'
    })
    expect(nodeVisibility(node, viewer, {
      distance: 0
    })).toEqual({
      visible: true, reason: 'inRange'
    })
  })

  it('gives the crown no distance on such a scene', () => {
    const source = read('../modules/canvas/pan-crown/pan-crown.js')
    expect(source).toMatch(/if \(a === b \|\| isMatrixScene\(canvas\.scene\)\) return 0/)
  })

  it('leaves the noise of distance to its default there, as for a host', () => {
    const scene = {
      flags: {
        sr5: {
          matrixScene: true
        }
      }
    }
    const me = {
      id: 'decker'
    }
    const target = {
      document: {
        parent: scene
      }, actor: {
        id: 'cam'
      }, center: {
        x: 0, y: 0
      }
    }
    const measured = vi.fn(() => ({
      distance: 100
    }))
    expect(matrixTargetDistance(me, {
      scene, grid: {
        measurePath: measured
      }, tokens: {
        placeables: [target]
      }
    }, new Set([target]))).toBeNull()
    expect(measured).not.toHaveBeenCalled()
  })
})

describe('A3: the direct connection, attacker by attacker (SR5 p. 234)', () => {
  const deckerA = {
    id: 'A'
  }, deckerB = {
    id: 'B'
  }
  const camera = {
    id: 'cam'
  }

  it('keeps the system\'s verdict without a subscriber', () => {
    expect(directConnectionVerdict(deckerA, camera, false, dispatcher({
    }))).toBe(false)
    expect(directConnectionVerdict(deckerA, camera, true, dispatcher({
    }))).toBe(true)
  })

  it('gives two attackers two verdicts when a subscriber rules', () => {
    const call = dispatcher({
      [MATRIX_DIRECT_CONNECTION_HOOK]: [(attacker, device, verdict) => {
        verdict.direct = attacker.id === 'A'
      }]
    })
    expect(directConnectionVerdict(deckerA, camera, false, call)).toBe(true)
    expect(directConnectionVerdict(deckerB, camera, true, call)).toBe(false)
  })

  it('keeps the system\'s verdict when a subscriber fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const call = dispatcher({
      [MATRIX_DIRECT_CONNECTION_HOOK]: [() => {
        throw new Error('boom')
      }]
    })
    expect(directConnectionVerdict(deckerA, camera, true, call)).toBe(true)
    error.mockRestore()
  })

  it('defends with the master unless directly connected, and when the master\'s pool is at least as large', () => {
    expect(defendsWithMaster({
      direct: false, ownPool: 6, masterPool: 10
    })).toBe(true)
    expect(defendsWithMaster({
      direct: false, ownPool: 6, masterPool: 6
    })).toBe(true)
    expect(defendsWithMaster({
      direct: false, ownPool: 6, masterPool: 4
    })).toBe(false)
    expect(defendsWithMaster({
      direct: true, ownPool: 6, masterPool: 10
    })).toBe(false)
    expect(defendsWithMaster({
      direct: false, ownPool: 6, masterPool: null
    })).toBe(false)
  })

  it('finds the master of a device of the scenery: a host, or the holder of a master item', () => {
    const host = {
      documentName: 'Actor', system: {
        matrix: {
          actions: {
          }
        }
      }
    }
    const guard = {
      documentName: 'Actor', system: {
        matrix: {
          actions: {
          }
        }
      }
    }
    const commlink = {
      documentName: 'Item', actor: guard
    }
    const resolve = uuid => ({
      'Actor.host': host, 'Actor.guard.Item.c': commlink
    })[uuid] ?? null
    const device = (panMaster, deviceType = 'slavedDevice') => ({
      type: 'actorDevice', system: {
        matrix: {
          deviceType, panMaster
        }
      }
    })
    expect(wanMasterOf(device('Actor.host'), resolve)).toBe(host)
    expect(wanMasterOf(device('Actor.guard.Item.c'), resolve)).toBe(guard)
    expect(wanMasterOf(device(''), resolve)).toBeNull()
    expect(wanMasterOf(device('Actor.gone'), resolve)).toBeNull()
    expect(wanMasterOf(device('Actor.host', 'host'), resolve)).toBeNull()
    expect(wanMasterOf(device('Actor.host', 'ice'), resolve)).toBeNull()
    expect(wanMasterOf({
      type: 'actorPc', system: {
        matrix: {
          panMaster: 'Actor.host'
        }
      }
    }, resolve)).toBeNull()
  })

  it('asks the verdict in both defenses of a slave: in a PAN and in a WAN', () => {
    const source = read('../modules/rolls/roll-prepare-case/rollData-MatrixDefense.js')
    expect(source).toMatch(/directConnectionVerdict\(attacker\(\), targetItem, false\)/)
    expect(source).toMatch(/directConnectionVerdict\(attacker\(\), device, actor\.system\.isDirectlyConnected === true\)/)
    expect(source).toMatch(/if \(direct \|\| targetItem\.system\.deviceRating \* 2 >/)
  })
})

describe('A4: an action counted by a module', () => {
  const sources = {
    matrixAction: 'x', manual: 'y'
  }

  it('takes a free, simple or complex action, one by default', () => {
    expect(SPENDABLE_ACTION_TYPES).toEqual(['free', 'simple', 'complex'])
    expect(actionRequest('simple', {
    }, sources)).toEqual({
      type: 'simple', value: 1, source: 'matrixAction'
    })
    expect(actionRequest('free', {
      value: 2, source: 'manual'
    }, sources)).toEqual({
      type: 'free', value: 2, source: 'manual'
    })
  })

  it('names the Matrix action when the source is unknown', () => {
    expect(actionRequest('complex', {
      source: 'mon-module'
    }, sources).source).toBe('matrixAction')
  })

  it('refuses an interruption, an unknown type or a wrong count', () => {
    expect(actionRequest('interruption', {
    }, sources)).toBeNull()
    expect(actionRequest('rapide', {
    }, sources)).toBeNull()
    expect(actionRequest('simple', {
      value: 0
    }, sources)).toBeNull()
    expect(actionRequest('simple', {
      value: 1.5
    }, sources)).toBeNull()
  })

  it('is game.sr5.combat.spendAction, through the system\'s own counting', () => {
    expect(read('../modules/hooks/init.js')).toMatch(/combat: SR5CombatApi,/)
    const source = read('../modules/system/combat-api.js')
    expect(source).toMatch(/SR5Combat\.hasActionsLeft\(actor, \[action\]\)/)
    expect(source).toMatch(/SR5Combat\.changeActionInCombat\(actor\.isToken \? actor\.token\.id : actor\.id, \[action\]\)/)
  })
})

describe('A6: the host of an IC (SR5 p. 247-248)', () => {
  function device(id, deviceType, matrix = {
  }){
    const item = {
      id: `${id}-dev`, uuid: `Actor.${id}.Item.${id}-dev`, name: id, type: 'itemDevice', flags: {
      },
      system: {
        type: 'baseDevice', deviceRating: 4, isWireless: true, wirelessTurnedOn: true, isActive: true, marks: []
      },
    }
    const actor = {
      id, uuid: `Actor.${id}`, name: id, type: 'actorDevice', isToken: false, items: [item],
      system: {
        matrix: {
          runningSilent: false, deviceType, ...matrix
        }
      },
    }
    item.parent = actor
    return actor
  }

  it('draws the line from an IC up to its host, with a mode of its own', () => {
    const host = device('host1', 'host', {
      runningSilent: true
    })
    const ice = device('patrol', 'ice', {
      hostUuid: 'Actor.host1'
    })
    const graph = buildPanGraph(ice, {
      resolve: uuid => (uuid === host.uuid ? host : null), actors: [host, ice]
    })
    expect(graph.wan).toEqual({
      uuid: 'Actor.host1', actorId: 'host1', isHost: true
    })
    expect(graph.nodes.find(n => n.kind === 'wan')).toMatchObject({
      uuid: host.items[0].uuid, icon: 'host'
    })
    // Its own mode: the host's silence is not passed on to it
    expect(graph.nodes.find(n => n.kind === 'device').mode).toBe('active')
  })

  it('draws nothing for an IC without a host, and reads no panMaster on an IC', () => {
    const host = device('host1', 'host')
    const ice = device('killer', 'ice', {
      hostUuid: '', panMaster: 'Actor.host1'
    })
    const graph = buildPanGraph(ice, {
      resolve: uuid => (uuid === host.uuid ? host : null), actors: [host, ice]
    })
    expect(graph.wan).toBeNull()
  })

  it('is a field of the device, offered to the gamemaster on the sheet of an IC', () => {
    expect(read('../modules/datamodels/actors/actorDevice.js')).toMatch(/hostUuid: new fields\.StringField\(\{\s*initial: ''/)
    const template = read('../templates/actors/_partials/left-tabs/matrixUser/device.hbs')
    expect(template).toMatch(/name="system\.matrix\.hostUuid"[^>]*\{\{#unless system\.isGM\}\}disabled/)
    for (const lang of ['fr', 'en']) {
      const keys = JSON.parse(read(`../lang/${lang}.json`))
      expect(keys['SR5.DEVICE_IceHost']).toBeTruthy()
      expect(keys['SR5.HELP_IceHostMsg']).toMatch(/p\. 247-248/)
    }
  })
})

describe('A7: the Overwatch Score kept by the gamemaster (SR5 p. 233)', () => {
  it('shows the number to the gamemaster, to a Baby Monitor, or to all when the setting is off', () => {
    expect(showsOverwatchScore({
      isGM: true, gmOnly: true
    })).toBe(true)
    expect(showsOverwatchScore({
      isGM: false, gmOnly: true, babyMonitor: false
    })).toBe(false)
    expect(showsOverwatchScore({
      isGM: false, gmOnly: true, babyMonitor: true
    })).toBe(true)
    expect(showsOverwatchScore({
      isGM: false, gmOnly: false
    })).toBe(true)
  })

  it('is a world setting checked by default, read by the notice of a rise', () => {
    expect(read('../modules/system/utilitySystem.js')).toMatch(/register\("sr5", "sr5OverwatchGMOnly", \{[^}]*scope: "world",[^}]*default: true,/)
    expect(read('../modules/entities/actors/entityActor-helpers.js')).toMatch(/if \(overwatchScoreShownTo\(actor\)\) ui\.notifications\.info/)
    // The sheet already followed the book: the gamemaster, or the owner whose Baby Monitor runs
    expect(read('../templates/actors/_partials/left-tabs/matrixUser/overwatchScore.hbs')).toMatch(/^\{\{#if \(or system\.isGM system\.matrix\.programs\.babyMonitor\.isActive\)\}\}/)
  })
})

describe('A8: a decorative color on a line', () => {
  function graphOf(){
    return {
      master: 'Item.H',
      nodes: [{
        uuid: 'Item.H', kind: 'master', mode: 'active', holderIds: ['h'], ownerIds: ['h'], marks: []
      }, {
        uuid: 'Item.C', kind: 'decor', mode: 'active', holderIds: ['c'], ownerIds: ['c'], marks: []
      }, {
        uuid: 'Item.D', kind: 'decor', mode: 'offline', holderIds: ['d'], ownerIds: ['d'], marks: []
      }],
      links: [{
        from: 'owner', to: 'Item.H', kind: 'persona'
      }, {
        from: 'Item.H', to: 'Item.C', kind: 'decor'
      }, {
        from: 'Item.H', to: 'Item.D', kind: 'decor'
      }],
    }
  }

  it('reads #rgb, #rrggbb and 0xrrggbb, and nothing else', () => {
    expect(lineColor('#ff8800')).toBe(0xff8800)
    expect(lineColor('#f80')).toBe(0xff8800)
    expect(lineColor(0x00ff00)).toBe(0x00ff00)
    expect(lineColor('orange')).toBeNull()
    expect(lineColor('#ff88')).toBeNull()
    expect(lineColor(-1)).toBeNull()
    expect(lineColor(0x1000000)).toBeNull()
    expect(lineColor(undefined)).toBeNull()
  })

  it('puts the color on the system\'s line, and its kind stays', () => {
    const graph = graphOf()
    contributeToGraph(graph, {
    }, dispatcher({
      'sr5.panCrownGraph': [g => {
        const line = g.links.find(l => l.to === 'Item.C')
        line.color = '#ff8800'
        line.kind = 'zone'
        g.links.find(l => l.to === 'Item.D').color = 'not a color'
      }]
    }))
    expect(graph.links.find(l => l.to === 'Item.C')).toEqual({
      from: 'Item.H', to: 'Item.C', kind: 'decor', color: 0xff8800
    })
    expect(graph.links.find(l => l.to === 'Item.D').color).toBeUndefined()
  })

  it('without a subscriber, colors nothing', () => {
    const graph = graphOf()
    contributeToGraph(graph, {
    }, dispatcher({
    }))
    expect(graph).toEqual(graphOf())
  })

  it('carries the color to the line drawn; an offline line stays grey in the layer', () => {
    const graph = graphOf()
    graph.links[1].color = 0xff8800
    for (const node of graph.nodes) node.visibility = {
      visible: true
    }
    const {
      lines
    } = layoutCrown(graph)
    expect(lines.find(l => l.uuid === 'Item.C').color).toBe(0xff8800)
    expect(lines.find(l => l.uuid === 'Item.D').color).toBeNull()
    expect(read('../modules/canvas/pan-crown/pan-crown-layer.js')).toMatch(/line\.mode === "offline" \? COLORS\.offline : \(line\.color \?\? COLORS\.line\)/)
  })
})
