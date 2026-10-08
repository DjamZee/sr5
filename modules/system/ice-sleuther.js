// Sleuther IC (Kill Code p. 74): "Chaque mark donne à l'utilisateur légitime +2 dés sur toutes les actions de recherche
// matricielle ou les tests de perception matricielle vous concernant".
// "L'utilisateur légitime", in the singular, is the one the IC works for (Lone Star in the text, KC p. 74): the host of
// the Sleuther, its IC, which share its marks (SR5 p. 249), and the spider tied to that host. A persona that only holds
// marks on the host is not one: SR5 p. 250 (Patrol IC) speaks of what the host lets through, and illegal marks do not
// always fool it (SR5 p. 237). Arbitrage de DjamZ, 08/10. The system keeps no list of spiders: a module names them by
// answering the hook sr5.iceLegitimateUser ({roller, ice, host, legitimate}), setting legitimate = true.
// A Sleuther tied to no host: the IC alone

/** The actions that read the Sleuther marks */
export const SLEUTHER_ACTIONS = ["matrixPerception", "matrixSearch"]

/** The dice per Sleuther mark */
export const SLEUTHER_DICE_PER_MARK = 2

const isSleuther = actor => actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "ice" &&
  actor.system.matrix.deviceSubType === "iceSleuther"

/** The ids an actor may be named by in a mark: its own, and its token's */
function idsOf(actor){
  return [actor?.id, actor?.token?.id].filter(Boolean)
}

/** The marks on an icon: on its active device, or on the persona of an AI outside any device (Data Trails p. 157).
 *  The prepared persona copies the marks of the active device: read both, a mark counted twice. A file is an icon of its
 *  own: its marks are not the avatar's */
function marksCarried(actor){
  const device = Array.from(actor?.items ?? []).find(i => i.type === "itemDevice" && i.system?.isActive)
  return device ? (device.system.marks ?? []) : (actor?.system?.matrix?.marks ?? [])
}

/**
 * The Sleuther marks on an icon, each {ice, ices, value}: the marks whose owner is a Sleuther IC. An unlinked IC token
 * marks under its world actor's id (mark.js), while its host may be set on the token alone: `resolve` may give every
 * actor that id stands for (the world actor and its unlinked tokens), and each Sleuther among them is kept in `ices`
 * (Bérénice's review 126)
 * @param {Object} target - the marked actor
 * @param {Function} resolve - id => actor, or [actors]
 */
export function sleutherMarksOn(target, resolve){
  const found = new Map()
  for (const m of marksCarried(target)){
    const value = Number(m?.value) || 0
    if (value <= 0) continue
    const ices = [resolve(m.ownerId)].flat().filter(isSleuther)
    if (!ices.length) continue
    const entry = found.get(m.ownerId) ?? {
      ice: ices[0], ices, value: 0
    }
    entry.value = Math.min(3, entry.value + value)
    found.set(m.ownerId, entry)
  }
  return [...found.values()]
}

/**
 * Whether the roller is a legitimate user for this Sleuther (see above)
 * @param {Object} roller - the actor rolling
 * @param {Object} ice - the Sleuther
 * @param {Object|null} host - the host the Sleuther runs in
 * @param {Function} isSpider - ({roller, ice, host}) => whether a module names the roller a spider of that host
 */
export function isLegitimateUser(roller, ice, host, isSpider = () => false){
  if (!roller || !ice) return false
  if (roller === ice || idsOf(roller).some(id => idsOf(ice).includes(id))) return true
  if (!host) return false
  if (roller === host || (roller.uuid && roller.uuid === host.uuid)) return true
  const hostUuid = ice.system?.matrix?.hostUuid
  if (roller.type === "actorDevice" && roller.system?.matrix?.deviceType === "ice" && hostUuid && roller.system.matrix.hostUuid === hostUuid) return true
  return isSpider({
    roller, ice, host
  }) === true
}

/** Asks the modules whether the roller is a spider of the host (hook sr5.iceLegitimateUser); a failing subscriber is
 *  logged by Foundry and counts for nothing */
export function spiderByHook({
  roller, ice, host
}){
  const verdict = {
    roller, ice, host, legitimate: false
  }
  globalThis.Hooks?.callAll?.("sr5.iceLegitimateUser", verdict)
  return verdict.legitimate === true
}

/**
 * The dice a Sleuther gives the roller against the target: +2 per mark of each Sleuther whose legitimate user it is
 * @param {Object} roller - the actor rolling
 * @param {Object} target - the icon the test concerns
 * @param {Function} resolve - id => actor
 * @param {Function} hostOf - ice => its host, or null
 * @param {Function} isSpider - see isLegitimateUser
 */
export function sleutherDice(roller, target, resolve, hostOf, isSpider = spiderByHook){
  if (!roller || !target || roller === target) return 0
  return sleutherMarksOn(target, resolve).reduce((dice, {
    ices, value
  }) => dice + (ices.some(ice => isLegitimateUser(roller, ice, hostOf(ice), isSpider)) ? value * SLEUTHER_DICE_PER_MARK : 0), 0)
}
