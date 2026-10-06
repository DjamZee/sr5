import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'
import {
  engulfDamage
} from '../modules/rolls/roll-helpers/toxin-card.js'

// SR5 p. 399: an air engulf deals Magic × 2 Stun, AP −Magic, at each of the spirit's following phases (Ivo)
describe('engulfDamage', () => {
  it('is Magic × 2 Stun with AP −Magic', () => {
    expect(engulfDamage(5)).toEqual({
      value: 10, armorPenetration: -5, type: "stun"
    })
  })

  it('reads nothing but the Magic, and never goes below 0', () => {
    expect(engulfDamage(undefined)).toEqual({
      value: 0, armorPenetration: 0, type: "stun"
    })
    expect(engulfDamage(-3).value).toBe(0)
    expect(engulfDamage("4.7").value).toBe(8)
  })
})

describe('engulf resistance wiring', () => {
  const resistance = readFileSync(new URL('../modules/rolls/roll-prepare-case/rollData-Resistance.js', import.meta.url), 'utf8')
  const message = readFileSync(new URL('../modules/rolls/roll-message.js', import.meta.url), 'utf8')

  // Victoire's review: the source is the GM's ledger for the actor who resists, never a card
  it('works the damage out again, for every engulf, from the ledger kept for the actor who resists', () => {
    const body = resistance.slice(resistance.indexOf('export default async function resistance'))
    expect(body).toMatch(/engulfDamageOf\(await SR5_ActorHelper\.engulfAttackFor\(actor\)\)/)
    expect(body).not.toMatch(/engulfSourceId/)
    expect(body).toMatch(/const continuousPhase = rollType === "resistanceCard" && chatData\.test\?\.typeSub === "continuousDamage"/)
    expect(body.indexOf('engulfDamageOf')).toBeLessThan(body.indexOf('rollData.damage.base = chatData.damage.value'))
  })

  // SR5 p. 399: resisted as a toxin by inhalation, armor does not protect; no second "continuous" button
  it('resists a following phase as a toxin, without the first hits nor the continuous damage buttons', () => {
    const block = resistance.slice(resistance.indexOf('if (airPhase){'))
    const body = block.slice(0, block.indexOf('//Transfert necessary info'))
    expect(body).toMatch(/rollType = "resistanceToxin"/)
    expect(body).toMatch(/chatData\.damage\.toxin\.power = engulf\.value/)
    expect(body).toMatch(/chatData\.roll\.netHits = 0/)
    expect(body).toMatch(/chatData\.damage\.isContinuous = false/)
  })

  it('shows on the button the damage worked out on the spirit, not the card', () => {
    const block = message.slice(message.indexOf('if (messageData.damage.toxin.type === "airEngulf"){'))
    expect(block.slice(0, 900)).toMatch(/engulfDamageOf\(await SR5_ActorHelper\.keepEngulfFirstPhase\(messageData\)\)/)
    expect(block.slice(0, 900)).not.toMatch(/messageData\.damage\.base/)
    //Remark 2 of Victoire: no AP on the button, armor does not count
    expect(block.slice(0, block.indexOf('generateChatButton("nonOpposedTest","resistanceCard"'))).not.toMatch(/ArmorPenetrationShort/)
  })

  // Victoire's review, remark 1: the previous phase's "Take on" button goes when the next phase is rolled
  it('removes the previous phase button of an air engulf when the next one is rolled', () => {
    const resistanceCase = readFileSync(new URL('../modules/rolls/roll-test-case/test-Resistance.js', import.meta.url), 'utf8')
    expect(resistanceCase).toMatch(/typeSub === "toxinDamage" && prevData\?\.damage\?\.toxin\?\.type === "airEngulf" && prevData\?\.chatCard\?\.buttons\?\.resistanceCard\) SR5_RollMessage\.updateChatButtonHelper\(cardData\.previousMessage\.messageId, "resistanceCard"\)/)
  })

  // Victoire's review, remark 3: the release card had a button stored under the key "undefined"
  it('gives the release card an end label under a real key', () => {
    const defenseResult = readFileSync(new URL('../modules/rolls/roll-test-case/test-DefenseResult.js', import.meta.url), 'utf8')
    const block = defenseResult.slice(defenseResult.indexOf('case "engulfResistance":'))
    expect(block.slice(0, block.indexOf('break'))).toMatch(/key = "actionEnd"/)
  })

  it('keeps the first phase of an earth, water or fire engulf when its damage is applied', () => {
    const block = message.slice(message.indexOf('switch (buttonToUpdate) {'))
    expect(block.slice(0, 600)).toMatch(/isContinuous && messageData\.test\?\.typeSub !== "continuousDamage"\) await SR5_ActorHelper\.keepEngulfFirstPhase\(messageData\)/)
  })
})

const {
  withEngulfSource, engulfSource, withSpiritSummoner, spiritSummoner, summonersFromActors, emptyLedger
} = await import('../modules/system/spirit-ledger.js')

describe('engulf and summoners in the spirit ledger', () => {

  it('keeps the attack card for a victim, and forgets it when she breaks free', () => {
    let ledger = withEngulfSource(emptyLedger(), 'v1', 'att1')
    expect(engulfSource(ledger, 'v1')).toBe('att1')
    expect(engulfSource(ledger, 'v2')).toBeNull()
    ledger = withEngulfSource(ledger, 'v1', null)
    expect(engulfSource(ledger, 'v1')).toBeNull()
  })

  it('keeps the summoner of a spirit', () => {
    expect(spiritSummoner(withSpiritSummoner(emptyLedger(), 's1', 'pc1'), 's1')).toBe('pc1')
    expect(spiritSummoner(emptyLedger(), 's1')).toBeNull()
  })

  it('takes over the summoners of old spirits only when the summoner holds the spirit item', () => {
    const pc = {
      items: new Map([['it1', {
        type: 'itemSpirit'
      }]])
    }
    const npc = {
      items: new Map([['x', {
        type: 'itemWeapon'
      }]])
    }
    const actors = [
      {
        type: 'actorSpirit', id: 'good', system: {
          creatorId: 'pc', creatorItemId: 'it1'
        }
      },
      {
        type: 'actorSpirit', id: 'forged', system: {
          creatorId: 'npc', creatorItemId: 'x'
        }
      },
    ]
    const ledger = summonersFromActors(emptyLedger(), actors, id => ({
      pc, npc
    })[id])
    expect(spiritSummoner(ledger, 'good')).toBe('pc')
    expect(spiritSummoner(ledger, 'forged')).toBeNull()
    expect(ledger.summonersMigrated).toBe(true)
  })
})
