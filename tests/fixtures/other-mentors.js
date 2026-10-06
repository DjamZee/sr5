// The mentor spirits outside Forbidden Arcana (SR5 p. 324-327, Street Grimoire, Hard Targets, Howling
// Shadows, Better Than Bad), as itemMentorSpirit data (test data only: the system ships no compendium).
// Each mentor was read at its own printed page. Bonuses the system cannot read (free adept powers,
// qualities, extra services, Drain reduction, Magic loss, global dice penalties) stay in comments.
// Where the book lets the player choose at acquisition, the first option is used (noted on the line).
// "Spells, preparations and rituals" of a category also aim at alchemy and ritualSpellcasting: both
// skills carry a spellCategory field (modules/datamodels/actors/partial/skills.js, _spellCategorySchema).

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
const bind = (type, value, path) => v(`system.skills.binding.spiritType.${type}`, value, path)

const CW = ["charisma", "willpower"]

export const OTHER_MENTORS = [
  // ---- SR5 core rulebook p. 324-327 (16)
  {
    // Adept: Combat Sense 1 (free power). Drawback: Allergy (pollutants, mild), no Karma.
    name: "Aigle", book: "SR5", page: 324, resistThreshold: 0, resistAttributes: CW, effects: [
      skill("perception", 2, "all"), summon("air", 2, "magician"),
    ]
  },
  {
    // All: Gymnastics OR Sneaking, chosen at acquisition -> Gymnastics. Adept: Light Body 2.
    name: "Chatte", book: "SR5", page: 324, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("gymnastics", 2, "all"), ...sprCategory("illusion", 2, "magician"),
    ]
  },
  {
    // Adept: two Enhanced Senses powers.
    name: "Chien", book: "SR5", page: 324, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("tracking", 2, "all"), ...sprCategory("detection", 2, "magician"),
    ]
  },
  {
    // Adept: Traceless Walk + Voice Control 1.
    name: "Corbeau", book: "SR5", page: 325, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("con", 2, "all"), ...sprCategory("manipulation", 2, "magician"),
    ]
  },
  {
    // Adept: Attribute Boost (Agility) 2.
    name: "Loup", book: "SR5", page: 325, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("tracking", 2, "all"), ...sprCategory("combat", 2, "magician"),
    ]
  },
  {
    // Adept: Improved Ability 1 on an Athletics skill.
    name: "Mer", book: "SR5", page: 325, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("swimming", 2, "all"), summon("water", 2, "magician"),
    ]
  },
  {
    // Adept: Mystic Armor 1.
    name: "Montagne", book: "SR5", page: 325, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("survival", 2, "all"), skill("counterspelling", 2, "magician"),
      skill("ritualSpellcasting", 2, "magician", when("rituel ancré")),
    ]
  },
  {
    // Adept: Critical Strike 1.
    name: "Oiseau-tonnerre", book: "SR5", page: 325, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("intimidation", 2, "all"), summon("air", 2, "magician"),
    ]
  },
  {
    // All: damage resistance except Drain (the text also covers Stun: physicalDamage may be too narrow).
    // Adept: Rapid Healing 1. No written threshold: 3 hits avoid the rage.
    name: "Ours", book: "SR5", page: 326, resistThreshold: 3, resistAttributes: CW, effects: [
      v("system.resistances.physicalDamage", 2, "all"), ...sprCategory("health", 2, "magician"),
    ]
  },
  {
    // All: Artisan OR Alchemy, chosen at acquisition -> Artisan. Adept: Improved Ability 1 (non-combat).
    name: "Porteur du feu", book: "SR5", page: 326, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("artisan", 2, "all"), ...sprCategory("manipulation", 2, "magician"),
    ]
  },
  {
    // Magician: reagents of every tradition (text). Adept: Natural Immunity 2.
    name: "Rat", book: "SR5", page: 326, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("sneaking", 2, "all"), skill("alchemy", 2, "magician", when("récolte de réactifs")),
    ]
  },
  {
    // Adept: Killing Hands.
    name: "Requin", book: "SR5", page: 326, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("unarmedCombat", 2, "all"), ...sprCategory("combat", 2, "magician"),
    ]
  },
  {
    // All: Instruction OR Leadership -> Instruction. Adept: Improved Ability 1 (combat).
    // Drawback: -1 die to all actions when dishonoured (global penalty, text).
    name: "Sage guerrière", book: "SR5", page: 327, resistThreshold: 0, resistAttributes: CW, effects: [
      skill("instruction", 2, "all"), ...sprCategory("combat", 2, "magician"),
    ]
  },
  {
    // Adept: Improved Ability 1 (Acting or Influence).
    name: "Séducteur", book: "SR5", page: 327, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("con", 2, "all"), ...sprCategory("illusion", 2, "magician"),
    ]
  },
  {
    // Adept: Body Control 2.
    name: "Serpent", book: "SR5", page: 327, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("arcana", 2, "all"), ...sprCategory("detection", 2, "magician"),
    ]
  },
  {
    // All: a social skill of choice -> Con (first of the list). Adept: Improved Accuracy 1 + Combat Sense 1.
    // Drawback: -1 die to all actions while a promise is broken (text).
    name: "Tueur de dragons", book: "SR5", page: 327, resistThreshold: 0, resistAttributes: CW, effects: [
      skill("con", 2, "all"), ...sprCategory("combat", 2, "magician"),
    ]
  },

  // ---- Street Grimoire (8)
  {
    // Adept: Enhanced Potential on two limits.
    name: "Chaos", book: "GRI", page: 200, resistThreshold: 3, resistAttributes: ["willpower", "intuition"], effects: [
      skill("con", 2, "all"), ...sprCategory("illusion", 2, "magician"),
    ]
  },
  {
    // Adept: Enhanced Perception 2.
    name: "Conciliateur", book: "GRI", page: 200, resistThreshold: 3, resistAttributes: ["charisma", "intuition"], effects: [
      skill("negotiation", 2, "all"), ...sprCategory("detection", 2, "magician"),
    ]
  },
  {
    // All: +2 to Composure tests -- composure is not an attribute nor a known key: left in the text.
    // Adept: Mystic Armor 2 / Pain Resistance 2 / one of each, chosen at acquisition.
    name: "Fureur", book: "GRI", page: 200, resistThreshold: 3, resistAttributes: CW, effects: [
      ...sprCategory("combat", 2, "magician", when("sort de type Physique")),
    ]
  },
  {
    // Adept: Astral Perception. Divination imposed as first metamagic (text).
    name: "Oracle", book: "GRI", page: 200, resistThreshold: 3, resistAttributes: ["willpower", "intuition"], effects: [
      skill("arcana", 2, "all"), ...sprCategory("detection", 2, "magician"),
    ]
  },
  {
    // Toxic. All: Demolitions OR a combat skill -> Demolitions. Adept: Killing Hands.
    name: "Fatalité", book: "GRI", page: 86, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("demolitions", 2, "all"), ...sprCategory("combat", 2, "magician"),
    ]
  },
  {
    // Toxic. All: a physical skill of choice (no list order in the book: left in the text).
    // Adept: Attribute Boost 2. Drawback: -1 die while a rival surpasses him (text).
    name: "Mutation", book: "GRI", page: 86, resistThreshold: 0, resistAttributes: CW, effects: [
      ...sprCategory("health", 2, "magician"),
    ]
  },
  {
    // Toxic. All: +2 to resist pathogens and toxins (no such resistance key: text). Adept: Pestilent Breath.
    name: "Pestilence", book: "GRI", page: 86, resistThreshold: 3, resistAttributes: CW, effects: [
      summon("plague", 2, "magician"), bind("plague", 2, "magician"),
    ]
  },
  {
    // Toxic. Magician: one of Noxious / Barren / Sludge -> Noxious. Adept: Toxic Strike.
    name: "Pollution", book: "GRI", page: 86, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("chemistry", 2, "all", when("lié à des polluants")),
      summon("noxious", 2, "magician"), bind("noxious", 2, "magician"),
    ]
  },

  // ---- Hard Targets p. 138-139 (4)
  {
    // Adept: Iron Will 1. Drawback: unquantified penalty under a teammate's Leadership (text).
    name: "Adversaire", book: "HT", page: 138, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("demolitions", 2, "all"), skill("counterspelling", 2, "magician"), skill("disenchanting", 2, "magician"),
    ]
  },
  {
    // Also in Howling Shadows p. 46 (same mentor, kept once). Magician: water OR man spirits -> water.
    // Adept: Unbalancing Strike.
    name: "Alligator", book: "HT", page: 138, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("intimidation", 2, "all"), summon("water", 2, "magician"),
    ]
  },
  {
    // Magician: +1 to summon any spirit. Adept: Motion Sense. Drawback: penalties per week (text).
    name: "Chauve-souris", book: "HT", page: 138, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("navigation", 2, "all"), skill("summoning", 1, "magician"),
    ]
  },
  {
    // Adept: Suspension 2. Drawback: -1 to Magic tests (text).
    name: "Singe", book: "HT", page: 139, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("gymnastics", 2, "all", when("escalade")), ...sprCategory("manipulation", 2, "magician"),
    ]
  },

  // ---- Howling Shadows p. 47-53 (7, Alligator counted under Hard Targets)
  {
    // All: Assensing OR Judge Intentions -> Assensing (judgeIntentions is not an attribute: not used).
    // Adept: Keen Senses 2.
    name: "Girafe", book: "HS", page: 47, resistThreshold: 0, resistAttributes: CW, effects: [
      skill("assensing", 2, "all"), summon("air", 2, "magician"), skill("etiquette", -2, "drawback"),
    ]
  },
  {
    // All: Home Ground quality. Magician: +1 service per summoning. Adept: Rooting 2. Nothing readable.
    name: "Sanglier", book: "HS", page: 48, resistThreshold: 3, resistAttributes: CW, effects: []
  },
  {
    // All: Artisan OR Watercraft -> Artisan. Adept: Elasticity 2.
    name: "Dauphin", book: "HS", page: 49, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("artisan", 2, "all"), ...sprCategory("health", 2, "magician"),
    ]
  },
  {
    // All: Swimming OR Watercraft -> Swimming. Adept: Iron Lungs 2. Drawback: loses 1 Magic (text).
    name: "Baleine", book: "HS", page: 50, resistThreshold: 0, resistAttributes: CW, effects: [
      skill("swimming", 2, "all"), summon("water", 2, "magician"),
    ]
  },
  {
    // Magician: casting only (no preparations nor rituals). Adept: Suspension 2.
    // Drawback: -1 to Magic tests in the open (text).
    name: "Araignée", book: "HS", page: 51, resistThreshold: 0, resistAttributes: CW, effects: [
      skill("computer", 2, "all"), cast("illusion", 2, "magician"),
    ]
  },
  {
    // Adept: Enhanced Senses 2.
    name: "Raton-laveur", book: "HS", page: 53, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("palming", 2, "all"), ...sprCategory("manipulation", 2, "magician"),
    ]
  },
  {
    // All: Running OR Ground Craft -> Running. Magician: Drain -1 on rushed summoning (text).
    // Adept: Movement as a metamagic (text).
    name: "Cheval", book: "HS", page: 53, resistThreshold: 0, resistAttributes: CW, effects: [
      skill("running", 2, "all"),
    ]
  },

  // ---- Better Than Bad p. 125 (1)
  {
    // Adept: access to Empathic Healing.
    name: "Guanyin", book: "BTB", page: 125, resistThreshold: 3, resistAttributes: CW, effects: [
      skill("firstAid", 2, "all"), ...sprCategory("health", 2, "magician"),
    ]
  },
]
