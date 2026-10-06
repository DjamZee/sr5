import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/config.js", () => ({
  SR5: {
    extendedIntervals: {
      hour: "SR5.Hours"
    }, drugs: {
      nitro: "SR5.Nitro", hurlg: "SR5.Hurlg"
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

//The damage comes from the drug key (drug-damage.js): Nitro, 9S unresisted at the crash (SR5 p. 414). The crash duration
//is set here to see both
function drug(phase, owner = actor(), key = "nitro") {
  const system = {
    phase, isActive: phase === "rise", wirelessTurnedOn: phase === "crash",
    systemEffects: {
      0: {
        category: "drug", value: key
      }
    },
    onUse: {
      duration: "3 SR5.Hours", contrecoup: ""
    },
    handleShot: {
      name: key, durationContrecoup: 4, durationContrecoupType: "hour",
    }
  }
  return {
    id: "drug1", type: "itemDrug", system, parent: owner,
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
      value: 9, type: "stun"
    })
    expect(owner.rollTest).not.toHaveBeenCalled()
  })

  it("le hurlg (CF p. 187) : un jet de Constitution seule, refait depuis la drogue de la fiche", async () => {
    const owner = actor(), item = drug("rise", owner, "hurlg")
    expect(await endDrugRise(item)).toBe(true)
    expect(owner.takeDamage).not.toHaveBeenCalled()
    expect(owner.rollTest.mock.calls[0][0]).toBe("resistanceCard")
    expect(owner.rollTest.mock.calls[0][2].damage).toEqual({
      value: 9, type: "stun", resistanceType: "drugDamage", drug: {
        itemId: "drug1", phase: "crash", interaction: false
      }
    })
  })

  it("le laés, la Devineresse et le slab n'ont plus de dommages au contrecoup (ils arrivent à la prise)", async () => {
    for (const key of ["laes", "leal", "soothsayer", "slab"]) {
      const owner = actor()
      await endDrugRise(drug("rise", owner, key))
      expect(owner.takeDamage).not.toHaveBeenCalled()
      expect(owner.rollTest).not.toHaveBeenCalled()
    }
  })

  it("une valeur forgée dans la dose ne change rien : seule la clé compte", async () => {
    const owner = actor(), item = drug("rise", owner)
    item.system.handleShot.unresistedStunDamage = 1
    item.system.handleShot.resistedStunDamage = 1
    await endDrugRise(item)
    expect(owner.takeDamage.mock.calls[0][0].damage.value).toBe(9)
    expect(owner.rollTest).not.toHaveBeenCalled()
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
