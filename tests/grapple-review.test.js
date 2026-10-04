import {
  describe, it, expect
} from 'vitest'

import {
  deleteGrappleEffectOnce, isGrappleKeeper, tokenRemovalEndsHold, refusalRecipient
} from '../modules/rolls/roll-helpers/grapple-rules.js'

//Two fighters whose grappling effects behave like Foundry's: deleting one that is gone throws,
//and deleting one half runs the deleteActiveEffect hook, which deletes the other half
function pair(hook){
  const actors = {
  }
  for (const id of ["a", "b"]){
    const effects = []
    const effect = {
      id: `fx-${id}`, uuid: `Actor.${id}.ActiveEffect.fx-${id}`,
      flags: {
        sr5: {
          grapple: {
            role: id === "a" ? "holder" : "held", partner: id === "a" ? "b" : "a"
          }
        }
      },
      deletes: 0,
      async delete(){
        //The request goes to the server: the effect stays in the client's collection until it answers
        await new Promise(r => setTimeout(r, 0))
        if (!effects.includes(effect)) throw new Error(`ActiveEffect ${effect.id} does not exist`)
        effect.deletes++
        effects.splice(effects.indexOf(effect), 1)
        //The hook does not wait for anyone: it starts while the caller goes on
        hook(effect, actors)
      },
    }
    effects.push(effect)
    actors[id] = {
      effects, effect
    }
  }
  return actors
}

describe('releasing both fighters at the end of the combat (review 2)', () => {
  it('deletes each half once, with the hook running alongside the loop', async () => {
    const pending = new Set()
    const hookRuns = []
    const actors = pair((effect, all) => hookRuns.push(deleteGrappleEffectOnce(all[effect.flags.sr5.grapple.partner], pending)))
    for (const actor of [actors.a, actors.b]) await deleteGrappleEffectOnce(actor, pending)
    await Promise.all(hookRuns)
    expect(actors.a.effect.deletes).toBe(1)
    expect(actors.b.effect.deletes).toBe(1)
  })

  it('counter-proof: the former loop deleted the partner a second time and threw', async () => {
    const hookRuns = []
    const actors = pair((effect, all) => {
      const other = all[effect.flags.sr5.grapple.partner].effects.find(e => e.flags?.sr5?.grapple)
      if (other) hookRuns.push(other.delete())
    })
    let error = null
    for (const actor of [actors.a, actors.b]){
      const grapple = actor.effects.find(e => e.flags?.sr5?.grapple)
      if (grapple) await grapple.delete().catch(e => error = e)
    }
    await Promise.allSettled(hookRuns).then(r => r.forEach(x => {
      if (x.status === "rejected") error = x.reason
    }))
    expect(error?.message).toMatch(/does not exist/)
  })
})

describe('the half of one hold only', () => {
  it('leaves a newer hold alone (a clinch replaced by a subdue)', async () => {
    const newer = {
      flags: {
        sr5: {
          grapple: {
            holdId: "new"
          }
        }
      },
      deletes: 0,
      async delete(){
        this.deletes++
      }
    }
    expect(await deleteGrappleEffectOnce({
      effects: [newer]
    }, new Set(), "old")).toBe(false)
    expect(newer.deletes).toBe(0)
    expect(await deleteGrappleEffectOnce({
      effects: [newer]
    }, new Set(), "new")).toBe(true)
  })
})

describe('one client keeps the grappling hooks (review 2)', () => {
  it('is the active GM, and only that one', () => {
    expect(isGrappleKeeper({
      activeGM: {
        isSelf: true
      }
    })).toBe(true)
    expect(isGrappleKeeper({
      activeGM: {
        isSelf: false
      }
    })).toBe(false)
    expect(isGrappleKeeper({
      activeGM: null
    })).toBe(false)
  })
})

describe('a linked actor with tokens on two scenes (review 3)', () => {
  it('keeps the hold while another token of the actor remains', () => {
    expect(tokenRemovalEndsHold(true, 1)).toBe(false)
  })
  it('ends it with the last token, and always for an unlinked token', () => {
    expect(tokenRemovalEndsHold(true, 0)).toBe(true)
    expect(tokenRemovalEndsHold(false, 3)).toBe(true)
  })
})

describe('the warning of a refused hold (review 4)', () => {
  it('goes back to the player who clicked', () => {
    expect(refusalRecipient("player", "gm")).toBe("player")
  })
  it('stays on the client that clicked itself', () => {
    expect(refusalRecipient("gm", "gm")).toBe(null)
    expect(refusalRecipient(undefined, "gm")).toBe(null)
  })
})
