/**
 * The vendor templates (shop lot C, part 2): one per group of banners DjamZ
 * drew, 36 in all. What each sells, at what legality, margin and availability
 * ceiling are choices of play, not rules: no book gives them. The gamemaster
 * changes any of them on the vendor afterwards.
 *
 * `banners` are the file names of the banners without their number and
 * extension, as they are in the folder ("Armurier-des-ombres-1.webp" →
 * "Armurier-des-ombres"); `extra` are whole names of single images. The files
 * are never shipped with the system: the world setting "banner folder" points
 * at them.
 *
 * Pure data, no Foundry: the tests read it as it is.
 */

/** Families, in the order of the menu. */
export const VENDOR_FAMILIES = ['weapons', 'vehicles', 'implants', 'electronics', 'drugs', 'magic', 'misc']

/** One accent per family, taken from the banners' dominant colour; a template may have its own. */
export const FAMILY_ACCENTS = {
  weapons: '#c0392b',
  vehicles: '#d4a017',
  implants: '#2e86c1',
  electronics: '#16a085',
  drugs: '#8e44ad',
  magic: '#b9770e',
  misc: '#7f8c8d',
}

const L = 'legal', R = 'R', F = 'F'

const t = (key, family, banners, shelves, legality, margin, maxAvailability, extra = {
}) => ({
  key, family, banners, shelves, legality, margin, maxAvailability, perShelf: 10, extra: [], ...extra,
})

export const VENDOR_TEMPLATES = [
  // Weapons
  t('shadowArmorer', 'weapons', 'Armurier-des-ombres', ['weapons', 'ammunition', 'armor'], [L, R, F], 20, 16),
  t('gunsmithWorkshop', 'weapons', "Atelier-d'armurerie", ['weapons', 'ammunition'], [L, R], 0, 12, {
    extra: ['Atelier']
  }),
  t('blackMarketArms', 'weapons', "Vendeur d'Arme - Blackmarket", ['weapons', 'ammunition'], [L, R, F], 50, 20),
  t('corporateArms', 'weapons', "Vendeur d'Arme - corpo", ['weapons', 'ammunition', 'armor'], [L, R], 0, 10),
  t('armorDealer', 'weapons', "Marchand-d'armures", ['armor'], [L, R], 0, 12),
  // Vehicles and drones
  t('luxuryCars', 'vehicles', 'Concessionnaire-de-luxe', ['vehicles'], [L], 10, 12),
  t('ordinaryCars', 'vehicles', 'Concessionnaire-vehicules-ordinaires', ['vehicles'], [L], 0, 8),
  t('milSpecVehicles', 'vehicles', 'Revendeur-de-vehicule-MilSpec', ['vehicles', 'weapons'], [L, R, F], 30, 20),
  t('tuner', 'vehicles', 'Preparateur-de-bolides', ['vehicles'], [L, R], 10, 12),
  t('riggerShop', 'vehicles', 'Boutique-de-rigger', ['vehicles', 'electronics'], [L, R], 0, 12),
  t('droneDealer', 'vehicles', 'Verndeur de Drones', ['vehicles'], [L, R], 0, 12),
  // Implants and care
  t('streetDoc', 'implants', 'Charcudoc', ['cyberware', 'bioware', 'augmentations'], [L, R, F], 20, 12),
  t('deltaClinic', 'implants', 'Clinique-delta', ['cyberware', 'bioware', 'augmentations'], [L, R], 50, 20),
  t('emergencyHospital', 'implants', "Hopital-d'urgence", ['gear', 'drugs'], [L], 0, 8),
  t('medicalSupplier', 'implants', 'Fournisseur-de-materiel-medical', ['gear', 'drugs'], [L, R], 0, 10),
  t('cyberwareFence', 'implants', 'Receleur-de-cyberware', ['cyberware', 'bioware'], [L, R, F], -20, 16, {
    extra: ['Receleur']
  }),
  t('organlegger', 'implants', 'Desosseur', ['cyberware', 'bioware'], [L, R, F], -30, 12),
  // Electronics
  t('consumerElectronics', 'electronics', 'Electronique-grand-public', ['electronics'], [L], 0, 6),
  t('blackMarketElectronics', 'electronics', 'Marche-noir-electronique', ['electronics'], [L, R, F], 30, 16),
  t('deckerShop', 'electronics', 'Shop-pour-decker', ['electronics'], [L, R], 10, 14),
  t('intrusionGear', 'electronics', "Materiel-d'intrusion", ['electronics', 'gear'], [L, R, F], 20, 16),
  // Drugs
  t('streetDealer', 'drugs', 'Dealer-de-rue', ['drugs'], [L, R, F], 0, 8),
  t('btlDealer', 'drugs', 'Dealer-de-BTL', ['drugs', 'electronics'], [R, F], 20, 12),
  t('drugDealer', 'drugs', 'Dealer-de-Drogues', ['drugs'], [L, R, F], 10, 12),
  t('nightclubDealer', 'drugs', 'Dealer-de-nightclub', ['drugs'], [L, R], 30, 8),
  // Magic: the shelf holds the foci, the only magic goods the compendiums sell as items
  t('alleyTalismonger', 'magic', 'Talismonger de ruelle', ['magic'], [L, R], 10, 12),
  t('traditionalTalismonger', 'magic', 'Échoppe de talismonger traditionnelle', ['magic'], [L], 0, 8),
  t('enchanterLodge', 'magic', "Atelier d'enchantement - loge magique", ['magic'], [L, R], 20, 16),
  t('reagentDealer', 'magic', 'Marchand de réactifs et télesma', ['magic'], [L], 0, 8),
  t('formulaeShop', 'magic', 'Boutique de formules et grimoires', ['magic'], [L, R], 10, 12),
  t('aztlanShop', 'magic', 'Boutique aztèque', ['magic'], [L, R], 20, 12),
  // Miscellaneous
  t('survivalGear', 'misc', 'Materiels-de-survie', ['gear', 'armor', 'containers'], [L], 0, 8),
  // Common goods only: an availability ceiling of 1 keeps the vending machine to what anyone buys
  t('vendingMachines', 'misc', 'Distributeurs-Automatiques', ['gear', 'drugs'], [L], 0, 1),
  t('capsuleHotel', 'misc', 'Marchand-de-sommeil-capsules', ['gear'], [L], 0, 4),
  t('slumCoffinHotel', 'misc', 'Marchand-de-sommeil-taudis', ['gear', 'drugs'], [L, R], 0, 6),
  t('corporateCounter', 'misc', 'Comptoir corporatiste haut de gamme', ['weapons', 'armor', 'electronics', 'gear'], [L, R], 25, 14),
]

/** A template by its key. */
export function vendorTemplate(key) {
  return VENDOR_TEMPLATES.find(template => template.key === key) ?? null
}

/** The accent of a template: its own, else its family's. */
export function templateAccent(template) {
  return template?.accent ?? FAMILY_ACCENTS[template?.family] ?? ''
}

/**
 * The banners of a template among the files of the banner folder: "Prefix-1.webp",
 * "Prefix 2.png", and the whole names of its single images. A WebP is preferred
 * when the same banner is there in both formats. Sorted by name.
 *
 * @param {object} template
 * @param {string[]} files paths, as the file picker lists them
 */
export function templateBanners(template, files) {
  if (!template) return []
  const stem = path => decodeURIComponent(path.split('/').pop()).replace(/\.[^.]+$/, '')
  const ext = path => path.split('.').pop().toLowerCase()
  const numbered = new RegExp(`^${template.banners.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[- ]\\d+$`)
  const byStem = new Map()
  for (const file of files ?? []) {
    if (!['webp', 'png', 'jpg', 'jpeg'].includes(ext(file))) continue
    const name = stem(file)
    if (!numbered.test(name) && !template.extra.includes(name)) continue
    const known = byStem.get(name)
    if (!known || ext(file) === 'webp') byStem.set(name, file)
  }
  // The numbered banners in order, the single images after them: the first is the default choice
  const rank = name => (template.extra.includes(name) ? 1 : 0)
  return [...byStem.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, undefined, {
    numeric: true
  })).map(([, file]) => file)
}

/** The shop settings a template gives a new vendor (`system.shop`). */
export function templateShop(template, {
  label = '', banner = ''
} = {
}) {
  return {
    label,
    template: template.key,
    shelves: [...template.shelves],
    legality: [...template.legality],
    margin: template.margin,
    maxAvailability: template.maxAvailability,
    perShelf: template.perShelf,
    accent: templateAccent(template),
    banner,
  }
}
