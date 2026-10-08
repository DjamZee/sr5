// Sleuther IC (Kill Code p. 74): "Chaque mark donne à l'utilisateur légitime +2 dés sur toutes les actions de recherche
// matricielle ou les tests de perception matricielle vous concernant".
// The legitimate user, which Kill Code does not define, is read in SR5: a host and its IC share their marks (p. 249), and
// "dès qu'un persona a une mark, il est considéré comme un utilisateur légitime" of the host (p. 250, Patrol IC). So the
// host of the Sleuther, any IC of that host, and any persona holding a mark on that host: its spider, and a hacker
// whose marks the host takes for legitimate ones, as the book has it. A Sleuther tied to no host: the IC alone

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
 * The Sleuther marks on an icon, each {ice, value}: the marks whose owner is a Sleuther IC
 * @param {Object} target - the marked actor
 * @param {Function} resolve - id => actor
 */
export function sleutherMarksOn(target, resolve){
  const found = new Map()
  for (const m of marksCarried(target)){
    const value = Number(m?.value) || 0
    if (value <= 0) continue
    const ice = resolve(m.ownerId)
    if (!isSleuther(ice)) continue
    const entry = found.get(m.ownerId) ?? {
      ice, value: 0
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
 */
export function isLegitimateUser(roller, ice, host){
  if (!roller || !ice) return false
  if (roller === ice || idsOf(roller).some(id => idsOf(ice).includes(id))) return true
  if (!host) return false
  if (roller === host || (roller.uuid && roller.uuid === host.uuid)) return true
  const hostUuid = ice.system?.matrix?.hostUuid
  if (roller.type === "actorDevice" && roller.system?.matrix?.deviceType === "ice" && hostUuid && roller.system.matrix.hostUuid === hostUuid) return true
  const ids = idsOf(roller)
  return marksCarried(host).some(m => ids.includes(m?.ownerId) && (Number(m?.value) || 0) > 0)
}

/**
 * The dice a Sleuther gives the roller against the target: +2 per mark of each Sleuther whose legitimate user it is
 * @param {Object} roller - the actor rolling
 * @param {Object} target - the icon the test concerns
 * @param {Function} resolve - id => actor
 * @param {Function} hostOf - ice => its host, or null
 */
export function sleutherDice(roller, target, resolve, hostOf){
  if (!roller || !target || roller === target) return 0
  return sleutherMarksOn(target, resolve).reduce((dice, {
    ice, value
  }) => dice + (isLegitimateUser(roller, ice, hostOf(ice)) ? value * SLEUTHER_DICE_PER_MARK : 0), 0)
}
