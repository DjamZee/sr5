// Blue Goo IC (Kill Code p. 74): "si un avatar réussit à infliger des dommages matriciels à cette CI, elle se désactive
// en explosant". Its explosion is offered on its resistance card and on the defense of the avatar that hurt it: two
// buttons for one blow. Once down (the dead status its explosion gives it, roll-message.js), it explodes no more
// (Bérénice's review 126)

const isBlueGoo = actor => actor?.system?.matrix?.deviceSubType === "iceBlueGoo"

/**
 * The Blue Goo a button makes explode, or null: the card's actor (its resistance card), else the attacker of the
 * defense card; none once it is down
 * @param {Object} actor - the actor of the card
 * @param {Object} attacker - the attacker the card answers
 * @return {{goo: Object|null, down: Boolean}}
 */
export function blueGooToExplode(actor, attacker){
  const goo = isBlueGoo(actor) ? actor : isBlueGoo(attacker) ? attacker : null
  if (!goo) return {
    goo: null, down: false
  }
  const down = !!goo.statuses?.has?.("dead") || Array.from(goo.effects ?? []).some(e => e.statuses?.has?.("dead"))
  return {
    goo: down ? null : goo, down
  }
}
