// Going prone under suppressive fire (SR5 p. 170 and 182). "Un personnage peut décider de ne pas prendre de risque et
// utiliser son action gratuite pour se jeter au sol, évitant ainsi d'être touché. Un personnage qui aurait déjà utilisé
// son action gratuite peut utiliser l'action d'interruption manger la poussière" (-5 Initiative, p. 170): no Reaction +
// Edge test, the character is prone. "Les personnages pris dans la zone de suppression qui restent à couvert ou couchés
// ne risquent rien", but the zone penalty still applies to them (p. 181). Standing up costs a simple action, already
// spent by the system when the prone status is removed (hooks/active-effect.js).

//The interruption's cost in Initiative (SR5 p. 170)
export const EAT_DIRT_COST = 5

/**
 * The ways a character caught in a suppressive fire zone may go prone: "alreadyProne" (nothing to do, no risk), or the
 * list of the choices left, the free action first while one remains, the interruption otherwise.
 * @param {{prone: boolean, freeActions: number}} state
 * @returns {"alreadyProne"|string[]}
 */
export function dropProneChoices({
  prone, freeActions
}) {
  if (prone) return "alreadyProne"
  return freeActions > 0 ? ["free", "interruption"] : ["interruption"]
}

/** Is the actor prone (status of SR5 p. 187-188)? */
export function isProne(actor) {
  return !!actor?.effects?.some?.(e => e.statuses?.has?.("prone"))
}

/** The free actions the actor has left (no counter outside combat: one is always there) */
export function freeActionsLeft(actor) {
  if (!globalThis.game?.combat) return 1
  const free = actor?.system?.specialProperties?.actions?.free?.current
  return Number.isFinite(free) ? free : 1
}

/**
 * "Se défendre" against a suppressive fire, by a prone character: no test (SR5 p. 182), the zone penalty only.
 * @returns {Promise<boolean>} true when the defense must not be rolled
 */
export async function proneUnderSuppressiveFire(actor, attackData) {
  if (attackData?.combat?.firingMode?.selected !== "SF" || !isProne(actor)) return false
  const trusted = await trustedCard(attackData, actor)
  if (!trusted) return true
  const {
    SR5_ActorHelper
  } = await import("../../entities/actors/entityActor-helpers.js")
  await SR5_ActorHelper.suppressiveFireEffect(fighterId(actor), trusted.roll.hits)
  await announce(actor, "SR5.EatDirtAlreadyProne")
  return true
}

/** The "Se jeter au sol" button of a suppressive fire card: the character chooses how, then goes prone */
export async function dropProneUnderFire(actor, attackData, attackMessageId) {
  if (!actor) return
  const {
    hasDefended, defenderId
  } = await import("../../system/defense-once.js")
  //Already defended against this fire: the test was taken, it is too late to dive
  if (hasDefended(attackMessageId, defenderId(actor))) return ui.notifications.warn(game.i18n.format("SR5.WARN_AlreadyDefended", {
    name: actor.isToken ? actor.token?.name : actor.name
  }))
  if (await proneUnderSuppressiveFire(actor, attackData)) return
  const trusted = await trustedCard(attackData, actor)
  if (!trusted) return

  const choices = dropProneChoices({
    prone: false, freeActions: freeActionsLeft(actor)
  })
  const choice = choices.length === 1 ? choices[0] : await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("SR5.EatDirtTitle")
    },
    content: `<p>${game.i18n.localize("SR5.EatDirtQuestion")}</p>`,
    buttons: [
      {
        action: "free", label: game.i18n.localize("SR5.EatDirtFree"), default: true
      },
      {
        action: "interruption", label: game.i18n.format("SR5.EatDirtInterruption", {
          cost: EAT_DIRT_COST
        })
      },
    ],
    rejectClose: false,
  })
  if (choice !== "free" && choice !== "interruption") return

  const {
    SR5Combat
  } = await import("../../system/srcombat.js")
  if (choice === "interruption") {
    const {
      default: SR5_RollDialog
    } = await import("../roll-dialog.js")
    if (!SR5_RollDialog.hasInitiativeForInterruption(actor, EAT_DIRT_COST)) return
    if (game.combat) await SR5Combat.changeInitInCombatHelper(fighterId(actor), -EAT_DIRT_COST)
  } else if (game.combat) await SR5Combat.changeActionInCombat(fighterId(actor), [{
    type: "free", value: 1, source: "dropProne"
  }])

  const {
    SR5_ActorHelper
  } = await import("../../entities/actors/entityActor-helpers.js")
  await SR5_ActorHelper.suppressiveFireEffect(fighterId(actor), trusted.roll.hits)
  await SR5_ActorHelper.createProneEffect(fighterId(actor), 0, 0, {
    type: "special", duration: 0
  }, "suppressiveFire")
  await announce(actor, choice === "free" ? "SR5.EatDirtDoneFree" : "SR5.EatDirtDoneInterruption")
}

//The id a card gives its fighter: the token of an unlinked actor, otherwise the actor
function fighterId(actor) {
  return actor?.isToken ? actor.token?.id : actor?.id
}

//The fire read again from the chat log, as a defense does (attack-card.js): the penalty is the shooter's hits
async function trustedCard(attackData, actor) {
  const {
    trustedAttackCard
  } = await import("./attack-card.js")
  return trustedAttackCard(attackData, actor)
}

async function announce(actor, key) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor, token: actor.token
    }),
    content: `<p>${game.i18n.format(key, {
      name: foundry.utils.escapeHTML(actor.isToken ? actor.token?.name : actor.name), cost: EAT_DIRT_COST
    })}</p>`,
  })
}
