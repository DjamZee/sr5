import {
  SR5 
} from "../../config.js"
import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import {
  streamOf, streamSpriteDice, mayCompileMajorForm
} from "../../entities/actors/technomancer-streams.js"

//The resonance actions limited by a level, sprite or form (SR5 p. 252), and not by a limit of the actor
const LEVEL_LIMITED = ["compileSprite", "registerSprite"]

export default async function resonanceAction(rollData, rollKey, actor){
  let resonanceAction = actor.system.matrix?.resonanceActions[rollKey]

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.ResonanceActionTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize(SR5.resonanceActions[rollKey])}`

  //Determine dicepool composition
  rollData.dicePool.composition = resonanceAction.test.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, resonanceAction.test.modifiers)

  //Compile and Register are limited by the sprite level (SR5 p. 252), set in roll-test.js: only the effects on that
  //limit come from the actor (Kill Code p. 110, 115)
  if (LEVEL_LIMITED.includes(rollKey)){
    rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, resonanceAction.limit?.modifiers ?? [])
  } else if (resonanceAction.limit){
    //Determine base limit
    rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(resonanceAction.limit.value, resonanceAction.limit.modifiers)

    //Determine limit modififiers
    rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, resonanceAction.limit.modifiers)
    rollData.limit.type = resonanceAction.limit.linkedAttribute
  }

  //Add others informations
  rollData.test.type = "resonanceAction"
  rollData.test.typeSub = rollKey
  rollData.matrix.actionType = resonanceAction.actionType
  rollData.matrix.overwatchScore = resonanceAction.increaseOverwatchScore
  //SR5 p. 252: only compiling asks the sprite level (Resonance by default); the level becomes the limit,
  //so the other actions keep their own (Decompile [Social], Kill Complex Form [Mental])
  if (rollKey === "compileSprite") rollData.matrix.level = actor.system.specialAttributes.resonance.augmented.value
  //Kill Code p. 102: a Technoshaman may compile a sprite in its major form, the dialog offers it
  if (rollKey === "compileSprite") {
    rollData.matrix.canMajorForm = mayCompileMajorForm(streamOf(actor))
    rollData.matrix.majorForm = false
  }
  //Without a targeted sprite, its level is unknown: the Resonance stays the limit, as before
  if (rollKey === "registerSprite") rollData.matrix.level = actor.system.specialAttributes.resonance.augmented.value
  rollData.dialogSwitch.specialization = true

  //Manage actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: resonanceAction.actionType, value: 1, source: "resonanceAction"
  })

  //Handle special case
  if (rollData.target.hasTarget && (rollKey === "killComplexForm" || rollKey === "decompileSprite" || rollKey === "registerSprite")){
    let targetActor = await SR5_PrepareRollHelper.getTargetedActor()
            
    //Kill Complex Form
    if (rollKey === "killComplexForm"){
      let itemList = targetActor.items.filter(i => i.type === "itemComplexForm" && i.system.isActive)
      for (let e of Object.values(targetActor.items.filter(i => i.type === "itemEffect" && i.system.type === "itemComplexForm"))){
        let parentItem = await fromUuid(e.system.ownerItem)
        if (itemList.length === 0) itemList.push(parentItem)
        else {
          let itemAlreadyIn = itemList.find((i) => i.id === parentItem.id)
          if (!itemAlreadyIn) itemList.push(parentItem)
        }
      }
      if (itemList.length !== 0){
        for (let s of itemList) rollData.target.itemList[s.uuid] = s.name
      }
    }

    //Decompiling / Register
    if (rollKey === "decompileSprite" || rollKey === "registerSprite"){
      if (targetActor.type !== "actorSprite") return void ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NotASprite")}`)
      //SR5 p. 252: Register [Sprite level]
      if (rollKey === "registerSprite") rollData.matrix.level = targetActor.system.level
      //The stream's +2 dice to decompile two kinds of sprites (Kill Code p. 100-101, 145-146)
      const streamDice = rollKey === "decompileSprite" ? streamSpriteDice(streamOf(actor), targetActor.system.type) : 0
      if (streamDice) rollData.dicePool.modifiers.push({
        type: "technomancerStream", label: game.i18n.localize(SR5.dicePoolModTypes.technomancerStream), value: streamDice
      })
    }
  }

  return rollData
}