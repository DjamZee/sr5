import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  INSECT_RACES, INSECT_CASTES, insectRaceOf, insectRacePowers, insectRaceOptions, isInsectCaste
} from "../modules/entities/items/insect-races.js"
import {
  SR5
} from "../modules/config.js"

const read = path => readFileSync(path, "utf8")

describe("Insect spirit races (Dark Terrors p. 22-34)", () => {
  it("only an insect caste takes a race", () => {
    expect(isInsectCaste("insectSoldier")).toBe(true)
    expect(isInsectCaste("fire")).toBe(false)
    expect(insectRaceOf("fire", "goliathBeetle")).toBeNull()
    expect(insectRaceOf("insectWorker", "")).toBeNull()
    expect(insectRaceOf("insectWorker", "unknown")).toBeNull()
  })

  it("every caste is an official spirit type", () => {
    for (const caste of INSECT_CASTES) expect(SR5.spiritTypes[caste]).toBeTruthy()
  })

  it("gives the damage resistance bonus of the book", () => {
    expect(insectRaceOf("insectSoldier", "subterraneanTermite").damageResistance).toBe(2)
    expect(insectRaceOf("insectWorker", "goliathBeetle").damageResistance).toBe(4)
  })

  it("takes Pestilence away from the dragonfly and gives it Dive Attack and Movement (p. 31)", () => {
    expect(insectRacePowers("insectScout", "dragonfly")).toEqual({
      added: ["diveAttack", "movement"], removed: ["pestilence"]
    })
    expect(insectRacePowers("fire", "dragonfly")).toEqual({
      added: [], removed: []
    })
  })

  it("grants only powers and skills the system knows", () => {
    for (const race of Object.values(INSECT_RACES)) {
      for (const key of [...(race.powers || []), ...(race.removed || [])]) expect(SR5.AllSpiritPowers[key] || key === "essenceLoss").toBeTruthy()
      for (const key of race.skills || []) expect(SR5.skills[key]).toBeTruthy()
    }
  })

  it("labels every race, and every note, in French and English", () => {
    const fr = JSON.parse(read("lang/fr.json")), en = JSON.parse(read("lang/en.json"))
    for (const [key, race] of Object.entries(INSECT_RACES)) {
      for (const lang of [fr, en]) {
        expect(lang[`SR5.InsectRace_${key}`]).toBeTruthy()
        if (race.note) expect(lang[`SR5.InsectRace_${key}_D`]).toBeTruthy()
      }
    }
    expect(insectRaceOptions(k => k).bee).toBe("SR5.InsectRace_bee (DTER p. 26)")
  })

  it("Dark Magic is a tradition (Dark Terrors p. 169)", () => {
    expect(SR5.traditionTypes.darkMagic).toBe("SR5.TraditionDarkMagic")
  })
})
