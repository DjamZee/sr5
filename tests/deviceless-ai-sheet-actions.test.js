import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

// The sheets extend Foundry's ActorSheetV2: a bare class is enough to reach their preparation methods
foundry.applications.sheets ??= {
  ActorSheetV2: class {}
}
const {
  SR5ActorSheet
} = await import('../modules/entities/actors/characterSheet.js')
const {
  SR5GruntSheet
} = await import('../modules/entities/actors/gruntSheet.js')

const action = (source, linkedAttribute, dicePool) => ({
  source, test: {
    dicePool
  }, limit: {
    linkedAttribute
  }
})

/** A character of that type, AI or not, with or without an active device, whose attributes are all 0 */
function character(type, {
  depth = false, device = false
} = {
}) {
  return {
    type,
    items: device ? [{
      type: 'itemDevice', system: {
        isActive: true
      }
    }] : [],
    system: {
      activeSpecialAttribute: depth ? 'depth' : 'magic',
      matrix: {
        attributes: {
          attack: {
            value: 0
          }, sleaze: {
            value: 0
          }
        },
        actions: {
          dataSpike: action('core', 'attack', 9),
          snoop: action('core', 'sleaze', 9),
          matrixPerception: action('core', 'dataProcessing', 9),
          redefineOwnership: action('dataTrails', 'dataProcessing', 9),
        }
      }
    }
  }
}

/** The matrix actions the sheet lists */
function listed(Sheet, actor) {
  Sheet.prototype._prepareMatrixActions.call({
    actor, _shownNonRollableMatrixActions: false
  }, actor)
  return Object.keys(actor.system.matrix.actions)
}

beforeEach(() => {
  game.settings.get = vi.fn(() => false)
})

for (const [name, Sheet, type] of [['character', SR5ActorSheet, 'actorPc'], ['grunt', SR5GruntSheet, 'actorGrunt']]) {
  describe(`Matrix actions listed on a ${name} sheet (Data Trails p. 159)`, () => {
    it('folds Attack and Sleaze actions at 0 for an ordinary character', () => {
      expect(listed(Sheet, character(type))).toEqual(['matrixPerception'])
    })

    it('lists them for an AI without a device, which emulates them, but not its Depth actions', () => {
      expect(listed(Sheet, character(type, {
        depth: true
      }))).toEqual(['dataSpike', 'snoop', 'matrixPerception'])
    })

    it('keeps the Depth actions of an AI loaded on a device', () => {
      expect(listed(Sheet, character(type, {
        depth: true, device: true
      }))).toContain('redefineOwnership')
    })
  })
}
