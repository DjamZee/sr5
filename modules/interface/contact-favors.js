// The favors counter of a contact (lot 37a): the chips between a character and a contact, Run Faster p. 170-172
// and SR5 p. 388-391. The rules are in favor-rules.js; this file reads Foundry and asks.
// Whoever may edit the contact item (its owner: the character's player, or the gamemaster) writes it.
import {
  favorsOf, balanceOf, chipsForFavor, favorNeedsTest, spendableChips, afterFavorObtained, chipsClearedByFavors,
  CHIPS_FOR_SERVICE, loyaltyImprovement, pushLog, FAVOR_RATINGS
} from "../system/favor-rules.js"
import {
  addPending
} from "../system/social-pending.js"

const L = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key)

/** What the contact sheet and the contacts list show of the favors. */
export function favorsContext(system) {
  const f = favorsOf(system)
  const b = balanceOf(f.chips)
  const label = b.side === "contactOwes" ? L("SR5.FAVOR_ContactOwes", {
    n: b.count
  }) : b.side === "characterOwes" ? L("SR5.FAVOR_CharacterOwes", {
    n: b.count
  }) : L("SR5.FAVOR_Even")
  return {
    chips: f.chips,
    side: b.side,
    count: b.count,
    // The short pill of the contacts list: +2 the contact owes, −3 the character owes
    pill: f.chips > 0 ? `+${f.chips}` : f.chips < 0 ? `−${-f.chips}` : "0",
    label,
    relation: f.relation,
    relationLabel: f.relation ? L(`SR5.FAVOR_Relation_${f.relation}`) : "",
    intimidated: f.intimidated,
    log: f.log.map(e => ({
      ...e,
      deltaLabel: e.delta > 0 ? `+${e.delta}` : e.delta < 0 ? `−${-e.delta}` : "",
      deltaClass: e.delta > 0 ? "up" : e.delta < 0 ? "down" : "",
    })),
  }
}

async function write(item, chips, entry, extra = {
}) {
  const f = favorsOf(item.system)
  const delta = chips - f.chips
  await item.update({
    "system.favors.chips": chips,
    "system.favors.log": pushLog(f.log, {
      ...entry, delta, after: chips, user: game.user.name, time: game.time?.worldTime ?? 0, date: new Date().toISOString().slice(0, 10)
    }),
    ...extra,
  })
}

function ratingOptions(selected = 1) {
  return FAVOR_RATINGS.map(r => `<option value="${r}" ${r === selected ? "selected" : ""}>${r}</option>`).join("")
}

async function ask(title, content, label = "SR5.FAVOR_Write") {
  return foundry.applications.api.DialogV2.wait({
    window: {
      title
    },
    classes: ["sr5", "sr-favors-dialog"],
    content,
    buttons: [{
      action: "ok", label: L(label), default: true, callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }, {
      action: "cancel", label: L("SR5.Cancel")
    }],
    rejectClose: false,
  })
}

/**
 * A favor asked of the contact (SR5 p. 391, RF p. 170). Within the Loyalty, the contact grants it; above it,
 * an opposed Negotiation + Charisma [Social] test: the Loyalty and the chips spent (+4 at most) go to the
 * character's pool as dice waiting in her next Negotiation dialog. Writing the favor is a second step,
 * once the gamemaster has said it is granted.
 */
async function askFavor(item) {
  const f = favorsOf(item.system)
  const loyalty = Number(item.system.loyalty) || 0
  const spendable = spendableChips(f.chips)
  const content = `<p class="sr-favors-rule">${L("SR5.FAVOR_AskRule", {
    loyalty
  })}</p>
    <div class="form-group"><label>${L("SR5.FAVOR_Rating")}</label><select name="rating">${ratingOptions(Math.max(1, Math.min(6, loyalty + 1)))}</select></div>
    <div class="form-group"><label>${L("SR5.FAVOR_SpendChips", {
    max: spendable
  })}</label><input type="number" name="spent" value="0" min="0" max="${spendable}" ${spendable ? "" : "disabled"}></div>`
  const data = await ask(L("SR5.FAVOR_AskTitle", {
    name: item.name
  }), content, "SR5.FAVOR_AskGo")
  if (!data) return
  const rating = Number(data.rating) || 1
  const spent = Math.min(spendable, Math.max(0, Number(data.spent) || 0))
  if (!favorNeedsTest(rating, loyalty)) {
    ui.notifications.info(L("SR5.FAVOR_GrantedWithin", {
      rating, loyalty
    }))
    return favorObtained(item, {
      rating
    })
  }
  const actor = item.actor
  if (!actor) return ui.notifications.warn(L("SR5.FAVOR_NoActor"))
  // The chips are spent on the test, whatever comes of it (« chaque jeton dépensé », RF p. 170)
  if (spent) await write(item, f.chips - spent, {
    kind: "spent", note: L("SR5.FAVOR_LogSpent", {
      n: spent, rating
    })
  })
  // SR5 p. 388: the Loyalty is a bonus when the character negotiates with the contact; one less for family (RF p. 172)
  const loyaltyDice = Math.max(0, f.relation === "family" ? loyalty - 1 : loyalty)
  if (loyaltyDice) await addPending(actor, {
    kind: "dice", value: loyaltyDice, tests: ["negotiation"]
  }, L("SR5.FAVOR_PendingLoyalty", {
    name: item.name
  }))
  if (spent) await addPending(actor, {
    kind: "dice", value: spent, tests: ["negotiation"]
  }, L("SR5.FAVOR_PendingChips", {
    name: item.name, n: spent
  }))
  ui.notifications.info(L("SR5.FAVOR_TestNeeded", {
    rating, loyalty
  }))
  return actor.rollTest("skillDicePool", "negotiation")
}

/** The favor granted: the contact gains its chips, less what the character holds (RF p. 170, 172). */
async function favorObtained(item, preset = {
}) {
  const f = favorsOf(item.system)
  let rating = preset.rating
  if (!rating) {
    const data = await ask(L("SR5.FAVOR_ObtainedTitle", {
      name: item.name
    }), `<div class="form-group"><label>${L("SR5.FAVOR_Rating")}</label><select name="rating">${ratingOptions()}</select></div>
      <p class="sr-favors-rule">${L("SR5.FAVOR_ObtainedRule")}</p>`)
    if (!data) return
    rating = Number(data.rating) || 1
  }
  const cost = chipsForFavor(rating, f.relation)
  return write(item, afterFavorObtained(f.chips, rating, {
    relation: f.relation
  }), {
    kind: "obtained", note: L(cost === rating ? "SR5.FAVOR_LogObtained" : "SR5.FAVOR_LogObtainedRelation", {
      rating, cost, relation: f.relation ? L(`SR5.FAVOR_Relation_${f.relation}`) : ""
    })
  })
}

/** A service done for the contact, asked or not: a chip for the character (RF p. 170). */
async function serviceDone(item) {
  const f = favorsOf(item.system)
  const data = await ask(L("SR5.FAVOR_ServiceTitle", {
    name: item.name
  }), `<p class="sr-favors-rule">${L("SR5.FAVOR_ServiceRule")}</p>
    <div class="form-group"><label>${L("SR5.FAVOR_Chips")}</label><input type="number" name="n" value="${CHIPS_FOR_SERVICE}" min="1"></div>
    <div class="form-group"><label>${L("SR5.FAVOR_Note")}</label><input type="text" name="note" value=""></div>`)
  if (!data) return
  const n = Math.max(1, Math.trunc(Number(data.n) || CHIPS_FOR_SERVICE))
  return write(item, f.chips + n, {
    kind: "service", note: data.note ? `${L("SR5.FAVOR_LogService")} : ${data.note}` : L("SR5.FAVOR_LogService")
  })
}

/** Paying back a debt: favors given back count half (twice the value asked), or a payment agreed (RF p. 170). */
async function repay(item) {
  const f = favorsOf(item.system)
  const debt = Math.max(0, -f.chips)
  if (!debt) return ui.notifications.info(L("SR5.FAVOR_NoDebt"))
  const data = await ask(L("SR5.FAVOR_RepayTitle", {
    name: item.name
  }), `<p class="sr-favors-rule">${L("SR5.FAVOR_RepayRule", {
    debt, double: debt * 2
  })}</p>
    <div class="form-group"><label>${L("SR5.FAVOR_RepayHow")}</label><select name="how">
      <option value="favors">${L("SR5.FAVOR_RepayFavors")}</option><option value="payment">${L("SR5.FAVOR_RepayPayment")}</option></select></div>
    <div class="form-group"><label>${L("SR5.FAVOR_RepayValue")}</label><input type="number" name="value" value="${debt * 2}" min="0"></div>`)
  if (!data) return
  const value = Math.max(0, Number(data.value) || 0)
  // A payment agreed is counted in chips cleared by whoever writes it; favors given back, by the book's double
  const cleared = data.how === "payment" ? Math.min(debt, value) : chipsClearedByFavors(value, f.chips)
  if (!cleared) return ui.notifications.warn(L("SR5.FAVOR_RepayNothing"))
  return write(item, f.chips + cleared, {
    kind: "repaid", note: L(data.how === "payment" ? "SR5.FAVOR_LogRepaidPayment" : "SR5.FAVOR_LogRepaidFavors", {
      value, n: cleared
    })
  })
}

/** Improving the relationship: chips and weeks equal to the Loyalty aimed at (RF p. 170). */
async function improve(item) {
  const f = favorsOf(item.system)
  const loyalty = Number(item.system.loyalty) || 0
  const plan = loyaltyImprovement(loyalty, f.chips, f)
  if (plan.refused) return ui.notifications.warn(L(`SR5.FAVOR_ImproveRefused_${plan.refused}`, plan))
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: L("SR5.FAVOR_ImproveTitle", {
        name: item.name
      })
    },
    content: `<p>${L("SR5.FAVOR_ImproveRule", plan)}</p>`,
    rejectClose: false,
  })
  if (!ok) return
  return write(item, f.chips - plan.cost, {
    kind: "improved", note: L("SR5.FAVOR_LogImproved", plan)
  }, {
    "system.loyalty": plan.target
  })
}

/** A free correction, with its reason: the table's own reckoning. */
async function adjust(item) {
  const f = favorsOf(item.system)
  const data = await ask(L("SR5.FAVOR_AdjustTitle", {
    name: item.name
  }), `<div class="form-group"><label>${L("SR5.FAVOR_AdjustValue")}</label><input type="number" name="n" value="0"></div>
    <div class="form-group"><label>${L("SR5.FAVOR_Note")}</label><input type="text" name="note" value=""></div>`)
  if (!data) return
  const n = Math.trunc(Number(data.n) || 0)
  if (!n) return
  return write(item, f.chips + n, {
    kind: "adjusted", note: data.note || L("SR5.FAVOR_LogAdjusted")
  })
}

/**
 * Intimidating the contact for a favor (RF p. 172): no chips, one Loyalty point lost at once, and the
 * relationship can never be improved again; a blackmailed contact loses nothing.
 */
async function intimidate(item) {
  const f = favorsOf(item.system)
  const loyalty = Number(item.system.loyalty) || 0
  const blackmail = f.relation === "blackmail"
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: L("SR5.FAVOR_IntimidateTitle", {
        name: item.name
      })
    },
    content: `<p>${L(blackmail ? "SR5.FAVOR_IntimidateBlackmail" : "SR5.FAVOR_IntimidateRule")}</p>`,
    rejectClose: false,
  })
  if (!ok) return
  const extra = blackmail ? {
  } : {
    "system.loyalty": Math.max(0, loyalty - 1), "system.favors.intimidated": true
  }
  return write(item, f.chips, {
    kind: "intimidated", note: L(blackmail ? "SR5.FAVOR_LogIntimidatedBlackmail" : "SR5.FAVOR_LogIntimidated")
  }, extra)
}

const ACTIONS = {
  ask: askFavor, obtained: favorObtained, service: serviceDone, repay, improve, adjust, intimidate
}

/** The button of the sheet: data-favor names the action. */
export function onFavorAction(item, kind) {
  if (!item?.isOwner) return ui.notifications.warn(L("SR5.FAVOR_NotOwner"))
  return ACTIONS[kind]?.(item)
}
