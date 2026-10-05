import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_PrepareRollTest
} from "../roll-prepare.js"
import {
  opposedTestActorId
} from "./cardRoller.js"
import {
  ritualTraditionPenalty, ritualAssistPool, readAssistDice, teamworkBonus, contractualLacksParticipant, uniqueAssists
} from "./ritualTeam.js"
import {
  spendableStock
} from "../../system/reagents.js"

// The id the roll cards give an actor (roll-prepare.js getBaseRollData): its token for an unlinked token, itself otherwise
export function rollCardActorId(actor) {
  return actor.isToken ? actor.token.id : actor.id
}

// The ritual circle (SR5 p. 298-299): the leader posts a card, the participants join it with their own roll,
// then the leader seals the ritual with the teamwork bonus (SR5 p. 51).
export class SR5_RitualCircle {

  // Step 3: the Force is chosen before anyone rolls, the participants roll against it
  static async open(actor, item) {
    if (!(spendableStock(actor.system.magic) > 0)) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_NoReagents"))
    const force = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: `${game.i18n.localize("SR5.PerformRitual")} ${item.name}`
      },
      content: `<div class="form-group"><label>${game.i18n.localize("SR5.Force")}</label><input type="number" name="force" min="1" value="${actor.system.specialAttributes.magic.augmented.value || 1}"></div>`,
      ok: {
        callback: (event, button) => parseInt(button.form.elements.force.value)
      },
      rejectClose: false,
    })
    if (!(force > 0)) return

    const circle = {
      itemUuid: item.uuid,
      ritualName: item.name,
      leaderId: rollCardActorId(actor),
      leaderName: actor.name,
      tradition: actor.system.magic.tradition,
      force,
      contractual: !!item.system.contractual,
      sealed: false,
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({
        actor
      }),
      content: this.circleContent(circle),
      flags: {
        sr5: {
          ritualCircle: circle
        }
      },
    })
  }

  static circleContent(circle) {
    const title = game.i18n.format("SR5.RitualCircleTitle", {
      ritual: circle.ritualName, force: circle.force
    })
    const leader = game.i18n.format("SR5.RitualCircleLeader", {
      name: circle.leaderName
    })
    if (circle.sealed) return `<div class="sr5-ritual-circle"><p><strong>${title}</strong></p><p>${leader}</p><p><em>${game.i18n.localize("SR5.RitualCircleSealed")}</em></p></div>`
    return `<div class="sr5-ritual-circle"><p><strong>${title}</strong></p><p>${leader}</p>` +
      `<button type="button" class="sr5-ritual-action" data-ritual-action="join">${game.i18n.localize("SR5.RitualJoin")}</button>` +
      `<button type="button" class="sr5-ritual-action ritual-leader" data-ritual-action="seal">${game.i18n.localize("SR5.RitualSeal")}</button></div>`
  }

  static activateListeners(html, message) {
    const circle = message.flags?.sr5?.ritualCircle
    if (!circle) return
    // Only the leader (author of the card) or the GM seals
    if (!message.isOwner) html.querySelectorAll(".ritual-leader").forEach(el => el.remove())
    html.querySelectorAll(".sr5-ritual-action").forEach(el => el.addEventListener("click", ev => {
      ev.preventDefault()
      if (ev.currentTarget.dataset.ritualAction === "join") this.join(message)
      else this.seal(message)
    }))
  }

  // The assist cards already posted for this circle
  static assistsOf(message) {
    return game.messages.contents
      .map(m => m.flags?.sr5?.ritualAssist)
      .filter(a => a?.circleId === message.id)
  }

  static async join(message) {
    const circle = message.flags.sr5.ritualCircle
    if (circle.sealed) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_RitualAlreadySealed"))
    const actor = SR5_EntityHelpers.getRealActorFromID(opposedTestActorId(ChatMessage.getSpeaker()))
    if (!actor) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActor"))
    const actorId = rollCardActorId(actor)
    if (actorId === circle.leaderId) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_RitualLeaderJoins"))
    if (!(actor.system.specialAttributes?.magic?.augmented?.value > 0)) return void ui.notifications.warn(game.i18n.format("SR5.WARN_RitualNotAwakened", {
      name: actor.name
    }))
    if (this.assistsOf(message).some(a => a.actorId === actorId)) return void ui.notifications.warn(game.i18n.format("SR5.WARN_RitualAlreadyJoined", {
      name: actor.name
    }))

    const skill = actor.system.skills.ritualSpellcasting
    const penalty = ritualTraditionPenalty(circle.tradition, actor.system.magic.tradition)
    const pool = ritualAssistPool(skill.rating.value, skill.test.dicePool, penalty)
    let assist = {
      hits: 0, glitch: false, criticalGlitch: false
    }
    let rolls = []
    if (pool > 0) {
      const roll = await new Roll(`${pool}d6`).evaluate()
      assist = readAssistDice(roll.dice[0].results.map(r => r.result), circle.force)
      rolls.push(roll)
    }

    let lines = [game.i18n.format("SR5.RitualAssistJoined", {
      name: actor.name, ritual: circle.ritualName, leader: circle.leaderName
    })]
    if (!(skill.rating.value > 0)) lines.push(game.i18n.localize("SR5.RitualAssistNoSkill"))
    else lines.push(game.i18n.format("SR5.RitualAssistRoll", {
      pool, force: circle.force, hits: assist.hits
    }))
    if (penalty) lines.push(game.i18n.localize("SR5.RitualAssistOtherTradition"))
    if (assist.criticalGlitch) lines.push(game.i18n.localize("SR5.RitualAssistCriticalGlitch"))
    else if (assist.glitch) lines.push(game.i18n.localize("SR5.RitualAssistGlitch"))

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({
        actor
      }),
      content: `<div class="sr5-ritual-assist">${lines.map(l => `<p>${l}</p>`).join("")}</div>`,
      rolls,
      flags: {
        sr5: {
          ritualAssist: {
            circleId: message.id, actorId, name: actor.name, pool, penalty, ...assist
          }
        }
      },
    })
  }

  static async seal(message) {
    const circle = message.flags.sr5.ritualCircle
    const item = await fromUuid(circle.itemUuid)
    if (!item) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_RitualItemMissing"))
    const assists = uniqueAssists(this.assistsOf(message), circle.leaderId)
    if (contractualLacksParticipant(circle, assists.length)) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_RitualContractual"))

    const leader = item.actor
    const bonus = teamworkBonus(leader.system.skills.ritualSpellcasting.rating.value, assists)
    if (!circle.sealed) {
      // No one joins once the leader seals; the leader can still seal again if the roll dialog was closed
      const sealed = {
        ...circle, sealed: true
      }
      await message.update({
        content: this.circleContent(sealed), "flags.sr5.ritualCircle.sealed": true
      })
    }
    SR5_PrepareRollTest.rollTest(item, "ritual", null, {
      ritualCircle: {
        force: circle.force,
        bonus,
        participants: assists.map(a => ({
          actorId: a.actorId, name: a.name
        })),
      },
    })
  }
}
