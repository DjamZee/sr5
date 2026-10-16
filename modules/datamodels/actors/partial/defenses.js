export class characterDefensesPartialModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields

    const defenseLimit = (base) => {
      return new fields.SchemaField({
        base: new fields.StringField({
          initial: base
        }),
        value: new fields.NumberField({
          initial: 0
        }),
        modifiers: new fields.ArrayField(new fields.ObjectField()),
      })
    }

    const defense = (limitBase) => {
      return new fields.SchemaField({
        dicePool: new fields.NumberField({
          initial: 0
        }),
        base: new fields.NumberField({
          initial: 0
        }),
        modifiers: new fields.ArrayField(new fields.ObjectField()),
        limit: defenseLimit(limitBase),
        //An effect may leave the hits of this active defense unlimited (roll-helpers/limit.js, defenseUnlimitedHits)
        unlimited: new fields.BooleanField({
          initial: false
        }),
      })
    }

    return {
      defenses: new fields.SchemaField({
        defend: defense(''),
        dodge: defense('physicalLimit'),
        block: defense('physicalLimit'),
        parryBlades: defense('physicalLimit'),
        parryClubs: defense('physicalLimit'),
      }),
    }
  }
}
