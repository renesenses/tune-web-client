# Écrans hérités de l'interface actuelle

Ces cinq écrans — et leurs trois satellites — sont montés par la **v2**, mais
ils viennent de l'interface actuelle et n'ont jamais été réécrits à sa manière.

    TvView · OxygenView · BrowseView · AmbianceView · GenreTreeView
    TvVuBars · TvVuMeters · OxygenFacetRail

## Pourquoi un dossier à part

Ils ne sont **plus** dans `src/components/` : l'interface actuelle peut donc
être supprimée sans les emporter (phase 5 du chantier de bascule,
`docs/chantiers/basculer-la-v2-en-v1.md`).

Ils ne sont **pas non plus** dans `v2/`, parce que ce dossier porte dix
contrôleurs de conformité — en-tête partagé, gouttière de grappe, infobulles
sur texte tronqué, densité par niveau, clés de traduction — que ces écrans ne
respectent pas encore. Mesuré le 14/09/2026 : les y placer produisait
**17 gardes rouges**, sur 4 299 lignes à reprendre.

Et ils ne sont **pas** dans `partages/`, qui est réservé à ce que les DEUX
interfaces utilisent. Ceux-ci n'appartiennent qu'à la v2 ; les y ranger
mentirait sur le contenu de ce dossier.

## Ce dossier doit se VIDER

Chaque écran repris à la manière v2 — avec ses règles et ses témoins — quitte
ce dossier pour `v2/`. Le jour où il est vide, il disparaît.

Ce n'est pas une dette cachée : elle est nommée, isolée, et son inventaire
tient en huit fichiers.

## Ce qui les retient aujourd'hui

Relevé en les soumettant une fois aux contrôleurs de `v2/` :

* `AmbianceView` et `GenreTreeView` avaient du **français en dur** — corrigé,
  onze clés × onze langues, elles sont désormais traduites ;
* les dix gardes restantes portent sur la **forme** : en-tête d'écran, réserve
  de gouttière, infobulle sur texte tronqué, densité par niveau.

Aucune ne signale un défaut de fonctionnement : ces écrans marchent, et la v2
les monte déjà depuis des mois.
