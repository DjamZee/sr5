import {
  describe, it, expect
} from 'vitest'
import {
  DESIGNED_ICE, ICE_DESIGN_DEFENSES, designActionOf, designSourceOf, designedBiofeedback, designedHit, designedMarks,
  iceDefenseType, iceDesignOf, iceTestSubType, parseIceBlock
} from '../modules/system/ice-design.js'
import {
  FIXED_MARKS, attackerMarks, markOutcome
} from '../modules/rolls/roll-helpers/socket-senders.js'

// The 20 IC of the book (SR5 p. 249-250, Kill Code p. 74), as config.js lists them
const BOOK_ICE = ["iceAcid", "iceBinder", "iceBlack", "iceBlaster", "iceBloodhound", "iceBlueGoo", "iceCatapult", "iceCrash",
  "iceFlicker", "iceJammer", "iceKiller", "iceMarker", "icePatrol", "iceProbe", "iceScramble", "iceShocker", "iceSparky",
  "iceSleuther", "iceTarBaby", "iceTrack"]

const ice = (deviceSubType, iceDesign = {
  defense: "", blocks: []
}) => ({
  deviceType: "ice", deviceSubType, iceDesign
})

describe("CI du livre, sans recette : rien ne change", () => {
  for (const type of BOOK_ICE) {
    it(`${type} garde son type, sa défense, ses marks et son biofeedback`, () => {
      const matrix = ice(type)
      expect(iceDesignOf(matrix)).toBeNull()
      expect(iceTestSubType(matrix)).toBe(type)
      expect(iceDefenseType(matrix)).toBe(type)
      expect(designedBiofeedback(matrix, "hotsim")).toBeNull()
      expect(designedMarks(matrix)).toBe(0)
      expect(attackerMarks(type, 3)).toBe(type in FIXED_MARKS ? FIXED_MARKS[type] : 3)
    })
  }

  it("une recette sans bloc valable est une CI du livre", () => {
    expect(iceDesignOf(ice("iceKiller", {
      defense: "iceAcid", blocks: ["inconnu", "reduce:magic"]
    }))).toBeNull()
    expect(iceTestSubType(ice("iceKiller", {
      defense: "iceAcid", blocks: []
    }))).toBe("iceKiller")
  })

  it("un appareil qui n'est pas une CI n'a pas de recette", () => {
    expect(iceDesignOf({
      deviceType: "host", iceDesign: {
        blocks: ["matrixDamage"]
      }
    })).toBeNull()
  })

  it("les marks d'une action du livre ne bougent pas", () => {
    expect(markOutcome({
      typeSub: "iceProbe", attackerHits: 4, defenderHits: 2, chosen: 3
    })).toEqual({
      winner: "attacker", marks: 1, watchdog: false
    })
    expect(markOutcome({
      typeSub: "hackOnTheFly", attackerHits: 4, defenderHits: 2, chosen: 2
    }).marks).toBe(2)
  })
})

describe("recette d'une CI compilée", () => {
  it("lit les blocs et leur variante, sans doublon", () => {
    const design = iceDesignOf(ice("iceAcid", {
      defense: "iceTarBaby", blocks: ["matrixDamage", "biofeedback:stun", "matrixDamage", "reduce:firewall", "marks:3"]
    }))
    expect(design.defense).toBe("iceTarBaby")
    expect(design.blocks).toEqual([{
      key: "matrixDamage", variant: null
    }, {
      key: "biofeedback", variant: "stun"
    }, {
      key: "reduce", variant: "firewall"
    }])
  })

  it("une défense hors des six paires du livre n'est pas prise", () => {
    expect(ICE_DESIGN_DEFENSES).toHaveLength(6)
    const matrix = ice("iceCrash", {
      defense: "iceBlack", blocks: ["matrixDamage"]
    })
    expect(iceDesignOf(matrix).defense).toBeNull()
    expect(iceDefenseType(matrix)).toBe("iceCrash")
  })

  it("ses cartes portent le sous-type des CI compilées, sa défense est celle de la recette", () => {
    const matrix = ice("iceAcid", {
      defense: "iceJammer", blocks: ["linkLock"]
    })
    expect(iceTestSubType(matrix)).toBe(DESIGNED_ICE)
    expect(iceDefenseType(matrix)).toBe("iceJammer")
  })

  it("rejette un bloc mal formé", () => {
    expect(parseIceBlock("crash:1")).toBeNull()
    expect(parseIceBlock("biofeedback")).toBeNull()
    expect(parseIceBlock("marks:2")).toEqual({
      key: "marks", variant: "2"
    })
  })
})

describe("biofeedback d'une CI compilée (SR5 p. 230, 250)", () => {
  const withBio = variant => ice("iceCrash", {
    defense: "iceCrash", blocks: ["matrixDamage", `biofeedback:${variant}`]
  })
  it("étourdissant (Blaster) ou physique (Noire), quel que soit le mode", () => {
    expect(designedBiofeedback(withBio("stun"), "hotsim")).toBe("stun")
    expect(designedBiofeedback(withBio("physical"), "coldsim")).toBe("physical")
  })
  it("selon le mode : physique en hot sim, étourdissant en cold sim", () => {
    expect(designedBiofeedback(withBio("mode"), "hotsim")).toBe("physical")
    expect(designedBiofeedback(withBio("mode"), "coldsim")).toBe("stun")
  })
})

describe("ce que pose le coup d'une CI compilée", () => {
  const blocks = list => list.map(parseIceBlock)

  it("dommages matriciels, verrou, marks", () => {
    const hit = designedHit({
      blocks: blocks(["matrixDamage", "linkLock", "marks:2"])
    })
    expect(hit).toMatchObject({
      matrixDamage: true, linkLock: true, marks: 2, effects: []
    })
  })

  it("pas de verrou sur une connexion déjà verrouillée, ni sur une IA hors appareil (DT p. 157)", () => {
    expect(designedHit({
      blocks: blocks(["linkLock"]), isLinkLocked: true
    }).linkLock).toBe(false)
    expect(designedHit({
      blocks: blocks(["linkLock"]), devicelessAI: true
    }).linkLock).toBe(false)
  })

  it("réduire un attribut : son effet tant qu'il est au-dessus de 0, des dommages ensuite (SR5 p. 249-250)", () => {
    expect(designedHit({
      blocks: blocks(["reduce:firewall", "reduce:sleaze"]), attributes: {
        firewall: 3, sleaze: 0
      }
    })).toMatchObject({
      effects: ["iceAcid"], takeMatrixDamage: true
    })
  })

  it("Crash à 1 mark, Brouilleuse à 3, Pisteuse à 2", () => {
    const list = blocks(["crash", "scramble", "track"])
    expect(designedHit({
      blocks: list, existingMark: 0
    }).effects).toEqual([])
    expect(designedHit({
      blocks: list, existingMark: 2
    }).effects).toEqual(["iceCrash", "iceTrack"])
    expect(designedHit({
      blocks: list, existingMark: 3
    }).effects).toEqual(["iceCrash", "iceScramble", "iceTrack"])
  })

  it("Clignoteuse : une mark et son effet ; Électrocuteuse ; Catapulte", () => {
    expect(designedHit({
      blocks: blocks(["flicker", "shocker", "catapult"])
    })).toMatchObject({
      marks: 1, shocker: true, catapult: true, effects: ["iceFlicker", "iceCatapult"]
    })
  })

  it("les marks relayées sont lues sur la recette, jamais sur la carte", () => {
    const matrix = ice("iceCrash", {
      defense: "iceCrash", blocks: ["marks:2"]
    })
    expect(designedMarks(matrix)).toBe(2)
    expect(markOutcome({
      typeSub: DESIGNED_ICE, attackerHits: 4, defenderHits: 1, chosen: 3, designed: designedMarks(matrix)
    }).marks).toBe(2)
    expect(markOutcome({
      typeSub: DESIGNED_ICE, attackerHits: 4, defenderHits: 1, chosen: 3, designed: 0
    })).toBeNull()
  })

  it("les boutons d'effet nomment la CI dont l'effet est repris", () => {
    expect(designSourceOf(designActionOf("iceBinder"))).toBe("iceBinder")
    expect(designSourceOf("iceDesign_iceBlack")).toBeNull()
    expect(designSourceOf("iceEffect")).toBeNull()
  })
})
