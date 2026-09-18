# Web #897 — Dossier source du convertisseur et retour

JP Robbe / OpenAI Codex / jp-robbe-20260918-1412-p2p3-897

## Périmètre

Base web f6297d583c624ada0c2c05457079371dfcac765c ; lot batch/jp-p2p3-ui-20260918.
Le rafraîchissement de main à 91ede920 ne touche aucun fichier de cette unité.
Le format source était déjà affiché ; cette unité traite uniquement la localisation
du dossier depuis les deux convertisseurs, sans explorateur natif distant.

Le bouton utilise getAlbumTracks puis le helper existant dossierDeLAlbum :
un album multidisque rejoint le dossier commun. Les erreurs ou l’absence de
chemin restent dans le convertisseur, avec message explicite et sélection intacte.
Une réponse tardive après démontage ne déclenche pas de navigation. Si un
démarrage de conversion est encore en vol, le départ est empêché.

Le parcours utilise ouvrirLeRepertoire, vueDeRetour et l’écran Répertoires existants.
Un petit module conserve temporairement l’état de chaque convertisseur pendant
ce seul parcours. L’état est consommé une fois au remontage ; une autre destination
l’efface. Sélection, filtre, paramètres et job sont conservés, sans relancer la
conversion. Les capacités sont relues ; V2 vérifie que le preset existe encore.
Le suivi reprend sur le même identifiant. L’ancien intervalle legacy est annulé ;
V2 neutralise son éventuel timeout déjà programmé avec sa garde de vie existante.

Le bouton Retour est aussi disponible à la racine de Répertoires quand une origine
est mémorisée, y compris si browseDirectory échoue (NAS devenu indisponible).
Aucun changement global de ShellV2/navigation.ts, ni politique de conversion.

## Validation

Node22.23.2 sur Shrek ; modules/cache propres ; deux workers au maximum.

19 tests montent ConverterView, ConverterV2 et BrowseView réellement avec les
magasins de navigation. L’API de bibliothèque, capacités et conversion est simulée.
Ils couvrent retour nominal et NAS inaccessible, sélection/filtre/preset/job,
reprise du même statut sans deuxième démarrage, échec HTTP et chemins absents,
réponse source après démontage, navigation tierce, démarrage concurrent,
capacité modifiée/preset retiré et URL de téléchargement déjà préparée.
Le témoin de statut tardif vérifie le DOM du nouveau montage ; il n’isole pas
la garde alive et ne prouve pas à lui seul l’absence de timers survivants.

Commande ciblée :

```sh
npx vitest run src/lib/__tests__/converterFolderReturn897.test.ts --maxWorkers=2
```

Première fixture : un sélecteur legacy erroné (.start-btn) corrigé en .convert-btn.
La suite étendue de 16 cas puis les 19 témoins définitifs sont verts.

Deux contre-épreuves distinctes, tests identiques et compilables :
1. consommerRetourConvertisseur rend null : 9 assertions rouges et 10 témoins verts ; le code reste compilable.
2. seul le nouveau bouton Retour de BrowseView est retiré : vérifie le retour
   lorsque le dossier est inaccessible, avec convertisseurs corrigés : 2 assertions rouges (bouton absent) et 17 témoins verts.
Restauration par cp et contrôle SHA256 des deux productions et du test : 3 empreintes OK après chaque mutation. Ensuite 37/37 ciblés verts (19 nouveaux + 18 existants), sans double comptage :

```sh
npx vitest run src/lib/__tests__/converterFolderReturn897.test.ts src/lib/__tests__/convertisseurFormatOrigine3466.test.ts src/lib/__tests__/localiserSurLeDisque.test.ts --maxWorkers=2
```

Suite complète officielle : nice -n 10 npm test -- --maxWorkers=1.
Six gardes officiels verts, puis 485 fichiers / 5 126 tests verts en 485,60 s.
Les 19 nouveaux témoins sont inclus dans ce total, pas ajoutés. Un seul worker
pour limiter la pression de la machine partagée.
Build final : nice -n 10 npm run build, vert en 1 min 2 s. Warnings préexistants (Svelte, imports dynamiques et tailles de chunks), aucune nouvelle erreur des gardes.
CI complète demandée sur la PR (ci:full), pour le retour Browse partagé.

## Limites

Aucun compte, fichier musical ou convertisseur réel utilisé ; HTTP simulé.
Le chemin montré appartient au serveur Tune. Aucun explorateur OS n’est ouvert.
Les politiques antérieures de conversion et de licence ne changent pas.
Le snapshot n’est pas persistant : rechargement de page et navigation tierce
abandonnent le retour. Pas de recette visuelle ni de validation Windows réelle.
L’issue reste ouverte jusqu’à livraison d’un artefact et acceptation, selon son
commentaire de suivi ; cette PR utilise Refs #897, pas de clôture automatique.

Preuves : /srv/builds/jp-evidence/jp-p2p3-20260918-1412/897.
