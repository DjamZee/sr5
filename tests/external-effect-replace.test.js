import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

//Animal Sense and Eyes of the Pack (Street Grimoire p. 106): the effect passed to the subject makes the net hits
//the Limit of Perception. applyExternalEffect gave every passed effect the type "value", always additive.
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

const STOP = new Error("stop after creation")

async function passedEffect(type){
  let created
  const actor = {
    isToken: false, items: [],
    createEmbeddedDocuments: async (_, docs) => {
      created = docs[0]; throw STOP
    },
  }
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
  vi.spyOn(SR5_EntityHelpers, "getLabelByKey").mockReturnValue("label")
  globalThis.fromUuid = async () => ({
    name: "Sens animal", type: "itemSpell", system: {
      itemRating: 0, targetOfEffect: {
      }, systemEffects: {
      },
      customEffects: {
        0: {
          category: "skills", target: "system.skills.perception.limit", type, transfer: true, multiplier: null
        }
      }
    }
  })
  await expect(SR5_ActorHelper.applyExternalEffect("subject", {
    owner: {
      itemUuid: "Item.spell", actorId: "caster", speakerActor: "Mage"
    },
    roll: {
      hits: 5, netHits: 3
    }, test: {
      type: "spell"
    },
  }, "customEffects")).rejects.toBe(STOP)
  return created["system.customEffects"][0]
}

beforeEach(() => vi.restoreAllMocks())

describe("effect passed to the target of a spell", () => {
  it("replaces with the net hits for netHitsReplace", async () => {
    const e = await passedEffect("netHitsReplace")
    expect([e.type, e.value]).toEqual(["valueReplace", 3])
  })
  it("replaces with the hits for hitsReplace", async () => {
    const e = await passedEffect("hitsReplace")
    expect([e.type, e.value]).toEqual(["valueReplace", 5])
  })
  it("stays additive for netHits (counter-proof)", async () => {
    const e = await passedEffect("netHits")
    expect([e.type, e.value]).toEqual(["value", 3])
  })
})
