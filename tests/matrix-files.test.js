import {
  describe, it, expect
} from 'vitest'
import {
  bombDamage, bombOf, fileFacts, fileOppositionDice, knowsPassword, protectionOf, resolveFileAction, FILE_NODE_ACTIONS
} from '../modules/system/matrix-files.js'
import {
  buildPanGraph
} from '../modules/canvas/pan-crown/pan-graph.js'
import {
  actionsForNode, aimedItemUuid, menuEntries
} from '../modules/canvas/pan-crown/pan-actions.js'
import {
  iconCategoryOf
} from '../modules/canvas/pan-crown/pan-icons.js'
import {
  answerOf, sourceOf, entryOf
} from '../modules/canvas/pan-crown/pan-perception.js'
import {
  needsGMWindow, perceptionFacts
} from '../modules/canvas/pan-crown/pan-perception-card.js'

// The files of the Matrix (objet Fichier, decision of DjamZ 07/10): SR5 p. 228, 230, 237, 240, 242, 243

function file(system = {
}, extra = {
}){
  return {
    id: extra.id ?? 'f1', uuid: extra.uuid ?? 'Actor.host.Item.f1', name: extra.name ?? 'Paie', type: 'itemFile',
    system: {
      protection: 0, dataBomb: {
        rating: 0, destroysFile: false, setBy: '', setByName: ''
      }, lastEdit: {
        worldTime: null, by: '', byName: ''
      }, marks: [], ...system
    },
  }
}
const bombed = (rating, destroysFile = false, setBy = 'decker') => ({
  dataBomb: {
    rating, destroysFile, setBy, setByName: 'Decker'
  }
})

describe('a file: protection and data bomb (SR5 p. 240, 243)', () => {
  it('reads its protection and its bomb, 0 being none', () => {
    expect(protectionOf(file())).toBe(0)
    expect(protectionOf(file({
      protection: 4
    }))).toBe(4)
    expect(bombOf(file())).toBe(null)
    expect(bombOf(file(bombed(3, true)))).toEqual({
      rating: 3, destroysFile: true, setBy: 'decker', setByName: 'Decker'
    })
  })

  it('opposes Crack File with protection x 2, Disarm with bomb x 2, Set Data Bomb with Device Rating x 2', () => {
    expect(fileOppositionDice('crackFile', file({
      protection: 4
    }))).toBe(8)
    expect(fileOppositionDice('crackFile', file())).toBe(null)
    expect(fileOppositionDice('disarmDataBomb', file(bombed(3)))).toBe(6)
    expect(fileOppositionDice('disarmDataBomb', file())).toBe(null)
    expect(fileOppositionDice('setDataBomb', file(), 5)).toBe(10)
    expect(fileOppositionDice('editFile', file(), 5)).toBe(null)
  })

  it('lets whoever set the bomb, and the owner of the file, know its password', () => {
    const f = file(bombed(2))
    expect(knowsPassword(f, ['decker'], ['host'])).toBe(true)
    expect(knowsPassword(f, ['host'], ['host'])).toBe(true)
    expect(knowsPassword(f, ['other'], ['host'])).toBe(false)
    expect(knowsPassword(file(), ['other'], ['host'])).toBe(true)
  })

  it('sums the bomb\'s D6 for its Matrix damage', () => {
    expect(bombDamage([6, 1, 4])).toBe(11)
    expect(bombDamage([])).toBe(0)
  })
})

describe('Crack File (SR5 p. 242)', () => {
  it('removes the protection on a net hit, fails otherwise', () => {
    const f = file({
      protection: 3
    })
    expect(resolveFileAction({
      action: 'crackFile', file: f, hits: 4, oppositionHits: 3
    })).toMatchObject({
      outcome: 'cracked', update: {
        'system.protection': 0
      }
    })
    expect(resolveFileAction({
      action: 'crackFile', file: f, hits: 3, oppositionHits: 3
    }).outcome).toBe('failed')
  })

  it('has no effect on a file that is not protected', () => {
    expect(resolveFileAction({
      action: 'crackFile', file: file(), hits: 5
    })).toMatchObject({
      outcome: 'notProtected', update: null
    })
  })
})

describe('Set Data Bomb (SR5 p. 243)', () => {
  it('sets a bomb of at most the net hits, that erases the file or not, signed by its setter', () => {
    const result = resolveFileAction({
      action: 'setDataBomb', file: file(), hits: 5, oppositionHits: 2, bomb: {
        rating: 6, destroysFile: true
      }, by: {
        id: 'decker', name: 'Decker'
      }
    })
    expect(result.outcome).toBe('bombSet')
    expect(result.update).toMatchObject({
      'system.dataBomb.rating': 3, 'system.dataBomb.destroysFile': true, 'system.dataBomb.setBy': 'decker'
    })
    expect(resolveFileAction({
      action: 'setDataBomb', file: file(), hits: 5, oppositionHits: 2, bomb: {
        rating: 1
      }
    }).update['system.dataBomb.rating']).toBe(1)
    expect(resolveFileAction({
      action: 'setDataBomb', file: file(), hits: 2, oppositionHits: 2
    }).outcome).toBe('failed')
  })

  it('sets off the bomb already there without its password; with it, refuses a second one', () => {
    const f = file(bombed(4, true))
    expect(resolveFileAction({
      action: 'setDataBomb', file: f, hits: 6, knowsPassword: false
    })).toMatchObject({
      outcome: 'exploded', update: null, explosion: {
        rating: 4, destroysFile: true
      }
    })
    expect(resolveFileAction({
      action: 'setDataBomb', file: f, hits: 6, knowsPassword: true
    }).outcome).toBe('alreadyBombed')
  })
})

describe('Disarm Data Bomb (SR5 p. 240)', () => {
  it('erases the bomb on a net hit', () => {
    expect(resolveFileAction({
      action: 'disarmDataBomb', file: file(bombed(3)), hits: 7, oppositionHits: 6
    })).toMatchObject({
      outcome: 'disarmed', update: {
        'system.dataBomb.rating': 0
      }
    })
  })

  it('sets it off otherwise: the bomb erases itself, and the file if it was set to', () => {
    const keep = resolveFileAction({
      action: 'disarmDataBomb', file: file(bombed(3)), hits: 2, oppositionHits: 2
    })
    expect(keep.outcome).toBe('exploded')
    expect(keep.update['system.dataBomb.rating']).toBe(0)
    expect(keep.explosion).toEqual({
      rating: 3, destroysFile: false
    })
    const erase = resolveFileAction({
      action: 'disarmDataBomb', file: file(bombed(3, true)), hits: 0, oppositionHits: 1
    })
    expect(erase.explosion.destroysFile).toBe(true)
    expect(erase.update).toBe(null)
  })

  it('finds nothing to disarm on a file with no bomb', () => {
    expect(resolveFileAction({
      action: 'disarmDataBomb', file: file(), hits: 3
    }).outcome).toBe('noBomb')
  })
})

describe('Edit File (SR5 p. 240)', () => {
  const by = {
    id: 'decker', name: 'Decker'
  }
  it('writes the last edit, its time and its author, on a net hit', () => {
    const result = resolveFileAction({
      action: 'editFile', file: file(), hits: 4, oppositionHits: 1, by, now: 3600
    })
    expect(result.outcome).toBe('edited')
    expect(result.update).toEqual({
      'system.lastEdit.worldTime': 3600, 'system.lastEdit.by': 'decker', 'system.lastEdit.byName': 'Decker'
    })
  })

  it('fails on a protected file', () => {
    expect(resolveFileAction({
      action: 'editFile', file: file({
        protection: 2
      }), hits: 6, oppositionHits: 0, by
    }).outcome).toBe('locked')
  })

  it('sets off a bomb at the try, before anything else, unless the password is known', () => {
    const f = file({
      protection: 2, ...bombed(5)
    })
    expect(resolveFileAction({
      action: 'editFile', file: f, hits: 0, oppositionHits: 3
    }).outcome).toBe('exploded')
    expect(resolveFileAction({
      action: 'editFile', file: f, hits: 6, knowsPassword: true
    }).outcome).toBe('locked')
  })

  it('lets the owner protect it, the hits being the rating', () => {
    expect(resolveFileAction({
      action: 'editFile', file: file(), hits: 3, mode: 'protect', by, now: 10
    }).update).toMatchObject({
      'system.protection': 3, 'system.lastEdit.worldTime': 10
    })
    expect(resolveFileAction({
      action: 'editFile', file: file(), hits: 0, mode: 'protect'
    }).outcome).toBe('failed')
  })
})

describe('a file in the crown of its carrier', () => {
  function hostWith(...files){
    const device = {
      id: 'd', uuid: 'Actor.host.Item.d', name: 'Appareil', type: 'itemDevice',
      system: {
        type: 'baseDevice', isActive: true, isWireless: true, wirelessTurnedOn: true, deviceRating: 5, marks: [], pan: {
          content: []
        }
      }, flags: {
      },
    }
    const host = {
      id: 'host', name: 'Serveur', type: 'actorDevice', isToken: false, items: [device, ...files],
      system: {
        matrix: {
          deviceType: 'host', runningSilent: false
        }
      },
    }
    for (const i of host.items) i.parent = host
    return host
  }

  it('hangs from the master device, takes its mode, and has no rating', () => {
    const f = file()
    const graph = buildPanGraph(hostWith(f))
    const node = graph.nodes.find(n => n.uuid === f.uuid)
    expect(node).toMatchObject({
      kind: 'file', icon: 'file', mode: 'active', rating: 0, itemType: 'itemFile'
    })
    expect(graph.links).toContainEqual({
      from: graph.master, to: f.uuid, kind: 'file'
    })
  })

  it('is out of the Matrix when nothing carries it there', () => {
    const f = file()
    const pc = {
      id: 'pc', name: 'PC', type: 'actorPc', isToken: false, items: [f], system: {
        matrix: {
        }
      }
    }
    f.parent = pc
    const node = buildPanGraph(pc).nodes.find(n => n.uuid === f.uuid)
    expect(node.mode).toBe('offline')
  })

  it('takes the generic icon "file"', () => {
    expect(iconCategoryOf(file())).toBe('file')
  })
})

describe('the radial menu of a file', () => {
  const actions = Object.fromEntries(['matrixPerception', 'hackOnTheFly', 'bruteForce', 'eraseMark', 'editFile', 'crackFile', 'setDataBomb', 'disarmDataBomb']
    .map(key => [key, {
      neededMarks: key === 'disarmDataBomb' || key === 'matrixPerception' || key === 'hackOnTheFly' || key === 'bruteForce' ? 0 : key === 'eraseMark' ? 3 : 1
    }]))
  const viewer = {
    actor: {
      system: {
        matrix: {
          actions
        }
      }
    }
  }

  it('offers the actions on files and those of any icon, never Data Spike (a file takes no damage)', () => {
    const keys = actionsForNode({
      kind: 'file', uuid: 'f'
    })
    expect(keys).toEqual(FILE_NODE_ACTIONS)
    expect(keys).not.toContain('dataSpike')
  })

  it('aims at the file itself', () => {
    expect(aimedItemUuid({
      kind: 'file', uuid: 'Actor.host.Item.f1'
    }, {
      master: 'Actor.host.Item.d'
    })).toBe('Actor.host.Item.f1')
  })

  it('greys out Crack File without a mark, and opens it with one', () => {
    const graph = {
      viewer: {
        ids: ['decker'], hasAntenna: true
      }, master: 'm'
    }
    const none = menuEntries({
      kind: 'file', uuid: 'f', ownerIds: ['host'], viewerMarks: 0
    }, graph, viewer)
    expect(none.actions.find(a => a.key === 'crackFile')).toMatchObject({
      enabled: false, reason: 'marks'
    })
    expect(none.actions.find(a => a.key === 'disarmDataBomb').enabled).toBe(true)
    const one = menuEntries({
      kind: 'file', uuid: 'f', ownerIds: ['host'], viewerMarks: 1
    }, graph, viewer)
    expect(one.actions.find(a => a.key === 'crackFile').enabled).toBe(true)
  })

  it('gives its owner Edit File and Set Data Bomb, no mode to switch', () => {
    const entries = menuEntries({
      kind: 'file', uuid: 'f', ownerIds: ['pc']
    }, {
      viewer: {
        ids: ['pc'], hasAntenna: true
      }
    }, viewer)
    expect(entries.owner).toBe(true)
    expect(entries.modes).toEqual([])
    expect(entries.actions.map(a => a.key)).toEqual(['editFile', 'setDataBomb'])
    expect(entries.actions.every(a => a.enabled)).toBe(true)
  })
})

describe('Matrix Perception on a file (SR5 p. 237)', () => {
  it('answers the three file entries from the file, with no gamemaster', () => {
    const f = file({
      protection: 4, ...bombed(2), lastEdit: {
        worldTime: 120, by: 'decker', byName: 'Decker'
      }
    })
    const facts = {
      file: fileFacts(f)
    }
    expect(answerOf({
      key: 'fileProtection'
    }, facts)).toEqual({
      key: 'fileProtection', value: 4, missing: false
    })
    expect(answerOf({
      key: 'fileBomb'
    }, facts).value).toBe(true)
    expect(answerOf({
      key: 'fileEdited'
    }, facts).value).toEqual({
      worldTime: 120, byName: 'Decker'
    })
    // Never edited in play: an answer all the same
    expect(answerOf({
      key: 'fileEdited'
    }, {
      file: fileFacts(file())
    })).toMatchObject({
      value: null, missing: false
    })
    expect(answerOf({
      key: 'fileBomb'
    }, {
      file: fileFacts(file())
    }).value).toBe(false)
  })

  it('leaves them to the gamemaster when the target is no file', () => {
    expect(sourceOf(entryOf('fileBomb'), false)).toBe('gm')
    expect(sourceOf(entryOf('fileBomb'), true)).toBe('system')
    expect(sourceOf(entryOf('silentInHost'), true)).toBe('gm')
    expect(answerOf({
      key: 'fileBomb'
    }, {
    }, {
      fileBomb: 'Oui'
    }).value).toBe('Oui')
    expect(needsGMWindow([{
      key: 'fileBomb'
    }, {
      key: 'fileProtection'
    }, {
      key: 'fileEdited'
    }], {
    }, true)).toBe(false)
    expect(needsGMWindow([{
      key: 'fileBomb'
    }], {
    }, false)).toBe(true)
  })

  it('reads a file as a file: no monitor, no rating, its type', () => {
    const f = file({
      protection: 1
    })
    const host = {
      uuid: 'Actor.host', type: 'actorDevice', name: 'Serveur', items: [f], system: {
        matrix: {
          deviceRating: 5, deviceType: 'host', conditionMonitors: {
          }
        }
      }
    }
    const facts = perceptionFacts({
      actor: host, item: f, persona: false
    })
    expect(facts.file).toEqual({
      protection: 1, bomb: false, lastEdit: null
    })
    expect(facts.monitor).toBe(null)
    expect(facts.deviceRating).toBe(0)
    expect(facts.iconType).toBe('file')
  })
})
