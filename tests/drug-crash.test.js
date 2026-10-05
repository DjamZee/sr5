import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/config.js", () => ({
  SR5: {
    extendedIntervals: {
      hour: "SR5.Hours"
    }, drugs: {
      redMescaline: "SR5.RedMescaline"
    }
  }
}))
vi.mock("../modules/rolls/roll-prepare.js", () => ({
  SR5_PrepareRollTest: {
    getBaseRollData: () => ({
      damage: {
      }
    })
  }
}))

const {
  endDrugRise, startDrugCrash, resetDrugPhase
} = await import("../modules/entities/items/drug-crash.js")

describe("Remise à zéro d'une drogue par le MJ (correction d'une erreur)", () => {
  it("le MJ remet une drogue en descente à « pas prise », sans dommages ni message", async () => {
    game.user = {
      isGM: true
    }
    const owner = actor(), item = drug("crash", owner)
    expect(await resetDrugPhase(item)).toBe(true)
    expect(item.system).toMatchObject({
      phase: "", isActive: false, wirelessTurnedOn: false
    })
    expect(item.system.onUse).toEqual({
      duration: "", contrecoup: ""
    })
    expect(owner.takeDamage).not.toHaveBeenCalled()
    expect(owner.rollTest).not.toHaveBeenCalled()
    expect(ui.notifications.info).not.toHaveBeenCalled()
  })

  it("un joueur ne le peut pas, et une drogue pas prise n'est pas touchée", async () => {
    game.user = {
      isGM: false
    }
    const item = drug("rise")
    expect(await resetDrugPhase(item)).toBe(false)
    game.user = {
      isGM: true
    }
    const idle = drug("")
    expect(await resetDrugPhase(idle)).toBe(false)
    expect(item.update).not.toHaveBeenCalled()
    expect(idle.update).not.toHaveBeenCalled()
  })
})

beforeEach(() => {
  globalThis.game = {
    i18n: {
      localize: k => k, format: k => k
    }
  }
  globalThis.ui = {
    notifications: {
      info: vi.fn()
    }
  }
})

function actor() {
  return {
    name: "Kara", takeDamage: vi.fn(), rollTest: vi.fn()
  }
}

function drug(phase, owner = actor()) {
  const system = {
    phase, isActive: phase === "rise", wirelessTurnedOn: phase === "crash",
    onUse: {
      duration: "3 SR5.Hours", contrecoup: ""
    },
    handleShot: {
      name: "redMescaline", durationContrecoup: 4, durationContrecoupType: "hour",
      unresistedStunDamage: 2, resistedStunDamage: 3
    }
  }
  return {
    type: "itemDrug", system, parent: owner,
    toObject: () => ({
      system: structuredClone(system)
    }),
    update: vi.fn(async changes => Object.assign(system, changes.system))
  }
}

describe("Fin de la montée d'une drogue, sans fiche ouverte (CF p. 194)", () => {
  it("passe la drogue en descente, écrit l'objet, affiche la durée et inflige les dommages", async () => {
    const owner = actor(), item = drug("rise", owner)
    expect(await endDrugRise(item)).toBe(true)
    expect(item.update).toHaveBeenCalledOnce()
    expect(item.system).toMatchObject({
      phase: "crash", isActive: false, wirelessTurnedOn: true
    })
    expect(item.system.onUse).toEqual({
      duration: "", contrecoup: "4 SR5.Hours"
    })
    expect(ui.notifications.info).toHaveBeenCalledOnce()
    expect(owner.takeDamage.mock.calls[0][0].damage).toEqual({
      value: 2, type: "stun"
    })
    expect(owner.rollTest.mock.calls[0][2].damage).toEqual({
      value: 3, type: "stun", resistanceType: "physicalDamage"
    })
  })

  it("ne fait rien pour une drogue déjà en descente, pas prise, ou sans porteur", async () => {
    for (const item of [drug("crash"), drug(""), {
      ...drug("rise"), parent: null
    }]) {
      expect(await endDrugRise(item)).toBe(false)
      expect(item.update).not.toHaveBeenCalled()
    }
    expect(await endDrugRise({
      type: "itemGear", system: {
        phase: "rise"
      }
    })).toBe(false)
  })

  it("la fiche passe par le même chemin : les données sont changées en place", async () => {
    const owner = actor(), data = drug("rise", owner).system
    await startDrugCrash(data, owner)
    expect(data.phase).toBe("crash")
    expect(owner.takeDamage).toHaveBeenCalledOnce()
  })
})
