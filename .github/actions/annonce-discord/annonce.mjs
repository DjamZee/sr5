// Annonce Discord d'une release GitHub, en embed « shadowtalk ».
// Sert au système (DjamZee/sr5) et peut servir aux modules : tout se règle par variables d'environnement.
//
//   REPO            dépôt GitHub « propriétaire/nom » (défaut : GITHUB_REPOSITORY)
//   TAG             tag de la release à annoncer (obligatoire)
//   MANIFEST        nom de l'asset manifeste : system.json ou module.json (défaut : system.json)
//   WIKI_URL        adresse du wiki (défaut : https://github.com/<REPO>/wiki)
//   USERNAME        nom affiché par le webhook
//   AVATAR_URL      image de l'avatar du webhook
//   THUMBNAIL_URL   vignette de l'embed (vide = aucune)
//   DRY_RUN         « true » : affiche le JSON sans l'envoyer
//   DISCORD_WEBHOOK adresse du webhook (secret ; jamais affichée)
//   GH_TOKEN        jeton pour lire la release (facultatif pour un dépôt public)
//   RELEASE_JSON    chemin d'un fichier JSON de release déjà lu (essais hors ligne)
//   TYPE            « system » (défaut) ou « module » : un module (dépôt privé) n'a aucun lien GitHub dans
//                   l'annonce ; le manifeste et les dépendances viennent de son module.json au tag
//   MODULE_JSON     chemin d'un module.json déjà lu (essais hors ligne ; sinon lu au tag par l'API)

import {
  readFileSync 
} from 'node:fs'
import {
  pathToFileURL 
} from 'node:url'

export const MAGENTA = 0xff00aa
export const LIMITE_DESCRIPTION = 4096
export const LIMITE_EMBED = 6000

export const ACCROCHES = [
  'Paquet frais dans la boîte aux lettres morte. Vérifiez les signatures, chummers.',
  'Le code est tombé du camion. Ne demandez pas lequel.',
  "Mise à jour poussée sur le nœud. Si ça casse, c'est la faute du Johnson.",
  'Notre decker a encore passé la nuit en RV hot sim. Voilà le résultat.',
  'Données extraites, compressées, prêtes à circuler. Faites tourner avant que le GOD ne tombe dessus.',
  'Nouvelles cartes pour la table. Le MJ a déjà aiguisé ses dés.',
  'Une alpha de plus dans la nature. Les plus braves testent, les autres regardent.',
]

// Discord ne rend ni les tableaux ni toujours les titres dans un embed : on les met à plat.
export function versDiscord(markdown) {
  const lignes = String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .split('\n')
  const sortie = []
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]
    const titre = ligne.match(/^\s*#{1,6}\s+(.*?)\s*#*\s*$/)
    if (titre) {
      sortie.push(`**${titre[1].replace(/^\*\*(.*)\*\*$/, '$1')}**`)
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(ligne)) {
      // L'en-tête d'un tableau (suivi de |---|) et la ligne de séparation disparaissent.
      if (/^\s*\|[\s:|-]+\|\s*$/.test(ligne)) continue
      if (/^\s*\|[\s:|-]+\|\s*$/.test(lignes[i + 1] ?? '')) continue
      const cellules = ligne.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean)
      sortie.push(`• ${cellules.join(' · ')}`)
      continue
    }
    sortie.push(ligne)
  }
  return recoller(sortie).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Les notes sont coupées à la main vers 120 colonnes ; Discord garderait ces retours à la ligne.
// On recolle une ligne à la précédente quand les deux sont de la prose du même paragraphe (citation comprise).
const DEBUT_DE_BLOC = /^(\s*$|\s*([-*+•]|\d+[.)])\s|\s*\*\*[^*]+\*\*\s*$|\s*```)/
// Un élément de liste se prolonge sur la ligne suivante ; une ligne vide, un titre ou un bloc de code, non.
const FIN_DE_BLOC = /^(\s*$|\s*\*\*[^*]+\*\*\s*$|\s*```)/
function recoller(lignes) {
  const sortie = []
  let dansCode = false
  for (const ligne of lignes) {
    if (/^\s*```/.test(ligne)) dansCode = !dansCode
    const precedente = sortie.at(-1)
    const citation = /^>\s?/.test(ligne)
    const contenu = ligne.replace(/^>\s?/, '')
    const ouvert = precedente !== undefined && !dansCode && !/^\s*```/.test(precedente) &&
            citation === /^>\s?/.test(precedente) &&
            !FIN_DE_BLOC.test(precedente.replace(/^>\s?/, '')) && !DEBUT_DE_BLOC.test(contenu)
    if (ouvert) sortie[sortie.length - 1] = `${precedente.trimEnd()} ${contenu.trimStart()}`
    else sortie.push(ligne)
  }
  return sortie
}

// Coupe à une fin de ligne sous la limite, ferme un bloc de code resté ouvert et ajoute le renvoi.
export function couper(texte, limite, lienSuite) {
  if (texte.length <= limite) return texte
  const suite = lienSuite ? `\n\n… [suite sur GitHub](${lienSuite})` : '\n\n… _(notes coupées)_'
  let garde = texte.slice(0, Math.max(0, limite - suite.length - 4))
  const finDeLigne = garde.lastIndexOf('\n')
  if (finDeLigne > 0) garde = garde.slice(0, finDeLigne)
  garde = garde.trimEnd()
  if ((garde.match(/```/g) ?? []).length % 2 === 1) garde += '\n```'
  return garde + suite
}

function tailleEmbed(embed) {
  let n = (embed.title ?? '').length + (embed.description ?? '').length
  n += (embed.footer?.text ?? '').length
  for (const champ of embed.fields ?? []) n += champ.name.length + champ.value.length
  return n
}

export function construireMessage(release, options = {
}, hasard = Math.random) {
  const repo = options.repo
  const tag = release.tag_name
  const urlRelease = release.html_url ?? `https://github.com/${repo}/releases/tag/${tag}`
  const manifeste = options.manifest ?? 'system.json'
  const assets = release.assets ?? []
  const lienAsset = nom => assets.find(a => a.name === nom)?.browser_download_url

  const fields = []
  const urlManifeste = lienAsset(manifeste) ?? `https://github.com/${repo}/releases/download/${tag}/${manifeste}`
  fields.push({
    name: '📡 Manifeste', value: `\`${urlManifeste}\`` 
  })
  const zip = assets.find(a => a.name.endsWith('.zip'))
  if (zip) fields.push({
    name: '💾 Téléchargement', value: `[${zip.name}](${zip.browser_download_url})`, inline: true 
  })
  fields.push({
    name: '📖 Wiki', value: `[Changelog et limites connues](${options.wikiUrl ?? `https://github.com/${repo}/wiki`})`, inline: true 
  })
  const pdfs = assets.filter(a => a.name.toLowerCase().endsWith('.pdf'))
  if (pdfs.length) {
    fields.push({
      name: pdfs.length > 1 ? '📄 Documents PDF' : '📄 Rapport PDF', value: pdfs.map(a => `[${a.name}](${a.browser_download_url})`).join('\n') 
    })
  }
  if (release.prerelease) {
    fields.push({
      name: '⚠️ Alpha', value: 'À tester avant une vraie partie : le joueur ou la joueuse sauvegarde son monde avant d\'installer.' 
    })
  }

  const accroche = ACCROCHES[Math.floor(hasard() * ACCROCHES.length) % ACCROCHES.length]
  const embed = {
    title: (release.name || tag).slice(0, 256),
    url: urlRelease,
    color: MAGENTA,
    fields,
    footer: {
      text: `${repo} · ${tag}` 
    },
    timestamp: release.published_at ?? undefined,
  }
  if (options.thumbnailUrl) embed.thumbnail = {
    url: options.thumbnailUrl 
  }

  // L'accroche se présente comme un message de shadowtalk : citation, puis signature.
  const signature = options.username ? `\n> — ${options.username}` : ''
  const notes = versDiscord(release.body) || '_Pas de notes pour cette version._'
  const corps = `> *${accroche}*${signature}\n\n${notes}`
  const place = Math.min(LIMITE_DESCRIPTION, LIMITE_EMBED - tailleEmbed(embed) - 16)
  embed.description = couper(corps, place, urlRelease)

  const message = {
    embeds: [embed], allowed_mentions: {
      parse: [] 
    } 
  }
  if (options.username) message.username = options.username.slice(0, 80)
  if (options.avatarUrl) message.avatar_url = options.avatarUrl
  return message
}

const NOMS_SYSTEMES = {
  sr5: 'Shadowrun 5'
}

// Une relation de module.json est une liste, parfois un objet seul.
const enListe = valeur => (Array.isArray(valeur) ? valeur : valeur ? [valeur] : [])

function decrireRelation(relation, nomDe = id => id) {
  const minimum = relation.compatibility?.minimum
  return `${nomDe(relation.id)}${minimum ? ` ≥ ${minimum}` : ''}`
}

// Annonce d'un module : son dépôt est privé, donc aucun lien GitHub ; on installe par le manifeste
// (Dropbox) écrit dans son module.json au tag de la release.
export function construireMessageModule(release, module, options = {
}, hasard = Math.random) {
  const tag = release.tag_name
  if (!module?.manifest) throw new Error(`module.json sans « manifest » au tag ${tag}`)
  const relations = module.relationships ?? {}

  const systemes = enListe(relations.systems)
    .map(s => decrireRelation(s, id => (NOMS_SYSTEMES[id] ? `${NOMS_SYSTEMES[id]} (${id})` : id)))
  const requis = enListe(relations.requires).map(r => decrireRelation(r))
  const recommandes = enListe(relations.recommends).map(r => decrireRelation(r))
  const dependances = []
  if (requis.length) dependances.push(`**Requis** : ${requis.join(', ')}`)
  if (recommandes.length) dependances.push(`**Recommandés** : ${recommandes.join(', ')}`)

  const fields = [
    {
      name: '📡 Installation', value: `Adresse du manifeste à coller dans Foundry :\n\`${module.manifest}\``
    },
    {
      name: '🎲 Système requis', value: systemes.join('\n') || 'Aucun', inline: true
    },
    {
      name: '🧩 Dépendances', value: dependances.join('\n') || 'Aucune', inline: true
    },
  ]
  if (release.prerelease) {
    fields.push({
      name: '⚠️ Alpha', value: 'À tester avant une vraie partie : le joueur ou la joueuse sauvegarde son monde avant d\'installer.'
    })
  }

  // Une version stable ne parle pas d'alpha, pas même dans l'accroche.
  const accroches = release.prerelease ? ACCROCHES : ACCROCHES.filter(a => !/alpha/i.test(a))
  const accroche = accroches[Math.floor(hasard() * accroches.length) % accroches.length]
  const version = module.version || tag
  const embed = {
    title: `${module.title || module.id || options.repo} ${version}`.slice(0, 256),
    color: MAGENTA,
    fields,
    footer: {
      text: `${module.id || options.repo} · ${tag}`
    },
    timestamp: release.published_at ?? undefined,
  }
  if (options.thumbnailUrl) embed.thumbnail = {
    url: options.thumbnailUrl
  }

  const signature = options.username ? `\n> — ${options.username}` : ''
  const notes = versDiscord(release.body) || '_Pas de notes pour cette version._'
  const corps = `> *${accroche}*${signature}\n\n${notes}`
  const place = Math.min(LIMITE_DESCRIPTION, LIMITE_EMBED - tailleEmbed(embed) - 16)
  embed.description = couper(corps, place, null)

  const message = {
    embeds: [embed], allowed_mentions: {
      parse: []
    }
  }
  if (options.username) message.username = options.username.slice(0, 80)
  if (options.avatarUrl) message.avatar_url = options.avatarUrl
  return message
}

async function lireModule(repo, tag, chemin) {
  if (process.env.MODULE_JSON) return JSON.parse(readFileSync(process.env.MODULE_JSON, 'utf8').replace(/^\uFEFF/, ''))
  const entetes = {
    Accept: 'application/vnd.github.raw+json', 'User-Agent': 'annonce-discord'
  }
  if (process.env.GH_TOKEN) entetes.Authorization = `Bearer ${process.env.GH_TOKEN}`
  const adresse = `https://api.github.com/repos/${repo}/contents/${chemin.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(tag)}`
  const reponse = await fetch(adresse, {
    headers: entetes
  })
  if (!reponse.ok) throw new Error(`${chemin} introuvable au tag ${tag} de ${repo} (HTTP ${reponse.status})`)
  // Un module.json écrit par PowerShell 5.1 peut commencer par un BOM.
  return JSON.parse((await reponse.text()).replace(/^\uFEFF/, ''))
}

// Une étiquette posée avant les liens Dropbox (Topologie et Arts martiaux 0.1.0, 16/10) n'a pas de manifest :
// on prend alors le module.json de la branche principale, s'il annonce la même version.
async function lireModulePublie(repo, tag, chemin) {
  const auTag = await lireModule(repo, tag, chemin)
  if (auTag?.manifest || process.env.MODULE_JSON) return auTag
  const principal = await lireModule(repo, 'HEAD', chemin).catch(() => null)
  if (principal?.manifest && principal.version === auTag?.version) {
    console.log(`module.json sans « manifest » au tag ${tag} : liens repris de la branche principale (même version ${principal.version}).`)
    return principal
  }
  return auTag
}

async function lireRelease(repo, tag) {
  if (process.env.RELEASE_JSON) return JSON.parse(readFileSync(process.env.RELEASE_JSON, 'utf8'))
  const entetes = {
    Accept: 'application/vnd.github+json', 'User-Agent': 'annonce-discord' 
  }
  if (process.env.GH_TOKEN) entetes.Authorization = `Bearer ${process.env.GH_TOKEN}`
  const reponse = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: entetes 
  })
  if (!reponse.ok) throw new Error(`Release ${tag} introuvable sur ${repo} (HTTP ${reponse.status})`)
  return reponse.json()
}

async function principal() {
  const env = process.env
  const repo = env.REPO || env.GITHUB_REPOSITORY
  const tag = env.TAG
  if (!repo || !tag) throw new Error('REPO et TAG sont obligatoires')
  const module = env.TYPE === 'module'
  // À blanc, un module dont le tag n'a pas encore de release s'aperçoit quand même (notes vides).
  const release = await lireRelease(repo, tag).catch(erreur => {
    if (!module || env.DRY_RUN !== 'true') throw erreur
    console.log(`${erreur.message} : aperçu sans notes.`)
    return {
      tag_name: tag, name: tag, prerelease: false, body: ''
    }
  })
  const options = {
    repo,
    manifest: env.MANIFEST || (module ? 'module.json' : 'system.json'),
    wikiUrl: env.WIKI_URL || undefined,
    username: env.USERNAME || undefined,
    avatarUrl: env.AVATAR_URL || undefined,
    thumbnailUrl: env.THUMBNAIL_URL || undefined,
  }
  const message = module
    ? construireMessageModule(release, await lireModulePublie(repo, tag, options.manifest), options)
    : construireMessage(release, options)
  if (env.DRY_RUN === 'true') {
    console.log(JSON.stringify(message, null, 2))
    console.log(`À blanc : rien n'est envoyé (description ${message.embeds[0].description.length} caractères).`)
    return
  }
  if (!env.DISCORD_WEBHOOK) throw new Error('Secret DISCORD_WEBHOOK absent')
  const reponse = await fetch(`${env.DISCORD_WEBHOOK}?wait=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(message),
  })
  // On n'affiche jamais l'adresse du webhook, seulement le statut et la réponse de Discord.
  if (!reponse.ok) throw new Error(`Discord a refusé l'annonce (HTTP ${reponse.status}) : ${(await reponse.text()).slice(0, 500)}`)
  console.log(`Annonce envoyée pour ${tag}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch(erreur => {
    console.error(erreur.message)
    process.exit(1)
  })
}
