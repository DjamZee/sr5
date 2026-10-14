import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  bloodMetamagicKey, isBloodSpell, isSelfCostBloodSpell, bloodPointsFor, martyrPoints, batchExpired, availablePoints,
  spendPoints, bloodSpending, bloodDrain, bloodAddictionThreshold, bloodSpellUnpaid
} from "../modules/system/blood-magic-rules.js"
import {
  spellDrainCheck
} from "../modules/rolls/roll-helpers/attack-card.js"
import {
  effectCardVerdict
} from "../modules/rolls/roll-helpers/effect-card.js"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

describe("Blood magic: points (Street Grimoire p. 90, Forbidden Arcana p. 130)", () => {
  it("recognises Sacrifice and Cannibalize, and the Blood spells, by their French or English name", () => {
    expect(bloodMetamagicKey({
      name: "Sacrifice"
    })).toBe("sacrifice")
    expect(bloodMetamagicKey({
      name: "Cannibalisme"
    })).toBe("cannibalize")
    expect(bloodMetamagicKey({
      name: "Sacrifice spirituel"
    })).toBe("")
    expect(isBloodSpell({
      name: "Sang Bouillonnant"
    })).toBe(true)
    expect(isBloodSpell({
      name: "x", flags: {
        sr5: {
          nameVO: "Viscera Web"
        }
      }
    })).toBe(true)
    expect(isBloodSpell({
      name: "Boule de feu"
    })).toBe(false)
    expect(isSelfCostBloodSpell({
      name: "Fouet de Sang"
    })).toBe(true)
  })

  it("gives 1 point per box on an unwilling sapient victim (VO), 1 per 3 boxes otherwise", () => {
    expect(bloodPointsFor(5, "unwilling")).toBe(5)
    expect(bloodPointsFor(5, "willing")).toBe(1)
    expect(bloodPointsFor(2, "willing")).toBe(0)
  })

  it("gives the martyr 1 point per 3 boxes, the first box giving it for the spells that cost 1P", () => {
    expect(martyrPoints(3)).toBe(1)
    expect(martyrPoints(2)).toBe(0)
    expect(martyrPoints(1, true)).toBe(1)
    expect(martyrPoints(4, true)).toBe(2)
  })

  it("loses the points after the following Combat Turn", () => {
    const batch = {
      points: 3, combatId: "c1", round: 2, time: 0
    }
    expect(batchExpired(batch, {
      id: "c1", round: 3
    }, 0)).toBe(false)
    expect(batchExpired(batch, {
      id: "c1", round: 4
    }, 0)).toBe(true)
    expect(batchExpired(batch, null, 0)).toBe(true)
    expect(batchExpired({
      points: 2, time: 100
    }, null, 105)).toBe(false)
    expect(batchExpired({
      points: 2, time: 100
    }, null, 107)).toBe(true)
  })

  it("spends the oldest points first", () => {
    const batches = [{
      points: 2, time: 0
    }, {
      points: 3, time: 1
    }]
    expect(availablePoints(batches, null, 2)).toBe(5)
    expect(spendPoints(batches, 3, null, 2)).toEqual([{
      points: 2, time: 1
    }])
  })

  it("never spends more than the points at hand, martyr points first", () => {
    const spent = bloodSpending({
      force: 3, drainMagic: 2, drain: 4, martyr: 1, pool: 4
    })
    expect([spent.force, spent.drainMagic, spent.drain]).toEqual([3, 2, 0])
    expect(spent.fromMartyr).toBe(1)
    expect(spent.fromPool).toBe(4)
  })

  it("lowers the Drain down to 0, below the floor", () => {
    expect(bloodDrain(2, 3)).toBe(0)
    expect(bloodDrain(5, 2)).toBe(3)
  })

  it("sets the addiction threshold to 2, 3 when one effect takes more points than the Magic", () => {
    expect(bloodAddictionThreshold({
      force: 4, drain: 1
    }, 4)).toBe(2)
    expect(bloodAddictionThreshold({
      force: 5
    }, 4)).toBe(3)
  })

  it("refuses a Blood spell cast without a point", () => {
    expect(bloodSpellUnpaid({
      bloodSpell: true
    })).toBe(true)
    expect(bloodSpellUnpaid({
      bloodSpell: true, drain: 1
    })).toBe(false)
    expect(bloodSpellUnpaid({
      bloodSpell: false
    })).toBe(false)
  })
})

describe("Blood magic: the GM's check of the cards gives no false alert", () => {
  it("keeps the Force the points added, without Drain, and the Drain they lowered", () => {
    //Force 6, spell Drain -3 (Drain 3), +2 Force from blood (Force 8, no Drain), -3 Drain from blood (Drain 0)
    const check = spellDrainCheck({
      force: 8, drainValue: 0, modifiers: {
        bloodMagic: {
          value: -3
        }
      }, itemDrain: -3, blood: true, bloodForce: 2
    })
    expect(check.force).toBe(8)
    expect(check.expected).toBe(0)
  })

  it("reads no blood point for a caster who does not know Sacrifice", () => {
    const check = spellDrainCheck({
      force: 8, drainValue: 0, modifiers: {
        bloodMagic: {
          value: -3
        }
      }, itemDrain: -3, blood: false, bloodForce: 2
    })
    expect(check.force).toBeLessThan(8)
  })

  it("lets an effect card's Force exceed twice the Magic by its blood points", () => {
    const rollJSON = {
      terms: [{
        results: Array.from({
          length: 9
        }, () => ({
          result: 5, active: true
        }))
      }]
    }
    const verdict = effectCardVerdict({
      authorOwnsCaster: true, itemOnCaster: true, rollJSON, pool: 9, force: 9, magic: 4, claimedHits: 9, claimedNetHits: 9, bonusForce: 1
    })
    expect(verdict.limit).toBe(9)
  })
})

describe("Blood magic: wiring", () => {
  it("offers the points of a melee wound, asked by the owner and granted by the GM", () => {
    expect(read("modules/entities/actors/entityActor-helpers.js")).toMatch(/offerSacrifice\(realActor, options, damage\)/)
    expect(read("modules/socket.js")).toMatch(/"bloodSacrifice":/)
    expect(read("modules/system/blood-magic.js")).toMatch(/DialogV2\.confirm/)
    expect(read("modules/sr5.js")).toMatch(/onRenderSacrificeCard/)
  })

  it("spends the points in the spell's dialog and counts them for the Drain type", () => {
    expect(read("templates/rolls/rollDialogPartial/spellOptions.hbs")).toMatch(/name="bloodMartyrBoxes"/)
    expect(read("modules/rolls/roll-dialog.js")).toMatch(/_updateBloodMagic\(html, dialogData\)/)
    expect(read("modules/rolls/roll-prepare-case/rollData-Drain.js")).toMatch(/bloodMagic\?\.drainMagic/)
    expect(read("modules/rolls/roll-message.js")).toMatch(/case "bloodAddiction":/)
  })
})
