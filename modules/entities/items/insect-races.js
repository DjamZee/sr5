// Insect spirit races (Dark Terrors p. 22-34): pure data and helpers, no Foundry dependency.
// A race is "based on the primary insect spirit types of Street Grimoire p. 98, the elements to add or change
// being listed in the Game information of each entry" (p. 24): it rides on top of the caste (worker, soldier…).
// Only what the book gives as a rule is listed: powers granted or taken away, skills at Force, a damage
// resistance bonus. Powers the creature powers compendium has no key for (Wall Walking, Empathy), weaknesses and
// the narrative rules are shown as a note on the sheet, for the gamemaster.

export const INSECT_CASTES = ["insectCaretaker", "insectNymph", "insectQueen", "insectScout", "insectSoldier", "insectWorker"]

// key: {page, powers: spirit power keys granted, removed: spirit power keys taken away, skills: skill keys at
// Force, damageResistance: dice on damage resistance tests, note: true when the sheet shows a note}
export const INSECT_RACES = {
  // Ants (p. 24)
  fireAnt: {
    page: 24, note: true
  },
  leafcutterAnt: {
    page: 24, note: true
  },
  // Locusts (p. 24-25)
  desertLocust: {
    page: 24, powers: ["immunity"], note: true
  },
  moleCricket: {
    page: 25, skills: ["flight", "swimming"], note: true
  },
  // Termites (p. 26)
  subterraneanTermite: {
    page: 26, damageResistance: 2, note: true
  },
  // Wasps (p. 26)
  killerWasp: {
    page: 26, note: true
  },
  bee: {
    page: 26
  },
  // Beetles (p. 27)
  goliathBeetle: {
    page: 27, damageResistance: 4
  },
  waterBeetle: {
    page: 27, skills: ["swimming"], note: true
  },
  // Centipedes (p. 27-28): "every centipede spirit has the Movement power, on itself only"
  centipede: {
    page: 27, powers: ["movement"], note: true
  },
  houseCentipede: {
    // Climbing is part of Gymnastics in SR5 (p. 135)
    page: 28, powers: ["movement"], skills: ["gymnastics"], note: true
  },
  tropicalCentipede: {
    page: 28, powers: ["movement", "venom"], note: true
  },
  // Cicadas (p. 28)
  centennialCicada: {
    page: 28, note: true
  },
  // Primordial spiders (p. 28-30): "all primordial spiders have the Binding power"
  primordialSpider: {
    page: 28, powers: ["binding"], note: true
  },
  blackTrapdoorSpider: {
    page: 29, powers: ["binding"], note: true
  },
  blackWidow: {
    page: 30, powers: ["binding", "venom"], note: true
  },
  // Fireflies (p. 30)
  explosiveFirefly: {
    page: 30, powers: ["innateSpell"], note: true
  },
  // Flies (p. 30-31)
  botfly: {
    page: 30, note: true
  },
  dragonfly: {
    page: 31, powers: ["diveAttack", "movement"], removed: ["pestilence"]
  },
  // Mantids (p. 31-32)
  mimicMantis: {
    page: 31, powers: ["auraMasking"], skills: ["impersonation"]
  },
  orchidMantis: {
    page: 32, note: true
  },
  // Mosquitoes (p. 32)
  vampireMosquito: {
    page: 32, powers: ["essenceLoss"]
  },
  tickFlea: {
    page: 32, powers: ["pestilence"], note: true
  },
  // Moths (p. 33)
  moth: {
    page: 33, skills: ["flight"]
  },
  deathsHeadMoth: {
    page: 33, skills: ["flight", "impersonation"], powers: ["auraMasking"]
  },
  cryptidMoth: {
    page: 33, skills: ["flight"], powers: ["innateSpell"], note: true
  },
  // Cockroaches (p. 33-34)
  caveCockroach: {
    page: 33, note: true
  },
  silverfish: {
    page: 34, note: true
  },
}

// The races for a select, by their localized name with their page (Dark Terrors); localize: game.i18n.localize
export function insectRaceOptions(localize = key => game.i18n.localize(key)){
  const options = {
  }
  for (const [key, race] of Object.entries(INSECT_RACES)) options[key] = `${localize(`SR5.InsectRace_${key}`)} (DTER p. ${race.page})`
  return options
}

export function isInsectCaste(type){
  return INSECT_CASTES.includes(type)
}

// The race of a spirit, only when its (base) type is an insect caste
export function insectRaceOf(baseType, race){
  if (!race || !isInsectCaste(baseType)) return null
  return INSECT_RACES[race] || null
}

// Spirit power keys to give and to take away when a spirit of that caste is of that race
export function insectRacePowers(baseType, race){
  const entry = insectRaceOf(baseType, race)
  return {
    added: [...(entry?.powers || [])],
    removed: [...(entry?.removed || [])],
  }
}
