// A link lock (SR5 p. 231) is an itemEffect that sets system.matrix.isLinkLocked, one per icon that locked the
// connection: the Lockdown program, the IC that lock (Black, Blaster, Tar Baby, Flicker, Blue Goo)

/** Whether the item is a link lock effect */
export function isLinkLockEffect(item){
  return item?.type === "itemEffect" && Object.values(item.system?.customEffects ?? {
  }).some(e => e?.target === "system.matrix.isLinkLocked")
}

/** The ids of the actor's "Connexion verrouillée" status effects: one is enough for all its locks */
export function linkLockStatusIds(actor){
  return Array.from(actor?.effects ?? []).filter(e => e.origin === "linkLock" || e.statuses?.has?.("linkLock")).map(e => e.id)
}
