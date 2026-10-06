// The mentor spirits of Forbidden Arcana p. 90-95, as itemMentorSpirit data (test data only: the system
// ships no compendium). Bonuses the system cannot read (free adept powers, knowledge ranks, Karma
// discounts, a die rerolled once a day) stay in the text. Where the book lets the player choose (Oak,
// Scripture, Tohu wa-Bohu), the first option is used.

const v = (target, value, mentorPath, extra = {
}) => ({
  category: "skills", target, type: "value", value, multiplier: 1, mentorPath, ...extra
})
const when = text => ({
  situational: true, when: text
})
const skill = (key, value, path, extra) => v(`system.skills.${key}.test`, value, path, extra)
const cast = (category, value, path, extra) => v(`system.skills.spellcasting.spellCategory.${category}`, value, path, extra)
// "spells, preparations and rituals" of a category
const sprCategory = (category, value, path, extra) => ["spellcasting", "alchemy", "ritualSpellcasting"]
  .map(s => v(`system.skills.${s}.spellCategory.${category}`, value, path, extra))
const summon = (type, value, path) => v(`system.skills.summoning.spiritType.${type}`, value, path)

export const ARC_MENTORS = [
  {
    name: "Arcane", page: 90, resistThreshold: 0, effects: [
      cast("detection", 1, "magician"),
      cast("detection", 1, "magician", when("Clairvoyance, Clairaudience")),
    ]
  },
  {
    name: "Cerf", page: 90, resistThreshold: 3, effects: [skill("blades", 2, "all"), summon("earth", 2, "magician")]
  },
  {
    name: "Chêne", page: 90, resistThreshold: 0, effects: [
      v("system.resistances.physicalDamage", 1, "all"), summon("plant", 2, "magician"),
    ]
  },
  {
    name: "Colombe", page: 90, resistThreshold: 0, effects: [
      skill("negotiation", 2, "all"), cast("health", 1, "magician"), summon("air", 1, "magician"),
      cast("combat", -2, "drawback"),
    ]
  },
  {
    name: "Entité planaire", page: 91, resistThreshold: 0, effects: [
      v("system.rollTests.willpower", -2, "drawback"),
    ]
  },
  {
    name: "Grand Veneur", page: 91, resistThreshold: 0, effects: [
      skill("tracking", 2, "all"), cast("detection", 2, "magician"), cast("illusion", 2, "magician"),
    ]
  },
  {
    name: "Guerre", page: 91, resistThreshold: 4, effects: sprCategory("combat", 2, "magician")
  },
  {
    name: "Homme vert", page: 92, resistThreshold: 3, effects: [skill("negotiation", 2, "all"), summon("plant", 2, "magician")]
  },
  {
    name: "Lune", page: 92, resistThreshold: 4, effects: [
      skill("negotiation", 2, "all"),
      ...sprCategory("illusion", 2, "magician"),
      ...sprCategory("manipulation", 2, "magician", when("transformation")),
    ]
  },
  {
    name: "Mère Nature", page: 92, resistThreshold: 0, effects: [
      ...["navigation", "survival", "tracking"].map(k => skill(k, 1, "all", when("hors zone urbaine"))),
      ...sprCategory("health", 2, "magician"),
    ]
  },
  {
    name: "Mort", page: 92, resistThreshold: 3, effects: [
      cast("combat", 2, "magician", when("Toucher mortel, Boule mana, Éclair mana, Supprimer, Carnage, Tuerie")),
    ]
  },
  {
    name: "Roi des Ténèbres", page: 93, resistThreshold: 0, effects: [
      skill("intimidation", 2, "all"),
      v("system.skills.ritualSpellcasting.test", 2, "magician", when("rituel contractuel")),
      v("system.resistances.physicalDamage", -1, "drawback"),
    ]
  },
  {
    name: "Saintes Écritures", page: 93, resistThreshold: 4, effects: [cast("health", 2, "magician")]
  },
  {
    name: "Soleil", page: 93, resistThreshold: 4, effects: [
      skill("perception", 2, "all", when("en extérieur, de jour")),
      ...["combat", "detection", "health", "illusion", "manipulation"]
        .map(c => cast(c, 2, "magician", when("sort basé sur le Soleil ou le Feu"))),
    ]
  },
  {
    name: "Tohu wa-Bohu", page: 93, resistThreshold: 0, effects: [skill("intimidation", 2, "all")]
  },
  {
    name: "Araignée (alt)", page: 94, resistThreshold: 4, effects: [
      ...["disguise", "palming", "sneaking"].map(k => skill(k, 2, "all")),
      ...sprCategory("manipulation", 2, "magician"),
    ]
  },
  {
    name: "Loup (alt)", page: 94, resistThreshold: 4, effects: [
      ...["sneaking", "perception", "survival", "tracking"].map(k => skill(k, 1, "all")),
      ...sprCategory("combat", 1, "magician"),
    ]
  },
  {
    name: "Rat (alt)", page: 95, resistThreshold: 4, effects: [
      ...["perception", "sneaking"].map(k => skill(k, 1, "all")),
      ...sprCategory("health", 1, "magician"),
    ]
  },
]
