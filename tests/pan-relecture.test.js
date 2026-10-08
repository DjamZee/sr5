import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'

import {
  signatureOf
} from '../modules/canvas/pan-crown/pan-layout.js'
import {
  radialTargetOf
} from '../modules/canvas/pan-crown/pan-actions.js'
import {
  nodeVisibility
} from '../modules/canvas/pan-crown/pan-visibility.js'
import {
  silentNearbyOnScene, tokenActorsOf
} from '../modules/canvas/pan-crown/pan-perception-card.js'

// The defects of the crown found by the grouped review of Fleur (alpha 32df8eae6), one block per defect

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const LAYER = '../modules/canvas/pan-crown/pan-crown-layer.js'

const graphOf = (nodes = {
}) => ({
  master: 'Item.M',
  links: [{
    from: 'owner', to: 'Item.M', kind: 'persona'
  }],
  nodes: [{
    uuid: 'Item.M', kind: 'master', name: 'Commlink', mode: 'active', distance: 12, visibility: {
      visible: true, reason: 'inRange'
    }, ...nodes
  }],
})

describe('M1: a move lays the crowns out again, it does not build them again', () => {
  it('gives the same signature whatever the distance', () => {
    const token = {
      w: 100, h: 100
    }
    expect(signatureOf(graphOf({
      distance: 12
    }), token)).toBe(signatureOf(graphOf({
      distance: 80
    }), token))
  })

  it('changes the signature when what is seen changes', () => {
    const seen = signatureOf(graphOf())
    expect(signatureOf(graphOf({
      visibility: {
        visible: false, reason: 'outOfRange'
      }
    }))).not.toBe(seen)
    expect(signatureOf(graphOf({
      hiddenFromPlayers: true
    }))).not.toBe(seen)
    expect(signatureOf(graphOf({
      mode: 'silent'
    }))).not.toBe(seen)
    expect(signatureOf(graphOf({
      viewerMarks: 1
    }))).not.toBe(seen)
  })

  it('changes the signature when a line goes to another token, or the token changes size', () => {
    const graph = graphOf({
      kind: 'drone'
    })
    expect(signatureOf(graph, null, new Map([['Item.M', {
      id: 'A'
    }]]))).not.toBe(signatureOf(graph, null, new Map([['Item.M', {
      id: 'B'
    }]])))
    expect(signatureOf(graph, {
      w: 100, h: 100
    })).not.toBe(signatureOf(graph, {
      w: 200, h: 200
    }))
  })

  it('cannot tell a graph that does not turn into JSON: the crown is drawn again', () => {
    const graph = graphOf()
    graph.nodes[0].intel = {
    }
    graph.nodes[0].intel.self = graph.nodes[0].intel
    expect(signatureOf(graph)).toBeNull()
  })

  it('only places the crowns and lays their lines out at each frame of a move', () => {
    const source = read(LAYER)
    const body = source.slice(source.indexOf('  onRefreshToken(token){'), source.indexOf('  #settleLater(){'))
    // No build at each frame: neither refresh() nor getGraph
    expect(body).not.toMatch(/this\.refresh\(/)
    expect(body).not.toMatch(/getGraph/)
    expect(body).toMatch(/this\.#relayout\(other\)/)
    expect(body).toMatch(/this\.#settleLater\(\)/)
    // The end of the move builds again, softly: drawn again only if what is seen changed
    expect(source).toMatch(/this\.refresh\(null, \{\s*soft: true\s*\}\)/)
    expect(source).toMatch(/if \(soft && crown\.graph && signature !== null && signature === crown\.signature\)/)
  })

  it('the crown of a token that moves folds, and unfolds where it stops (arbitrage de DjamZ du 08/10)', () => {
    const source = read(LAYER)
    const refresh = source.slice(source.indexOf('  onRefreshToken(token){'), source.indexOf('  #foldWhileMoving(crown){'))
    // Only after a real move (the early return for a token redrawn where it stands comes first), only its own crown
    expect(refresh.indexOf('if (crown) this.#foldWhileMoving(crown)')).toBeGreaterThan(refresh.indexOf('if (before === undefined || before === at) return'))
    const fold = source.slice(source.indexOf('  #foldWhileMoving(crown){'), source.indexOf('  #settleLater(){'))
    expect(fold).toMatch(/crown\.folded = true[\s\S]*crown\.container\.visible = false/)
    // One timer per token, put off at each frame: the crown unfolds once the token stops
    expect(fold).toMatch(/clearTimeout\(this\._stops\.get\(id\)\)[\s\S]*setTimeout\([\s\S]*crown\.folded = false[\s\S]*crown\.deployStart = performance\.now\(\)[\s\S]*PAN_SETTLE_MS\)/)
    // A crown placed while it is folded stays hidden
    expect(source).toContain('container.visible = token.visible && !crown.folded')
    // Its timers go with the token and with the canvas
    expect(source).toMatch(/forget\(tokenId\)\{[\s\S]*clearTimeout\(this\._stops\.get\(tokenId\)\)/)
  })

  it('M5: works out what is seen again when any token ends its move, an observed one too', () => {
    const source = read(LAYER)
    const body = source.slice(source.indexOf('  onRefreshToken(token){'), source.indexOf('  #settleLater(){'))
    // Not only the viewer's token or a player's: an NPC that comes within 100 m (SR5 p. 236)
    expect(body).not.toMatch(/token\.controlled/)
    expect(body).toMatch(/\r?\n {4}this\.#settleLater\(\)\r?\n {2}\}/)
  })

  it('M6: the radial menu switches a device the sheets\' way, which clears a master left silent on its item', () => {
    const radial = read('../modules/canvas/pan-crown/pan-radial-menu.js')
    const fn = radial.slice(radial.indexOf('export async function switchMode'))
    expect(fn).toMatch(/if \(item\.isEmbedded && hasDeviceMode\(item\)\) return switchDeviceMode\(item, mode\)/)
    // and its own path, for what the sheets do not switch, clears the box too
    expect(fn).toMatch(/if \(item\.system\?\.isSilent\) await item\.update\(\{\s*"system\.isSilent": false/)
    const sheet = read('../modules/canvas/pan-crown/pan-device-switch.js')
    // the sheets' way: the lock against a double click, and the master's box cleared
    expect(sheet).toMatch(/if \(switching\.has\(item\.uuid\)\) return/)
    expect(sheet).toMatch(/if \(item\.system\.isSilent\) await item\.update\(\{\s*"system\.isSilent": false/)
  })

  it('M7: aims at a sprite with no token by the uuid of its own actor, never through its technomancer', () => {
    const graph = {
      master: 'Actor.techno.Item.persona', nodes: []
    }
    const sprite = {
      uuid: 'Actor.sprite.Item.device', kind: 'sprite', holderIds: ['sprite'], anchorIds: ['techno']
    }
    const resolve = uuid => uuid === sprite.uuid ? {
      parent: {
        uuid: 'Actor.sprite'
      }
    } : null
    expect(radialTargetOf(sprite, graph, {
      token: null, resolve
    })).toEqual({
      targetTokenId: undefined, targetUuid: 'Actor.sprite'
    })
    // with its own token on the scene, the token as before
    expect(radialTargetOf(sprite, graph, {
      token: {
        id: 'spriteToken'
      }, resolve
    })).toEqual({
      targetTokenId: 'spriteToken', targetUuid: null
    })
  })

  it('M7: aims at a deployed drone with no token by its actor, at a device by its item', () => {
    const graph = {
      master: 'Actor.rigger.Item.deck', nodes: []
    }
    expect(radialTargetOf({
      uuid: 'Actor.rigger.Item.vehicle', kind: 'drone', droneId: 'drone'
    }, graph, {
      actorById: id => id === 'drone' ? {
        uuid: 'Actor.drone'
      } : null
    })).toEqual({
      targetTokenId: undefined, targetUuid: 'Actor.drone'
    })
    expect(radialTargetOf({
      uuid: 'Actor.guard.Item.gun', kind: 'slave'
    }, graph, {
      token: {
        id: 'guardToken'
      }
    })).toEqual({
      targetTokenId: 'guardToken', targetUuid: 'Actor.guard.Item.gun'
    })
    // nothing to aim at: rollMatrixActionOn says the target is missing, as before
    expect(radialTargetOf({
      uuid: 'Actor.gone.Item.x', kind: 'drone', droneId: 'gone'
    }, graph)).toEqual({
      targetTokenId: undefined, targetUuid: null
    })
  })

  it('draws no line to a token the gamemaster hid, for a player; the gamemaster sees it', () => {
    const node = {
      kind: 'drone', mode: 'active', ownerIds: ['rigger'], marks: [], revealed: true
    }
    // even the owner, or a revealed device: Foundry hides the token from every player
    expect(nodeVisibility(node, {
      ids: ['rigger'], hasAntenna: true
    }, {
      distance: 5, tokenHidden: true
    })).toEqual({
      visible: false, reason: 'hiddenToken'
    })
    expect(nodeVisibility(node, {
      isGM: true
    }, {
      tokenHidden: true
    })).toEqual({
      visible: true, reason: 'gm'
    })
    expect(nodeVisibility(node, {
      ids: ['rigger'], hasAntenna: true
    }, {
      distance: 5
    }).visible).toBe(true)
    const crown = read('../modules/canvas/pan-crown/pan-crown.js')
    expect(crown).toMatch(/PAN_TOKEN_KINDS\.includes\(node\.kind\) && nodeToken !== crown\.token && nodeToken\?\.document\?\.hidden === true/)
    expect(read(LAYER)).toMatch(/if \("hidden" in \(changes \?\? \{\s*\}\)\) layer\(\)\?\.refresh\(\)/)
  })

  it('closes the radial menu with the scene shown, its token or an actor deleted', () => {
    const radial = read('../modules/canvas/pan-crown/pan-radial-menu.js')
    expect(radial).toMatch(/openMenuTokenId = token\.id \?\? null/)
    expect(radial).toMatch(/if \(openMenu && openMenuTokenId === tokenId\) closeMenu\(\)/)
    const layer = read(LAYER)
    expect(layer).toMatch(/Hooks\.on\("canvasTearDown", \(\) => closeRadialMenu\(\)\)/)
    expect(layer).toMatch(/Hooks\.on\("deleteActor", \(\) => closeRadialMenu\(\)\)/)
    expect(layer).toMatch(/Hooks\.on\("deleteToken", document => \{\s*closeRadialMenuOf\(document\.id\)/)
  })

  it('forgets a deleted token, which Ctrl+Z may bring back with its id, and gives the hook a Token', () => {
    const layer = read(LAYER)
    expect(layer).toMatch(/closeRadialMenuOf\(document\.id\)\r?\n {4}layer\(\)\?\.forget\(document\.id\)/)
    const forget = layer.slice(layer.indexOf('  forget(tokenId){'), layer.indexOf('  /** The tokens of the scene'))
    expect(forget).toMatch(/this\.dismissed\.delete\(tokenId\)/)
    expect(forget).not.toMatch(/this\.dismissed\.add/)
    expect(layer).toMatch(/safeCall\(PAN_CROWN_HOOKS\.closed, \[crown\.token\]\)/)
  })

  it('takes a crown away whose build fails, and follows a deleted actor', () => {
    const layer = read(LAYER)
    // every build goes through the catch: at the opening and at each refresh
    expect(layer.match(/this\.#build\(/g)).toHaveLength(1)
    expect(layer).toMatch(/await this\.#rebuild\(crown\)/)
    expect(layer).toMatch(/if \(crown\) this\.#rebuild\(crown, \{/)
    expect(layer).toMatch(/catch \(error\) \{\s*console\.error\("SR5 \| PAN crown: a crown could not be drawn", error\)\s*if \(this\.crowns\.get\(crown\.token\.id\) === crown\) this\.#hide\(crown\.token\)/)
    expect(layer).toMatch(/"updateActor", "deleteActor", "controlToken"/)
    expect(layer).toMatch(/\["canvasReady", "createToken", "deleteToken", "deleteActor"\]/)
  })

  it('Matrix Perception counts the silent icons within 100 m on the scene\'s documents, the canvas elsewhere', () => {
    const commlink = (id, owner, silent = false) => ({
      id, uuid: `Actor.${owner}.Item.${id}`, type: 'itemDevice', name: 'Commlink', parent: null,
      system: {
        isWireless: true, wirelessTurnedOn: true, isActive: true, isSilent: silent, deviceRating: 3, pan: {
          content: []
        }
      },
    })
    const actor = (id, items, extra = {
    }) => ({
      id, uuid: `Actor.${id}`, type: 'actorPc', name: id, items, system: {
        matrix: {
        }
      }, ...extra
    })
    const decker = actor('decker', [commlink('c1', 'decker')])
    const near = actor('near', [commlink('c2', 'near', true)])
    const far = actor('far', [commlink('c3', 'far', true)])
    const loud = actor('loud', [commlink('c4', 'loud')])
    const doc = (id, a, x, linked = true) => ({
      id, actor: a, actorLink: linked, actorId: a.id, getCenterPoint: () => ({
        x, y: 0
      })
    })
    const scene = {
      tokens: [doc('t1', decker, 0), doc('t2', near, 50), doc('t3', far, 150), doc('t4', loud, 10)],
      // one unit per meter
      grid: {
        measurePath: ([a, b]) => ({
          distance: Math.abs(b.x - a.x)
        })
      },
    }
    expect(silentNearbyOnScene(decker, scene)).toBe(1)
    // inside a host there is no distance (A2): the far one counts too
    expect(silentNearbyOnScene(decker, scene, {
      inHost: true
    })).toBe(2)
    // an observer with no token on that scene
    expect(silentNearbyOnScene(actor('nobody', []), scene)).toBeNull()
    // the unlinked tokens' actors, which game.actors does not hold
    expect(tokenActorsOf({
      tokens: [{
        actor: {
          isToken: true, id: 'drone'
        }
      }, {
        actor: decker
      }, {
        actor: null
      }]
    }).map(a => a.id)).toEqual(['drone'])
    const card = read('../modules/canvas/pan-crown/pan-perception-card.js')
    expect(card).toMatch(/resolve: uuid => globalThis\.fromUuidSync\?\.\(uuid\) \?\? null, actors: actorsAround\(target\)/)
    expect(card).toMatch(/if \(!token\) \{\s*const scene = observer\?\.isToken \? observer\.token\?\.parent : \(game\.scenes\?\.active \?\? null\)/)
  })

  it('makes the name of an icon the first time it is read, not at each build', () => {
    const source = read(LAYER)
    expect(source).toMatch(/let label = null/)
    expect(source).toMatch(/icon\.on\("pointerover", \(\) => \{\s*showLabel\(\)/)
  })
})
