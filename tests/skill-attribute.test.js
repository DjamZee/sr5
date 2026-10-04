import {
  describe, it, expect
} from 'vitest'

import {
  prepareSkillAttribute, skillAttributeChoices, swapLinkedAttribute, selectedSkillAttribute, skillAttributeFlagKey,
  syncBackgroundCount, backgroundCountApplies, setDialogWindowTitle, forgetKnowledgeAttribute
} from '../modules/rolls/roll-helpers/skillAttribute.js'

// Grimoire des Ombres p. 30: the background count follows the attribute in use
describe('background count', () => {
  const penalty = {
    value: -3, modifiers: [{
      source: "Champ magique de la scène", type: "toxic", value: -3
    }]
  }
  const bonus = {
    value: 2, modifiers: [{
      source: "Champ magique de la scène", type: "hermetic", value: 2
    }]
  }
  const rollData = (dice = [], limit = {
  }) => ({
    dicePool: {
      modifiers: dice
    }, limit: {
      modifiers: limit
    }
  })

  it('applies to Magic, and always to astral combat and assensing', () => {
    expect(backgroundCountApplies("binding", "magic")).toBe(true)
    expect(backgroundCountApplies("binding", "charisma")).toBe(false)
    expect(backgroundCountApplies("assensing", "logic")).toBe(true)
  })

  it('adds the penalty to the dice when Magic is picked', () => {
    let r = syncBackgroundCount(rollData([{
      type: "wounds", label: "Blessures", value: -1
    }]), penalty, true)
    expect(r.dicePool.modifiers.map(m => m.value)).toEqual([-1, -3])
  })

  it('removes the penalty when Magic gives way to another attribute, and keeps the rest', () => {
    let r = syncBackgroundCount(rollData([{
      type: "wounds", label: "Blessures", value: -1
    }, {
      type: "toxic", label: "Champ magique de la scène", value: -3
    }]), penalty, false)
    expect(r.dicePool.modifiers).toEqual([{
      type: "wounds", label: "Blessures", value: -1
    }])
  })

  it('moves an aligned bonus on the limit in and out, without counting it twice', () => {
    let r = syncBackgroundCount(rollData(), bonus, true)
    r = syncBackgroundCount(r, bonus, true)
    expect(r.limit.modifiers).toEqual({
      hermetic: {
        label: "Champ magique de la scène", value: 2
      }
    })
    expect(syncBackgroundCount(r, bonus, false).limit.modifiers).toEqual({
    })
  })
})

describe('setDialogWindowTitle', () => {
  it('writes the pair in use in the window title', () => {
    let title = {
      textContent: "Test de compétence : Gymnastique + Agilité"
    }
    let element = {
      closest: () => ({
        querySelector: () => title
      })
    }
    expect(setDialogWindowTitle(element, "Test de compétence : Gymnastique + Force")).toBe(true)
    expect(title.textContent).toBe("Test de compétence : Gymnastique + Force")
  })
})

describe('forgetKnowledgeAttribute', () => {
  const actor = flags => ({
    unset: [],
    getFlag: () => flags,
    async unsetFlag(scope, key){
      this.unset.push(`${scope}.${key}`)
    },
  })

  it('erases the kept attribute of a deleted knowledge skill', async () => {
    let parent = actor({
      "knowledge-abc": "intuition", gymnastics: "strength"
    })
    expect(await forgetKnowledgeAttribute({
      id: "abc", parent
    })).toBe(true)
    expect(parent.unset).toEqual(["sr5.skillAttributes.knowledge-abc"])
  })

  it('writes nothing when the skill kept no attribute', async () => {
    let parent = actor({
      gymnastics: "strength"
    })
    expect(await forgetKnowledgeAttribute({
      id: "abc", parent
    })).toBe(false)
    expect(parent.unset).toEqual([])
  })
})

// SR5 p. 130: the attribute paired with a skill is chosen at roll time; p. 137: Gymnastics + Strength to climb
const labels = {
  body: "Body", agility: "Agility", reaction: "Reaction", strength: "Strength", willpower: "Willpower",
  logic: "Logic", intuition: "Intuition", charisma: "Charisma", edge: "Edge", magic: "Magic", resonance: "Resonance", depth: "Depth",
}
const attr = v => ({
  augmented: {
    value: v
  }
})
const actorData = {
  attributes: {
    body: attr(3), agility: attr(5), reaction: attr(4), strength: attr(2), willpower: attr(3), logic: attr(4), intuition: attr(6), charisma: attr(1),
  },
  specialAttributes: {
    edge: attr(3), magic: attr(0), resonance: attr(4),
  },
}
const localize = k => k

function gymnastics(composition){
  return {
    dicePool: {
      base: composition.reduce((t, m) => t + m.value, 0), composition
    },
    test: {
      title: "Skill test: Gymnastics + Agility"
    },
  }
}
const options = {
  flagKey: "gymnastics", linked: "agility", titleBase: "Skill test: Gymnastics", alwaysInTitle: true, labels, localize
}

describe('skillAttributeChoices', () => {
  it('offers the eight attributes and the special ones the actor has, never Edge', () => {
    let choices = skillAttributeChoices(actorData, labels)
    expect(Object.keys(choices)).toEqual(["body", "agility", "reaction", "strength", "willpower", "logic", "intuition", "charisma", "resonance"])
  })
})

describe('swapLinkedAttribute', () => {
  it('keeps the rating, the group and the -1 for defaulting (SR5 p. 55)', () => {
    let composition = [
      {
        source: "Agility", type: "linkedAttribute", value: 5
      },
      {
        source: "Defaulting", type: "skillRating", value: -1
      },
    ]
    let swapped = swapLinkedAttribute(composition, "Strength", 2)
    expect(swapped.reduce((t, m) => t + m.value, 0)).toBe(1)
    expect(swapped.filter(m => m.type === "linkedAttribute")).toEqual([{
      source: "Strength", type: "linkedAttribute", value: 2
    }])
  })
})

describe('selectedSkillAttribute', () => {
  it('preselects the kept attribute, and falls back to the linked one when it is gone', () => {
    let choices = skillAttributeChoices(actorData, labels)
    expect(selectedSkillAttribute("strength", "agility", choices)).toBe("strength")
    expect(selectedSkillAttribute("magic", "agility", choices)).toBe("agility")
    expect(selectedSkillAttribute(undefined, "agility", choices)).toBe("agility")
  })
})

describe('prepareSkillAttribute', () => {
  const composition = () => [
    {
      source: "Agility", type: "linkedAttribute", value: 5
    },
    {
      source: "Gymnastics", type: "skillRating", value: 4
    },
  ]

  it('changes nothing without a kept attribute', () => {
    let rollData = prepareSkillAttribute(gymnastics(composition()), actorData, undefined, options)
    expect(rollData.dicePool.base).toBe(9)
    expect(rollData.test.title).toBe("Skill test: Gymnastics + Agility")
    expect(rollData.skillAttribute.keep).toBe(false)
  })

  it('rolls with the kept attribute: Gymnastics 4 + Strength 2', () => {
    let rollData = prepareSkillAttribute(gymnastics(composition()), actorData, "strength", options)
    expect(rollData.dicePool.base).toBe(6)
    expect(rollData.test.title).toBe("Skill test: Gymnastics + Strength")
    expect(rollData.skillAttribute).toMatchObject({
      selected: "strength", linked: "agility", keep: true
    })
  })

  it('leaves a skill alone when its linked attribute is not a character one (agents, sprites)', () => {
    let rollData = prepareSkillAttribute(gymnastics(composition()), actorData, "strength", {
      ...options, linked: "dataProcessing"
    })
    expect(rollData.skillAttribute).toBeUndefined()
    expect(rollData.dicePool.base).toBe(9)
  })

  it('names the attribute of a knowledge skill only when it is not the linked one', () => {
    let knowledge = {
      ...options, linked: "logic", titleBase: "Skill test: Chemistry", alwaysInTitle: false
    }
    let base = () => ({
      dicePool: {
        base: 7, composition: [{
          source: "Logic", type: "linkedAttribute", value: 4
        }, {
          source: "Chemistry", type: "skillRating", value: 3
        }]
      }, test: {
        title: "Skill test: Chemistry"
      }
    })
    expect(prepareSkillAttribute(base(), actorData, undefined, knowledge).test.title).toBe("Skill test: Chemistry")
    let swapped = prepareSkillAttribute(base(), actorData, "intuition", knowledge)
    expect(swapped.test.title).toBe("Skill test: Chemistry + Intuition")
    expect(swapped.dicePool.base).toBe(9)
  })
})

describe('skillAttributeFlagKey', () => {
  it('keys an active skill by its key and a knowledge skill by its item', () => {
    expect(skillAttributeFlagKey("skillDicePool", "gymnastics")).toBe("gymnastics")
    expect(skillAttributeFlagKey("knowledgeSkill", null, {
      id: "abc"
    })).toBe("knowledge-abc")
  })
})
