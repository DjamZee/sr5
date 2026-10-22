# Fonts

| File | Font | Licence |
| --- | --- | --- |
| `barlow/Barlow-*.ttf` | Barlow (The Barlow Project Authors) | SIL Open Font License 1.1, `barlow/OFL.txt`. Texte de l'interface : familles CSS `srfoundry_regular`, `srfoundry_bold`. |
| `barlow/BarlowCondensed-Bold-Capitales.ttf` | Barlow Condensed Bold, version modifiée : les minuscules sont dessinées en capitales (`tools/polices/capitales.mjs`, seule la table cmap change) | SIL Open Font License 1.1, `barlow/OFL.txt` (Barlow n'a pas de nom réservé). Titres : famille CSS `srfoundry_primary`. |
| `bruno-ace/bruno-ace-sc.woff2` | Bruno Ace SC (The Bruno Ace Project Authors) | SIL Open Font License 1.1, `bruno-ace/OFL.txt`. Titres secondaires et pause : famille CSS `srfoundry_secondary`. |

Les noms de famille CSS `srfoundry_*` sont gardés : des modules les citent. Les fichiers d'origine (« Shadowrun Foundry »,
licence inconnue) ont été retirés pour la 1.0 publique.
| `audiowide/Audiowide-Regular.ttf` | Audiowide (Astigmatic) | SIL Open Font License 1.1, `audiowide/OFL.txt` (nom réservé « Audiowide », fichier non modifié). Écran de pause seulement : famille CSS `sr5_pause`. |
| `pt-serif/PT_Serif-Web-*.ttf` | PT Serif (ParaType) | SIL Open Font License 1.1, `pt-serif/OFL.txt`. Texte des journaux. |

Le thème SR5 demande la police **Armadura Solid** pour les titres des pages de journal, mais ne la
fournit pas : elle appartient à Graviton et sa licence n'autorise pas la redistribution. Elle n'est
utilisée que si le lecteur l'a installée sur sa machine, sinon les titres gardent la police du thème.
