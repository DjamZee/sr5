# Réécriture des descriptions longues pour la 1.0 publique

Les descriptions `_GE` de `lang/*.json` héritées de l'amont reprennent le texte des livres (VF BBE, VO CGL). Pour la 1.0
publique, chacune est réécrite au **modèle Chummer** : ce que fait l'objet ou l'état, chiffré, et la page du livre.
Aucune phrase du livre, aucune paraphrase proche.

## Les fichiers

| Fichier | Familles | Clés |
|---|---|---|
| `1a-accessoires-statuts.json` | `Accessory*`, `STATUSES_*`, `Toxin*`, `Anticoagulant*` | 139 |
| `1b-matrice-ci-sprites.json` | `Matrix*`, `Ice*`, `Sprite*` (dont 4 descriptions de sprites) | 80 |
| `1c-train-de-vie-divers.json` | `LifeStyle*`, `LifeStyleZone_*`, `HELP_*` longs, le reste (dont les `_GE` du fork) | 66 |
| `1d-complements.json` | chaînes plus courtes qui partagent une phrase avec un livre (`balayer-livres.mjs`) : résultats de la perception astrale, modificateurs sociaux / de scène / de perception, terrains de poursuite, quelques aides de réglage | 57 |

Pour une étiquette courte (modificateur, terrain), la page va dans `source` seulement : le texte reste une étiquette.
Le cache des livres est en VF : le contrôle contre les livres ne voit que le français ; l'anglais n'est contrôlé que
contre l'ancien texte.

Liste produite par `lister.mjs` : toutes les clés `_GE`, plus les chaînes de plus de 200 caractères reprises telles
quelles de l'amont. **Une session = un fichier** ; personne n'écrit dans `lang/*.json` (c'est `fusionner.mjs`, à la fin).

## Une entrée

```json
"SR5.AccessoryConcealableHolster_GE": {
  "fr": "<p>Se porte à la cheville ou au poignet. +1 au seuil des tests pour repérer l'arme.</p><p><em>SR5 p. 432</em></p>",
  "en": "<p>Worn at the ankle or wrist. +1 threshold to spot the weapon.</p><p><em>SR5 p. 432</em></p>",
  "source": "SR5 p. 432",
  "garder": false,
  "note": ""
}
```

- `fr`, `en` : le nouveau texte, les deux langues. Vides = pas encore fait (le texte actuel reste en place).
- `source` : le renvoi vérifié au livre (mj-sr5), code du livre + page. Il doit aussi figurer dans le texte (« SR5 p. N »,
  « RG p. N », « DT p. N »…) ou, à défaut, ici.
- `garder: true` : garder le texte actuel tel quel. **Seulement pour un texte écrit par le fork** déjà au modèle Chummer
  (le contrôleur refuse `garder` sur un texte venu de l'amont).
- `note` : pour la relecture (arbitrage, doute de page). Pas publiée.

## Les règles

1. **Les noms restent** (DjamZ, 23/10 : « on garde les noms ») : noms d'objets, de sorts, d'états, d'archétypes, de PNJ,
   termes de règle (Puissance, Chance, mark, champ magique, dispersion…). Seul le **texte recopié** est réécrit.
2. Effet mécanique chiffré, conditions en une ligne, page. Pas de fluff, pas d'encart « Sans fil » recopié : on en donne
   l'effet (« Sans fil : +1 au … »).
3. Ni plus ni moins que ce que dit le livre : vérifier chaque chiffre et chaque page avec mj-sr5 (errata > suppléments >
   livre de base). Une valeur que le livre ne donne pas ne s'invente pas.
4. Balises permises : `p`, `br`, `em`, `i`, `strong`, `b`, `ul`, `ol`, `li`, `hr`. Les paramètres `{nom}` du texte
   actuel se gardent tels quels (le code les remplit).
5. Longueur : alerte au-delà de 500 caractères (sans balises), refus au-delà de 900.
6. Vocabulaire VF du projet ; dans l'anglais, les termes du livre anglais.

## Contrôler

```
node tools/ge-1.0/verifier.mjs                      # tous les fichiers
node tools/ge-1.0/verifier.mjs 1b-matrice-ci-sprites.json --detail
```

Refuse : clé absente ou rangée ailleurs, langue vide, pas de « p. N », balise ou paramètre non permis, et **toute
fenêtre de 45 caractères** (minuscules, sans accents ni ponctuation) commune avec **n'importe quel** texte long de l'alpha
(`dc8f88fcd`, les deux langues) ou avec le cache texte des livres de mj-sr5 (`Cache-regles-SR5`, `--livres <dossier>` pour
un autre chemin). Le contrôle ne voit pas une paraphrase proche : la règle 2 la vise quand même.

## Fusionner (Barnabé, à la fin)

`node tools/ge-1.0/fusionner.mjs --sec` puis sans `--sec` : relance le contrôleur, puis remplace ligne à ligne les
valeurs de `lang/fr.json` et `lang/en.json`. Ce dossier ne part pas dans le dépôt public (outil de transition).
