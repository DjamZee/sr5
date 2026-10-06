import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

const {
  isAgilityZero, syncAgilityZero, sweepAgilityZero, AGILITY_ZERO_STATUS
} = await import('../modules/system/agility-zero.js')

// Séance H, H8 (decision of DjamZ): Agility brought to 0 lays the "immobilized" status (Street Grimoire p. 116, Mana
// Bonds), taken off when it comes back; written by the active gamemaster only
const actor = (natural, augmented, statuses = []) => ({
  uuid: `Actor.${natural}${augmented}`,
  system: {
    attributes: {
      agility: {
        natural: {
          value: natural
        }, augmented: {
          value: augmented
        }
      }
    }
  },
  statuses: new Set(statuses),
  toggleStatusEffect: vi.fn(async () => {}),
})

describe("Agility 0 and the immobilized status (H8)", () => {
  beforeEach(() => {
    globalThis.game = {
      users: {
        activeGM: {
          isSelf: true
        }
      }
    }
  })
  afterEach(() => { delete globalThis.game })

  it("reads an Agility brought to 0 by the modifiers, not a blank sheet", () => {
    expect(isAgilityZero(actor(4, 0))).toBe(true)
    expect(isAgilityZero(actor(4, -1))).toBe(true)
    expect(isAgilityZero(actor(4, 1))).toBe(false)
    expect(isAgilityZero(actor(0, 0))).toBe(false)
    expect(isAgilityZero({
      system: {
      }
    })).toBe(false)
  })

  it("lays the status at Agility 0", async () => {
    const a = actor(4, 0)
    await syncAgilityZero(a)
    expect(a.toggleStatusEffect).toHaveBeenCalledWith(AGILITY_ZERO_STATUS, {
      active: true
    })
  })

  it("takes it off when Agility comes back", async () => {
    const a = actor(4, 2, [AGILITY_ZERO_STATUS])
    await syncAgilityZero(a)
    expect(a.toggleStatusEffect).toHaveBeenCalledWith(AGILITY_ZERO_STATUS, {
      active: false
    })
  })

  it("writes nothing when the status already matches: no update loop", async () => {
    const on = actor(4, 0, [AGILITY_ZERO_STATUS]), off = actor(4, 3)
    await syncAgilityZero(on)
    await syncAgilityZero(off)
    expect(on.toggleStatusEffect).not.toHaveBeenCalled()
    expect(off.toggleStatusEffect).not.toHaveBeenCalled()
  })

  it("is written by the active gamemaster alone, never by a player's client", async () => {
    game.users.activeGM.isSelf = false
    const a = actor(4, 0)
    await syncAgilityZero(a)
    expect(a.toggleStatusEffect).not.toHaveBeenCalled()
  })

  it("does not write twice while the first write is on its way", async () => {
    const a = actor(4, 0)
    await Promise.all([syncAgilityZero(a), syncAgilityZero(a)])
    expect(a.toggleStatusEffect).toHaveBeenCalledTimes(1)
  })

  // Clémence's review: an actor of an existing world is put in order at the load, by the active gamemaster
  it("the sweep at the load lays and takes off the status, and writes nothing for an actor in order", async () => {
    const down = actor(4, 0), back = actor(4, 3, [AGILITY_ZERO_STATUS]), fine = actor(4, 3)
    await sweepAgilityZero([down, back, fine])
    expect(down.toggleStatusEffect).toHaveBeenCalledWith(AGILITY_ZERO_STATUS, {
      active: true
    })
    expect(back.toggleStatusEffect).toHaveBeenCalledWith(AGILITY_ZERO_STATUS, {
      active: false
    })
    expect(fine.toggleStatusEffect).not.toHaveBeenCalled()
  })

  it("the sweep reads the world's actors and the unlinked tokens", async () => {
    const world = actor(4, 0), unlinked = actor(5, 0), linked = actor(6, 0)
    game.actors = [world]
    game.scenes = [{
      tokens: [{
        actorLink: false, actor: unlinked
      }, {
        actorLink: true, actor: linked
      }]
    }]
    await sweepAgilityZero()
    expect(world.toggleStatusEffect).toHaveBeenCalled()
    expect(unlinked.toggleStatusEffect).toHaveBeenCalled()
    expect(linked.toggleStatusEffect).not.toHaveBeenCalled()
  })

  it("no sweep on a client that is not the active gamemaster", async () => {
    game.users.activeGM.isSelf = false
    const a = actor(4, 0)
    await sweepAgilityZero([a])
    expect(a.toggleStatusEffect).not.toHaveBeenCalled()
  })
})
