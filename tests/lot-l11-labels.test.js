import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// Lot L11: labels the player or the GM read wrong (MESURES-C C6, MESURES-D).

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

globalThis.fromUuid = vi.fn(async () => null)
const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')
const {
  SR5
} = await import('../modules/config.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const {
  overwatchResistanceInfo
} = await import('../modules/rolls/roll-test-case/index.js')
const {
  resistanceDisease
} = await import('../modules/rolls/roll-prepare-case/rollData-ResistanceSimple.js')
const {
  infectWith
} = await import('../modules/system/diseases.js')

let previousGet, previousFormat
beforeEach(() => {
  previousGet = game.settings.get
  previousFormat = game.i18n.format
})
afterEach(() => {
  game.settings.get = previousGet
  game.i18n.format = previousFormat
  vi.restoreAllMocks()
})

// C6 d: a vehicle defends with its device rating in place of the mental attributes
describe('matrix defense of a vehicle', () => {
  function vehicleDefenses(){
    const actions = {
    }
    for (const key of [...Object.keys(SR5.matrixActions), 'checkOverwatchScore']) actions[key] = {
      defense: {
        base: 0, dicePool: 0, modifiers: []
      }
    }
    const sheet = {
      type: 'actorDrone', name: 'Voiture', items: [],
      system: {
        vehicleOwner: {
          id: ''
        },
        matrix: {
          deviceRating: 3, actions, attributes: {
          }
        },
      },
    }
    game.settings.get = () => null
    SR5_CharacterUtility.generateMatrixActionsDefenses(sheet)
    return actions
  }

  it('names the device rating, not Intuition, Willpower or Logic', () => {
    const actions = vehicleDefenses()
    const sources = key => actions[key].defense.modifiers.map(m => m.source)
    expect(sources('hackOnTheFly')).toEqual(['SR5.DeviceRating', 'SR5.Firewall'])
    expect(sources('bruteForce')).toEqual(['SR5.DeviceRating', 'SR5.Firewall'])
    expect(sources('snoop')).toEqual(['SR5.DeviceRating', 'SR5.Firewall'])
    expect(actions.hackOnTheFly.defense.dicePool).toBe(6)
  })
})

// Quentin's review: a sprite's rating is its Level, in defense as in resistance
describe('matrix defense of a sprite', () => {
  it('names the Level', () => {
    const actions = {
    }
    for (const key of [...Object.keys(SR5.matrixActions), 'checkOverwatchScore']) actions[key] = {
      defense: {
        base: 0, dicePool: 0, modifiers: []
      }
    }
    game.settings.get = () => null
    SR5_CharacterUtility.generateMatrixActionsDefenses({
      type: 'actorSprite', name: 'Sprite', items: [], system: {
        matrix: {
          deviceRating: 4, actions, attributes: {
            firewall: {
              value: 5
            }, sleaze: {
              value: 0
            }, dataProcessing: {
              value: 0
            }, attack: {
              value: 0
            }
          }
        }
      }
    })
    expect(actions.hackOnTheFly.defense.modifiers.map(m => m.source)).toEqual(['SR5.Level', 'SR5.Firewall'])
  })
})

// C6 b, Quentin's review: mouseover bubbles, so a help on the column would overwrite the agent button's own
describe('agent row on the programs tab', async () => {
  const {
    readFileSync
  } = await import('node:fs')
  const template = readFileSync('templates/actors/_partials/right-tabs/matrix/programs.hbs', 'utf8')
  it('puts no help on the column holding the agent button', () => {
    const before = template.slice(0, template.indexOf("{{#if (eq system.type 'agent')}}"))
    const column = before.slice(before.lastIndexOf('<div'))
    expect(column).not.toContain('data-helpTitle')
    expect(template).toContain("SR5.HELP_AgentCreate")
  })
})

// C6 e: the overwatch button names the unlinked token the score is written to
describe('overwatch button of an unlinked token', () => {
  it('shows the token name rather than the base actor', async () => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(() => ({
      name: 'Nils C — Decker', token: {
        name: 'Nils C (2)'
      }, system: {
        matrix: {
          overwatchScore: 0
        }
      }
    }))
    vi.spyOn(SR5_RollMessage, 'generateChatButton').mockImplementation((a, b, label) => label)
    const formats = []
    game.i18n.format = (key, data) => {
      formats.push([key, data])
      return key
    }
    const cardData = {
      previousMessage: {
        actorId: 't1', hits: 3
      }, roll: {
        hits: 2
      }, chatCard: {
        buttons: {
        }
      }
    }
    await overwatchResistanceInfo(cardData)
    expect(formats.find(([k]) => k === 'SR5.IncreaseOverwatch')[1].name).toBe('Nils C (2)')
  })
})

// MESURES-D: the disease test card is seen by the player
describe('disease resistance title', () => {
  const actor = {
    system: {
      resistances: {
        disease: {
          inhalation: {
            modifiers: []
          }
        }
      }
    }
  }
  const rollData = () => ({
    test: {
    }, dicePool: {
      composition: [], modifiers: []
    }
  })
  const chatData = {
    disease: {
      name: 'Masque rouge', power: 4, modifiers: [], penetration: 0
    }
  }

  it('hides the Power when the world does not reveal diseases', async () => {
    game.settings.get = () => false
    const data = await resistanceDisease(rollData(), 'inhalation', actor, chatData)
    expect(data.test.title).not.toContain('4')
    expect(data.test.title).toContain('Masque rouge')
  })

  it('shows it when the world reveals them', async () => {
    game.settings.get = () => true
    const data = await resistanceDisease(rollData(), 'inhalation', actor, chatData)
    expect(data.test.title).toContain('(4)')
  })
})

// MESURES-D: "Infect" took the targeted and the selected tokens together
describe('infecting the selected tokens', () => {
  let previousCanvas, previousUser, previousUsers, previousApi
  beforeEach(() => {
    previousCanvas = globalThis.canvas
    previousUser = game.user
    previousUsers = game.users
    previousApi = foundry.applications.api
  })
  afterEach(() => {
    globalThis.canvas = previousCanvas
    game.user = previousUser
    game.users = previousUsers
    foundry.applications.api = previousApi
  })

  async function offered({
    controlled, targeted
  }){
    const tok = id => ({
      actor: {
        uuid: `Actor.${id}`, name: id, type: 'actorPc'
      }
    })
    game.user = {
      id: 'gm', isGM: true, targets: new Set(targeted.map(tok))
    }
    game.users = {
      activeGM: {
        id: 'gm'
      }
    }
    globalThis.canvas = {
      tokens: {
        controlled: controlled.map(tok)
      }
    }
    CONFIG.SR5 ??= SR5
    let content = ''
    foundry.applications.api = {
      ...previousApi, DialogV2: {
        prompt: async o => {
          content = o.content
          return null
        }
      }
    }
    await infectWith({
      name: 'Masque rouge', system: {
        vector: {
          inhalation: true
        }, power: 4, penetration: 0, effect: {
        }, pathogen: {
          interval: {
            value: 1, unit: 'day'
          }, minTests: 1, effect: {
          }
        }
      }
    })
    return content
  }

  it('leaves a token still targeted out when tokens are selected', async () => {
    const content = await offered({
      controlled: ['a'], targeted: ['b']
    })
    expect(content).toContain('Actor.a')
    expect(content).not.toContain('Actor.b')
  })

  it('falls back on the targeted tokens when none is selected', async () => {
    const content = await offered({
      controlled: [], targeted: ['b']
    })
    expect(content).toContain('Actor.b')
  })
})
