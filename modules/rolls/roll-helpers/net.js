// Nets on the table (Run & Gun p. 25 and 28): the rules are in net-rules.js, this file writes them on the actors.

import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  NET_EFFECT, SHOCKNET_CHARGE, NET_STATUS, netEffectOf
} from "./net-rules.js"

/**
 * The net lands on the defender of this card (Run & Gun p. 25): caught, threshold = the attacker's net hits. A ShockNet
 * also leaves its second charge for the start of the next Combat Turn (p. 28).
 */
export async function applyNet(actor, cardData) {
  if (!actor || !cardData?.combat?.net) return
  const name = SR5_EntityHelpers.displayName(actor)
  if (netEffectOf(actor)) return ui.notifications.info(game.i18n.format("SR5.NetAlreadyCaught", {
    name
  }))
  const threshold = Math.max(0, Number(cardData.combat.net.threshold) || 0)
  const effects = [{
    name: game.i18n.localize("SR5.NetEntangled"),
    type: "itemEffect",
    "system.type": NET_EFFECT,
    "system.target": game.i18n.localize("SR5.Special"),
    "system.value": threshold,
    "system.durationType": "special",
    "system.duration": 0,
    "system.gameEffect": game.i18n.format("SR5.NetEntangled_GE", {
      threshold
    }),
    "flags.sr5.net": {
      xl: !!cardData.combat.net.xl
    },
  }]
  if (cardData.combat.net.shock && game.combat) effects.push({
    name: game.i18n.localize("SR5.NetShockCharge"),
    type: "itemEffect",
    "system.type": SHOCKNET_CHARGE,
    "system.target": game.i18n.localize("SR5.Special"),
    "system.value": Math.max(0, Number(cardData.damage?.base) || 0),
    "system.durationType": "round",
    "system.duration": 1,
    "system.gameEffect": game.i18n.localize("SR5.NetShockCharge_GE"),
    "flags.sr5.shockNet": {
      armorPenetration: Number(cardData.combat.armorPenetration) || 0
    },
  })
  await actor.createEmbeddedDocuments("Item", effects)
  await SR5_EntityHelpers.addEffectToActor(actor, NET_STATUS)
  ui.notifications.info(game.i18n.format("SR5.NetCaught", {
    name, threshold
  }))
  await postNetCard(actor, threshold)
}

//The card of the netted character, with the button to try getting free (a Complex action each time)
async function postNetCard(actor, threshold) {
  const [{
    SR5_PrepareRollTest
  }, {
    SR5_RollTest
  }, {
    SR5_RollMessage
  }] = await Promise.all([import("../roll-prepare.js"), import("../roll-test.js"), import("../roll-message.js")])
  const rollData = SR5_PrepareRollTest.getBaseRollData(null, actor)
  rollData.test.type = "falseTest"
  rollData.test.typeSub = "net"
  rollData.test.title = `${game.i18n.localize("SR5.NetEntangled")} (${threshold})`
  rollData.chatCard.buttons.netEscape = SR5_RollMessage.generateChatButton("nonOpposedTest", "netEscape", game.i18n.format("SR5.NetEscapeButton", {
    threshold
  }))
  rollData.roll = await SR5_RollTest.rollDice({
    dicePool: 0
  })
  SR5_RollTest.renderRollCard(rollData)
}

/** Free from the net: the net, the ShockNet charge still waiting, and the status */
export async function removeNet(actor) {
  const ids = actor.items.filter(i => i.type === "itemEffect" && (i.system.type === NET_EFFECT || i.system.type === SHOCKNET_CHARGE)).map(i => i.id)
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids)
  //A whip's entanglement (called shot) keeps the same status
  if (!actor.items.some(i => i.type === "itemEffect" && i.system.type === "entanglement")) await SR5_EntityHelpers.deleteEffectOnActor(actor, NET_STATUS)
}

/**
 * The second charge of a ShockNet, at the start of the next Combat Turn (Run & Gun p. 28), on the GM's side
 * (srcombat.js, manageTurnEnd): the netted character resists it as the first one, electricity.
 */
export async function shockNetSecondCharge(actor, itemData, flags) {
  const dv = Number(itemData.value) || 0
  if (!(dv > 0) || !netEffectOf(actor)) return
  const {
    SR5_PrepareRollTest
  } = await import("../roll-prepare.js")
  const damageInfo = SR5_PrepareRollTest.getBaseRollData(null, actor)
  damageInfo.damage.resistanceType = "physicalDamage"
  damageInfo.damage.value = dv
  damageInfo.damage.base = dv
  damageInfo.damage.type = "stun"
  damageInfo.damage.element = "electricity"
  damageInfo.combat.armorPenetration = Number(flags?.armorPenetration) || 0
  damageInfo.test.title = game.i18n.localize("SR5.NetShockCharge")
  ui.notifications.info(game.i18n.format("SR5.NetShockChargeInfo", {
    name: SR5_EntityHelpers.displayName(actor), dv
  }))
  actor.rollTest("resistanceCard", null, damageInfo)
}
