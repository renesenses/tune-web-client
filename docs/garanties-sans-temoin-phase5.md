# Garanties restées sans témoin — phase 5

La phase 5 retire l'ancienne interface : `App.svelte`, ses 64 vues et le
drapeau `?v2=0`. Un test qui LISAIT ou MONTAIT l'une de ces vues ne peut pas
survivre à son sujet.

Ce document inventorie ce qui est parti. **Il ne dit pas qu'un fait est faux —
il dit qu'il n'a plus de témoin.**

Mesuré contre `origin/main` : **508 tests retirés**, dans 49 fichiers
supprimés entièrement et 79 fichiers amputés de leur seule partie morte.

Méthode, et pourquoi elle compte : un fichier n'a été supprimé que si PLUS
AUCUN de ses tests ne tenait sans une vue morte. Les autres ont été gardés, et
seuls les tests qui lisaient une vue morte en ont été retirés — une première
passe, trop large, avait jeté 55 fichiers qui testaient aussi des modules
vivants (`purgeOrphelines`, `positionLecture`, `zoneRegardee`…).

---

## Fichiers supprimés (49)

### `accueilInfobulles`
- la feuille globale définit bien une classe de troncature
- les règles propres du tableau de bord sont vues elles aussi
- la section de recommandations tronque avec sa propre règle
- chaque composant du lot tronque bien du texte
- chaque élément tronqué peut se lire au survol
- l'infobulle porte la donnée, pas un libellé d'interface
- un texte coupé à l’intérieur d’un élément déjà pourvu reste exempté

### `bandcampInfobulles`
- le composant tronque bien du texte (sinon ce test ne garde rien)
- chaque élément tronqué porte un title=
- les quatre vues signalées sont couvertes
- le title= porte la valeur affichée, pas un libellé statique

### `bandcampLiaisonAffichee_2778`
- 🔴 l’écran interroge la route d’état de liaison
- 🔴 le formulaire de saisie ne réapparaît plus quand un compte est lié
- le compte lié est NOMMÉ à l’écran, et se change à la demande
- 🔴 chaque album de la collection porte un vrai bouton de lecture
- la pochette résolue par le serveur est affichée
- le lien « Ouvrir sur Bandcamp » reste — on ajoute, on ne retire pas
- le client parle bien onze langues — le hongrois n’existe que côté client
- « ${cle} » est traduite dans les onze
- « linkedAs » porte bien le gabarit {pseudo} partout

### `bibliothequeAjoutsRecents3039`
- la barre d’onglets de la Bibliothèque le porte
- l’ouvrir DEMANDE la fenêtre de quinze jours, liste et résumé
- la règle est ÉNONCÉE, avec la fenêtre en cours
- le décompte compte les DEUX, plus la durée — celui de la capture
- les albums de la fenêtre sont rendus
- « 30 jours » REDEMANDE au serveur, et la liste ET le décompte suivent
- la liste tombe et l’utilisateur est prévenu

### `bibliothequeAleatoireAffordance`
- les deux boutons ont bien été retrouvés dans les sources
- l'en-tête Bibliothèque ne dessine pas le symbole de la bascule de transport
- le glyphe de l'en-tête porte une marque de lecture, absente de la bascule
- il ne se déguise pas en bascule avec aria-pressed
- il ne se déguise pas en bascule avec class:active
- la vraie bascule, elle, conserve son état
- les onze langues sont couvertes par ce test
- ${nom} — ${cle} est renseigné
- ${nom} — ${cle} ne répète pas transport.shuffle

### `bibliothequeUnSeulAscenseur`
- .main-content ne défile pas — les bandeaux s’empilent au-dessus du scroller
- .view-scroller est LE scroller de la vue active, et il peut se rétrécir
- les bandeaux ne volent jamais leur hauteur au scroller
- .library-view met en page mais ne défile pas
- .library-scroller est le seul scroller de la bibliothèque

### `calibrationTruth`
- ne propose plus le faux calibrage par demi-RTT
- affiche explicitement la médiane du RTT de contrôle

### `comptesLocauxBranche`
- SettingsView importe le decideur
- SettingsView derive les deux comptes locaux des stats du serveur
- SettingsView rend le compte local a cote du total
- le total, lui, reste affiche — on nomme les populations, on n'en cache aucune

### `debordementMeilleurResultat849`
- le badge lui-même peut se replier DANS cette carte
- la portée reste LOCALE : QualityBadge n’est pas modifié pour tout le reste
- la colonne du meilleur résultat est bien celle de 300 px qu’on a mesurée
- 🔴 « ${nom} » est FAUX sur l’ancienne feuille

### `etiquetteCreationAtteignable`
- la création a plus d’un point d’appel
- la barre de filtres de la grille d’albums porte un déclencheur de création
- le déclencheur n’est pas conditionné à l’existence d’une étiquette
- la création depuis la barre crée l’étiquette seule, sans assigner d’album
- le champ de la fiche d’album offre une validation visible, pas seulement Entrée

### `etiquetteZoneCreationAncree`
- `.tag-add-wrap` n’est pas une règle morte : le balisage l’emploie
- le bouton « + Tag » et la zone de création vivent dans ce conteneur
- `.tag-add-wrap` reste le bloc de référence — sinon le défaut revient
- `.tag-picker` reste positionné en absolu sous son ancre

### `ficheAlbumListeEtrangere3178`
- la fiche de l’album suivant ne porte AUCUNE piste de l’album d’avant
- l’échec est DIT, au lieu de laisser un écran muet
- la fiche garde l’album ouvert quand la requête d’avant se dénoue
- une liste posée pour un AUTRE album n’est jamais rendue

### `fixedVolumeConfirmationGuard`
- l’accord « 100 » précède le PATCH et lui seul crée le témoin
- le client API omet le témoin tant qu’il n’a pas été confirmé

### `gestesServiceCoquilleV1_888_931_869`
- elle ARME les gestes à son montage — le magasin ne reste plus null
- 🔴 le lien ALBUM ouvre la fiche Qobuz, et non la recherche
- 🔴 le lien ARTISTE résout le NOM chez le service, puis ouvre sa fiche
- repli EXPLICITE : service muet, on revient à la recherche — le geste d’avant
- contrôle : coquille NON armée, les deux entrées sont ABSENTES
- 🔴 coquille actuelle MONTÉE : les deux entrées apparaissent
- 🔴 « Aller à l’album » du menu ouvre bien l’album QOBUZ de la piste

### `greffonRedemarrageAnnonce3662`
- ne s'affiche pas quand le serveur dit qu'aucun redémarrage n'est nécessaire
- s'affiche quand le serveur dit qu'un redémarrage est nécessaire

### `imageSansSource201`
- 🔴 `artworkUrl` rend une chaîne VIDE — c’est la source du défaut
- 🔴 `artworkSrc` rend `undefined` — Svelte omet alors l’attribut
- et rend la MÊME adresse quand la pochette existe
- la garde voit bien quelque chose
- aucun attribut `src` n’appelle `artworkUrl` directement
- le balayage couvre `src/App.svelte`, hors de `src/components/**`
- aucune valeur pouvant être vide n’atteint un attribut `src` sans garde
- voit l’appel DIRECT dans l’attribut, gardé ou non
- voit le passage par une FONCTION locale non gardée
- voit le passage par un `$derived` et par une variable d’état non gardés
- acquitte le passage indirect quand un `{#if}` englobant parle de la donnée
- laisse passer `artworkSrc`, qui rend `undefined`
- ne confond pas `artworkUrl600` (champ iTunes) avec un appel à `artworkUrl`
- aucun composant ne garde la fonction à portée de main pour rien

### `interactionsBibliothequePerdues`
- la feuille ne vise cette icône que par les sélecteurs examinés ici
- est visible au doigt : opacité non nulle sans aucun survol
- reste discrète au repos et pleine au survol
- la feuille ne vise cette pastille que par les sélecteurs examinés ici
- ne capte pas le doigt tant qu'elle est invisible
- redevient cliquable dès que le survol la révèle
- la grille virtuelle des albums épingle ses colonnes sur le calcul JS
- la grille virtuelle par année épingle les siennes de la même façon

### `interfaceChoisie`
- `?v2` monte la future, même sans rien de mémorisé
- `?v2=0` ramène à l’actuelle MÊME si la future est mémorisée
- elle l’emporte dans les deux sens
- sans paramètre, le choix mémorisé décide
- sans choix ni paramètre, la FUTURE v1 (phase 4)
- un « actuelle » mémorisé tient CONTRE le nouveau défaut
- un stockage refusé ne fait pas d’exception et suit le défaut
- depuis l’interface actuelle, l’adresse ne change pas : il FAUT recharger
- depuis la future v1, le `?v2` disparaît et l’adresse change
- les autres paramètres survivent

### `lectureSuivanteStreamingConfirme`
- un enfilage réussi affiche un toast de succès, après l'ajout
- un échec ne reste pas muet non plus
- une zone absente ou une piste sans source_id se dit, au lieu de sortir en silence
- le second clic est désarmé tant que le premier n'a pas répondu
- la bibliothèque locale, elle, confirmait déjà — et continue

### `logoBarreReduite`
- la ligne du logo ne déborde pas des 52px réellement disponibles
- l'image du logo ne se laisse pas écraser par la ligne flex
- la combinaison qui rend le débordement invisible est bien celle décrite
- « Quoi de neuf » garde un point d'entrée quand son bouton est masqué

### `menuPisteCoherence`
- une piste de l'onglet « Titres » porte un menu « … »
- le menu de l'onglet « Titres » offre les sept actions praticables
- « Autres versions » reste absente faute de panneau pour l'afficher
- les rendus multi-disque et mono-disque montent chacun un menu
- les deux rendus offrent EXACTEMENT les mêmes actions
- aucun menu ne propose « Aller à l'album » vers l'album déjà ouvert
- couvre bien onze langues
- search.addToQueue = queue.addToQueue — ${langue}

### `mobileStreamingSelector`
- reste utilisable dans la largeur où la barre latérale disparaît
- ne propose que les services actifs et mène aux réglages si la liste est vide
- ne renvoie plus vers une barre latérale absente dans aucune langue

### `perZoneGaplessPromise.i18n`
- le bloc contient bien les contrôles que l'intitulé peut nommer
- ${code} : l'intitulé promet le gapless si et seulement si le bloc l'offre

### `pisteModifieeRelue3638`
- écrit bien la modification par PUT /library/tracks/{id}
- RELIT la piste après avoir écrit, et dans cet ordre
- remet à l'appelant une PISTE, pas l'accusé de réception du serveur
- relit aussi quand SEULES les métadonnées étendues ont changé
- ne relit RIEN quand rien n'a changé — pas de requête inutile

### `pluginsRailCategories`
- le rail ne se cale plus sur une constante en pixels
- le décalage est posé en ligne, à la hauteur MESURÉE de l'en-tête
- le titre du rail passe par la traduction, dans les onze langues
- la garde lit les déclarations analysées, jamais les commentaires

### `podcastsInfobulles914`
- expose les titres complets et auteurs, avec coupe verticale et horizontale
- ne répète pas les textes courts et n’ajoute pas de point de tabulation
- couvre abonnements, nouveaux épisodes et titre dans la fiche
- réévalue la coupe au redimensionnement puis le titre après changement de pays
- retire la bulle clavier et les observateurs au démontage

### `porteeRepertoireEcranMonte3101`
- l’écran DEMANDE le dossier au serveur
- 🔴 il n’affiche PAS la bibliothèque entière sous la pastille
- la bibliothèque entière ne reste PAS à l’écran, et l’échec est dit
- elle retire la portée, et la grille se remplit à nouveau

### `quoiDeNeufLangue906`
- 🔴 l’appel porte `lang`
- la langue vient du MAGASIN, pas d’une constante
- la valeur est ÉCHAPPÉE — une locale ne se concatène pas crue dans une URL
- 🔴 `fallback` est lu, entrée par entrée
- et il a un site de rendu — sans quoi il ne servirait à rien
- le bandeau est distinct de l’erreur hors ligne
- le message existe dans les onze langues
- l’appel d’avant ne portait aucune langue

### `radiosRefusUrlAffiche`
- les deux zones de message sont remises à zéro avant chaque tentative
- le message affiché est celui du serveur, pas un texte fabriqué ici

### `rechercheComptesAlbumsArtistes3623`
- affiche le VRAI total du serveur, pas la longueur de la page
- offre une suite, et la demande au bon rang
- le vrai total est affiché à côté du titre
- le bouton découvre d’abord ce qui est DÉJÀ reçu, sans rien demander
- puis va chercher la page suivante quand tout le reçu est montré
- charger la suite des pistes ne fait pas sauter cinquante albums
- une nouvelle recherche remet les trois rangs à zéro

### `rechercheCreerPlaylist3191`
- le bouton existe dans la section Pistes
- il crée la liste, PUIS y range les pistes affichées
- un dialogue annulé n’écrit RIEN
- le message annonce le nombre enregistré ET le nombre de correspondances
- quand tout est affiché, le message ne parle QUE du nombre enregistré
- les pistes de service, sans identifiant local, ne sont pas enregistrées
- la création qui échoue ne laisse pas croire à un enregistrement

### `rechercheDureeTotale3190`
- elle apparaît, et vaut la somme des pistes RENDUES
- elle s’écrit NUE quand tous les résultats sont affichés
- quand la liste est une page, la durée DIT qu’elle ne couvre que l’affiché
- une durée nue ne peut pas se glisser sous un compteur tronqué
- aucune durée quand la recherche ne rend aucune piste

### `reglagesZonePanneauUnique920`
- 🔴 les TROIS réglages y sont
- chacun passe par une route, aucun n’est décoratif
- 🔴 `updateZoneGapless` existe — elle n’avait AUCUN écrivain
- les trois affichent ce que le SERVEUR répond, pas ce qu’on lui a demandé
- 🔴 un échec REMET le contrôle où il était
- il est réservé aux zones locales, et le dit pour les autres
- le dialogue de confirmation n’est PAS recopié
- le sélecteur DSD reprend les libellés de Réglages
- CONTRE-ÉPREUVE : le panneau d’AVANT est bien refusé

### `renvoiPluginsBandcamp.i18n`
- les onze langues sont couvertes par ce test
- ${nom} ne présente plus Plugins comme un sous-niveau
- ${nom} nomme la rubrique par interpolation
- ${nom} traduit nav.plugins
- la vue interpole {rubrique} depuis nav.plugins
- la vue offre un accès cliquable à la rubrique Plugins

### `retourDefilementListes`
- forme fautive — ne rien mémoriser repose la liste en haut
- forme corrigée — mémoriser depuis la liste garde la position
- mémoriser SANS garde se fait détruire par un appel depuis la fiche
- importe le mécanisme partagé
- le conteneur `.playlists-body` est référencé
- `selectPlaylist` mémorise, sous garde
- `selectStreamingPlaylist` mémorise, sous garde
- `goBack` rétablit
- importe le mécanisme partagé
- le conteneur `.podcasts-view` est référencé
- `selectPodcast` mémorise, sous garde
- `goBack` rétablit
- `openCollection` mémorise, sous garde
- le bouton Retour rétablit la position de la liste
- la clé du retour de vue (#1215) reste DISTINCTE de celle de la liste

### `retourHistoriqueBibliotheque`
- forme fautive — le poussoir redondant demande DEUX appuis
- forme corrigée — une seule entrée, donc UN appui
- le premier appui de la forme fautive est bien un appui MORT
- la fiche artiste souffre du même appui mort
- l’entrée jumelle porte le même `albumId` — d’où l’appui sans effet
- `selectAlbumDetail` ne pousse plus d’entrée d’historique
- `selectArtistDetail` ne pousse plus d’entrée d’historique
- la raison reste écrite sur place, pour ne pas la remettre
- la fiche album a sa propre adresse `#album/{id}`
- la fiche artiste a sa propre adresse `#artist/{id}`
- le retour à la grille remplace l’entrée au lieu d’en empiler une

### `serveurMediaJoignable`
- consomme le champ reachable réellement émis par le serveur
- ne déclare indisponible que le false explicite, sans inventer l ancien contrat

### `serveurMediaSeptRayons2971`
- 🔴 elle en peint SEPT, pas cinq
- elle suit l’ordre et les libellés de `RAYONS_TUNE`
- cliquer « Années » DEMANDE le conteneur `years` au serveur
- cliquer « Listes de lecture » DEMANDE le conteneur `playlists`
- un serveur tiers n’en reçoit aucun — on ne connaît pas sa racine

### `shutdownErrorHonesty`
- un refus HTTP réarme le bouton et affiche la cause
- une coupure de transport reste compatible avec une machine déjà éteinte

### `sidebarBandcampSource`
- est rendu UNE seule fois
- est dans « Sources », après le début de cette section
- n'est plus dans « Navigation »
- reste masqué quand le plugin est absent

### `smartCollectionLimite`
- l’éditeur relit la borne sauvegardée sous max_limit, pas max_albums
- l’éditeur enregistre sous le nom qu’il relit
- le type SmartCollection suit la réponse réelle du serveur
- le résumé des règles accepte le tableau que le serveur renvoie

### `streamingFavoritesContext`
- le double-clic et le bouton transmettent tous deux l index de la liste
- aucune action des favoris ne retombe sur la lecture d une piste isolée

### `streamingFeaturedGate`
- loadFeatured existe et son corps est délimitable
- les intitulés ne sont pas publiés avant les données
- intitulés et données sont affectés ensemble, sous la garde service === s
- le drapeau de chargement ne retombe que pour le service affiché

### `streamingNavGuard`
- le corps de la remise à zéro est appelé sous untrack
- untrack est importé depuis svelte
- resetForService efface bien la navigation par genre
- les chargeurs restent DANS le corps untracké, pas dans l’effet

### `terminologieEqMesure`
- le profileur à l'oreille ne mesure rien — sa réinitialisation ne doit promettre aucune mesure
- la correction FIR part bien d'une mesure — elle doit continuer à le dire
- le bouton « Réinitialiser » du profileur ne touche effectivement à aucune mesure

### `transportRecalageGuard`
- l’annonce en direct d’une autre télécommande est lue
- le commentaire périmé « ni /zones ni /zones/{id} ne les portent » a disparu

### `typeDeZoneSonosFantome`
- « sonos » n’est pas offert comme type de zone
- aucun sélecteur d’enceintes Sonos ne subsiste dans la modale
- tout autre type proposé est routable par le serveur

### `volumeCentPourCentDistinct`
- le test couvre bien onze langues
- ${code} — les deux libellés ne se lisent pas pareil
- ${code} — chaque aide porte plus qu'une phrase de rappel
- ${code} — le réglage de zone ne se confond pas avec le défaut global
- ${code} — l'aide de la case par appareil renvoie au réglage global
- ${code} — l'aide du réglage global renvoie à la case par appareil
- ${code} — le réglage global est nommé par son DÉCLENCHEUR
- ${code} — la case par appareil est nommée par sa PORTÉE
- la case par appareil garde son libellé et son aide
- le réglage global garde son libellé et son aide

### `chargementPistesStreamingEcran`
- selectAlbum passe par le chargeur borné, et n’attend plus l’API à nu
- le catch muet a disparu des quatre chargeurs de fiche
- l’échec vide la liste au lieu de garder les pistes de la fiche d’avant
- l’échec est DIT : motif à l’écran et bandeau
- la borne est finie, et passée au chargeur
- une réponse périmée ne touche ni aux pistes ni au témoin
- quitter une fiche en cours de chargement annule sa demande
- les trois fiches ont bien DEUX sorties dans le gabarit
- le bloc d’erreur propose de relancer la fiche affichée

---

## Tests retirés de fichiers conservés (79)

### `albumsDistincts` — 4 sur 18
- la liste des groupes passe par le filtre des arbitrages
- le compteur dérive de la liste filtrée, pas des groupes bruts
- les paires audio du scan priment sur le repli par nom (#670)
- un arbitrage posé par erreur est révocable depuis l'écran

### `ancrageEnTetes925` — 7 sur 12
- porte bien position:sticky avec un offset et un fond opaque
- 🔴 n’a AUCUN ancêtre bloquant entre lui et son conteneur de défilement
- AlphaIndex expose un offset réglable, à zéro par défaut
- .${zone} décale le rail de ${variable}
- les deux bandes épinglées ont une hauteur ARRÊTÉE
- la rangée de modes est épinglée à la hauteur de la bande du titre
- la bande du titre réserve exactement cette hauteur

### `annonceSlimproto3809` — 12 sur 22
- la case existe et suit le serveur
- décocher ENVOIE `slimproto_discovery_enabled: false`
- 🔴 le serveur dément le clic ici aussi
- rien n’est annoncé tant que l’utilisateur n’a rien changé
- ShellV2 : l’avis apparaît dès que le choix est posé
- coquille actuelle : le même avis
- ShellV2 : le serveur a appliqué à chaud, donc AUCUN avis
- coquille actuelle : même silence quand le serveur a appliqué
- le champ ABSENT vaut « serveur antérieur », pas « appliqué »
- seul un `true` franc compte comme appliqué
- le nom du champ est celui que le serveur écrit, à la lettre
- l’avis existe dans les onze langues

### `appareilsIgnores` — 7 sur 16
- la croix de la liste des appareils réseau appelle handleIgnoreDevice
- l'écran n'appelle plus api.deleteDevice, qui n'oublie qu'en mémoire
- handleIgnoreDevice passe par api.ignoreDevice
- l'écran lit GET /devices/ignored — la SEULE vue qui les annonce encore
- chaque ligne offre le retour en arrière
- débloquer est un DELETE sur la MÊME adresse que le blocage
- la section dit son vide plutôt que de disparaître

### `audioNavigateurV2_1171` — 2 sur 10
- l’ancienne aussi, et par le MÊME module
- 🔴 aucune des deux ne garde sa propre copie de la règle

### `audiophileGlobalScope.i18n` — 1 sur 3
- les réglages distinguent le défaut global et les trois choix par zone

### `backendsAudioPlateforme` — 5 sur 19
- « Auto » se traduit, la parenthèse est un nom propre et reste
- aucune option WASAPI ou ASIO codée dans le gabarit
- le sélecteur boucle sur la liste du serveur
- le repli « wasapi » de la valeur retenue a disparu
- le libellé « Mode WASAPI » n’est plus du texte en dur

### `badgeUpnp` — 1 sur 6
- SearchView ne fabrique pas non plus de provenance 'local' par défaut

### `bandcampFileDAlbum_2702` — 4 sur 12
- 🔴 `ecouter` passe par `corpsDeLectureBandcamp`
- 🔴 `ecouter` n’envoie PLUS la piste distante seule à `playAndSync`
- `jouer_collection` existe et passe par `corpsDeLectureCollection`
- la mise en FILE d’une piste seule reste ce qu’elle était

### `basculeTelemetrie3383` — 7 sur 12
- la bascule lit la réponse du serveur au lieu d’inverser son booléen
- le rafraîchissement du statut passe par la même décision
- la case est inerte quand l’exploitant a verrouillé la machine
- les trois clés existent partout et ne sont pas vides
- l’intitulé ne promet plus l’anonymat — un server_id persistant est envoyé
- l’écran dit ce que le refus coupe EN PLUS, et ce qu’il ne coupe pas
- les deux hints sont affichés, pas seulement traduits

### `bibliothequeVivante` — 1 sur 3
- 🔴 ce que l'ancien client écoute, la v2 doit l'écouter aussi

### `champsRadio870` — 1 sur 9
- v1 : `saveEdit` ne bâtit plus son objet à la main

### `collectionAlbumIndex` — 1 sur 4
- est réellement branché dans la grille, pas seulement calculé hors écran

### `contexteArtisteALaLecture2442` — 2 sur 5
- « Toutes les pistes » envoie context_type=artist avec les pistes
- « Lecture aléatoire » l’envoie aussi — c’est le même artiste demandé

### `dspAppliedLiveGuard` — 3 sur 5
- chaque appel d’écriture capture la réponse du serveur
- la portée est effectivement signalée pour chaque champ rendu
- signalerPortee distingue « faux » de « absent »

### `dynamicRangeProvenance1388` — 3 sur 14
- DÉDUITE : « DR ~12 », marquée, et l’infobulle parle de la moyenne
- les deux cas ne se ressemblent PAS — c’est tout l’objet du contrat
- ABSENTE : aucun badge, comme avant

### `enrichissementApresScan` — 1 sur 4
- branche le contrat sur library.scan.completed au lieu de toujours afficher « Prêt »

### `enTetesAncres2112` — 4 sur 6
- l’en-tête et la recherche sont hors de `.ms-body`, qui porte la liste
- l’en-tête est hors de `.playlists-body`, qui porte la liste
- les trois lignes du haut vivent dans la MÊME barre ancrée
- ce qui défile reste EN DEHORS de la barre ancrée

### `eqPrereglages` — 1 sur 14
- l’écran Égaliseur non plus

### `etatWifiAppliance1260` — 1 sur 11
- les DEUX écrans Réglages passent par etatWifi, plus par la longueur de la liste

### `exclusifSuitLeServeur4184` — 1 sur 2
- ancienne interface : la bascule de backend lit la réponse du PATCH

### `favoriPlaylistQobuz` — 2 sur 13
- pose un HeartButton de type playlist sur la fiche
- désigne la playlist par son identifiant de service, pas par son rang

### `forcerImagesArtistes` — 2 sur 9
- le bouton existe dans les réglages et appelle cette fonction
- le bouton porte toujours son title

### `historiqueEcoutesV2_889` — 2 sur 13
- l’ANCIENNE coquille passe par la même fonction — elles ne divergeront plus
- le module reste le SEUL décideur : aucune coquille ne refiltre le type

### `historiqueV2` — 1 sur 10
- la logique est PARTAGÉE avec le client actuel, pas recopiée

### `identiteAppareilEffacee3660` — 1 sur 9
- la coquille actuelle le monte (DevicesSettings, onglet Appareils)

### `infobullesQuatreVues914` — 1 sur 4
- chacune porte bien l’action, et non un `title=` écrit à la main

### `langueAuDemarrage` — 1 sur 7
- 🔴 les DEUX coquilles le font, chacune pour elle-même

### `lectureEnMasse1947` — 1 sur 19
- la fiche d’album du client actuel a une « lecture aléatoire »

### `licenceGraceVisible` — 3 sur 11
- affiche la bannière et la règle chiffrée
- réserve le ton d’avertissement à la fenêtre réellement écoulée
- n'affiche aucune donnée de licence dans la bannière

### `listesInfobulles2411` — 11 sur 13
- 🔴 le titre coupé porte son infobulle DANS LE DOCUMENT, et elle dit la DONNÉE
- 🔴 le focus AU CLAVIER ouvre la bulle — ce que le `title` natif ne fait jamais
- 🔴 le focus pris à la SOURIS n’ouvre rien — pas de doublon avec la bulle native
- aucun `tabindex` n’a été fabriqué sur les textes eux-mêmes
- 🔴 la piste ouverte porte titre ET artiste en infobulle
- 🔴 le focus clavier sur la ligne de piste ouvre la bulle
- 🔴 onglet Pistes : le titre et la ligne de méta portent leur infobulle
- 🔴 onglet Albums : titre et artiste de la vignette
- 🔴 onglet Artistes : le nom de la vignette
- 🔴 onglet Labels : la valeur de facette
- ⚠️ ces vignettes ne sont atteignables par AUCUNE tabulation — et on ne leur en fabrique pas

### `logoVersLeForum1116` — 3 sur 6
- la référence lue dans l'ancienne coquille est bien le forum, en nouvel onglet
- cette ancre mène à la même URL que l'ancienne barre
- elle s'ouvre comme l'ancienne : nouvel onglet, et sans fuite d'origine

### `miniLecteurOuverture` — 6 sur 10
- garde son minuteur malgré le flot de mises à jour du serveur
- branche le suivi partagé sur la zone courante
- remplace le titre pendant l'ouverture, au lieu d'annoncer « aucune lecture »
- le dit aussi aux technologies d'assistance
- porte une animation subtile, retirée si l'utilisateur refuse le mouvement
- n'invente aucune clé : `zone.buffering` existait, morte, dans les 11 langues

### `modulesDeSortiePanneau` — 2 sur 13
- Diagnostics (client actuel) le monte sous le titre « Modules de sortie », derrière `{#if}`
- Tune Health (nouveau client) le monte aussi, sur la même route

### `motifEchecCreationProfil` — 1 sur 9
- 🔴 le sélecteur n’ignore plus le résultat

### `motifEchecEq` — 6 sur 18
- aucun `catch` ne jette sa raison
- le lecteur de `catch` en trouve bien plusieurs
- passe par le classement partagé des motifs
- ne trie plus les refus sur le seul message
- un 402 reçu lève un bandeau permanent
- dit quand la liste des presets ne vient pas du serveur

### `murOxygen994` — 1 sur 6
- le libellé existe dans les onze langues, et le sélecteur de l’ancienne coquille aussi

### `niveauxTraceDesMasques1617` — 4 sur 15
- annonce le nombre de réglages masqués et offre le geste
- ne rend RIEN quand rien n'est masqué (pas de bruit permanent)
- ne rend rien non plus au niveau expert : il n'y a plus de cran au-dessus
- le clic demande le niveau qui révèle le réglage — expert, pas intermédiaire

### `nomFonctionnaliteLicence798` — 2 sur 7
- la grille de licence passe par le traducteur
- et n’affiche plus `display_name` nu

### `onboardingRequis` — 2 sur 11
- la coquille actuelle le monte
- la règle n’est écrite qu’UNE fois

### `oxygenBadgeEtFocus_977_978` — 1 sur 10
- l’ancienne coquille le lit toujours — on n’a rien déplacé

### `paliersDsdFiltre1074` — 1 sur 13
- l'ancienne interface passe par le même nommage

### `parolesEnLigneNiveauDebutant` — 1 sur 5
- et chaque ligne de la section porte sa propre garde de niveau

### `partagePlaylistEtImport` — 1 sur 13
- est bien celui que l'écran appelle

### `plusDeV2DansLUI` — 3 sur 5
- ⚠️ …mais le filet `?v2=0` est TOUJOURS là
- 🔴 « Actuelle » nommait l ANCIENNE — or la nouvelle est le défaut
- les deux libellés sont traduits partout, et distincts

### `pochettePodcastMorte203` — 3 sur 4
- 🔴 chaque `<img>` de pochette apprend son échec
- 🔴 et l’`onerror` reçoit l’adresse BRUTE, pas celle qui est affichée
- une adresse vue en échec disparaît de l’affichage

### `porteeAleatoire882` — 1 sur 11
- l’écran actuel passe par la MÊME règle — plus deux constructions

### `porteeRepertoire3101` — 5 sur 16
- Répertoires ÉCRIT le magasin ; les deux clients le LISENT en dérivé
- v1 : le chargement automatique dépend de la portée et de `listeARecharger`, plus de « magasin vide »
- v1 : les trois chargements scopés VIDENT la liste et PRÉVIENNENT en cas d’échec
- v1 : les listes écrites portent la portée sous laquelle elles l’ont été
- v1 : la croix de la pastille passe par le magasin, pas par un état local

### `positionLecture954` — 1 sur 14
- l’ancienne coquille garde sa propre remise à zéro

### `purgeOrphelines` — 3 sur 17
- la phrase « les fichiers sont saufs » n’est jamais omise
- la réponse du retrait n’est plus jetée
- l’échec du retrait ne meurt plus dans la console

### `qualiteStreamingRetiree` — 1 sur 4
- aucun des deux écrans ne rend le sélecteur

### `radioGenres` — 4 sur 13
- la source est bien celle de la page Radios
- la liste des rayons ne se dérive plus d'un Set de chaînes brutes
- le filtre compare des clés de rayon
- les pastilles affichent un libellé traduit

### `rechercheFedereePlafond764` — 1 sur 5
- les deux écrans de recherche COMPLETS prennent le défaut

### `refusHomebrewRendu` — 5 sur 6
- client actuel : la commande et l’avertissement de divergence sont dans le DOM
- client actuel : une mise à jour NORMALE n’affiche rien de tout cela
- client v2 : la commande atteint l’écran elle aussi
- client v2 : une mise à jour NORMALE n’affiche rien de tout cela
- la phrase suit la langue de l’écran, pas celle du serveur

### `refusModuleSortie` — 9 sur 14
- nomme le module, dit que l'installation n'est pas en cause, et dit où cliquer
- n'affiche JAMAIS le code technique à l'écran
- distingue « compte non relié » de « module non possédé » : ni le même texte, ni la même action
- l'URL d'achat vient du serveur et n'est jamais inventée
- prévient même sur un code de refus inconnu, plutôt que de se taire
- ne rend AUCUN bandeau quand le module est possédé, même sans appareil trouvé
- l'écran des ZONES lit `output_providers` et monte le bandeau
- l'écran Diagnostics monte le même bandeau, sans requête supplémentaire
- le bandeau est hors du bloc « aucune zone » : il prévient, il ne se masque pas

### `reglagesParZoneOngletAudio` — 4 sur 6
- la recherche sait voir les deux onglets en jeu (témoin)
- le bloc « Réglages par zone » se rend sous l'onglet Réseau / Audio
- le décalage des paroles voyage avec sa carte de zone
- plus aucune clé « services.perZone… » ne subsiste

### `retourCollectionArtiste` — 7 sur 22
- le gestionnaire s’en remet à `reconcilierFiche`
- la règle « nettoyer sans jamais rétablir » a bien disparu
- le vidage, lui, est CONSERVÉ — la fiche fantôme de Safari
- le rechargement ne ré-empile pas d’entrée d’historique
- une fiche périmée n’est pas plaquée sur un écran que l’utilisateur a quitté
- `navigateToAlbum` mémorise la collection ouverte
- le montage la ré-ouvre

### `retourConteneurDefilant` — 2 sur 12
- App.svelte mémorise la position sur le conteneur qui défile
- LibraryView restaure la liste sur le conteneur qui défile

### `retourHistoriqueFiche` — 2 sur 10
- App.svelte décide par `opPourFiche` au lieu d’un `replaceState` inconditionnel
- le goBack() de LibraryView annonce le retour

### `retourVueArtisteScroll` — 3 sur 6
- la règle est importée depuis le module partagé
- la capture de `savedArtistScrollTop` est gardée par la règle
- la capture du défilement des genres est gardée elle aussi

### `sessionExpiree_1021` — 5 sur 7
- coquille ACTUELLE (App.svelte)
- coquille V2 (ShellV2)
- l’écran courant survit dessous : le calque ne REMPLACE pas l’interface
- une reconnexion réussie retire le calque
- les DEUX coquilles montent le calque

### `smartCollectionV2` — 1 sur 28
- les DEUX éditeurs savent le saisir

### `supportSystemeV2` — 1 sur 12
- les deux écrans partagent le MÊME générateur

### `triDynamicRangeV2` — 1 sur 6
- l’écran ACTUEL l’a bien — c’est la référence de la parité

### `uniformitePiste1848` — 1 sur 11
- la Bibliothèque a gagné « Lire ensuite » sur ses trois menus

### `v2OuvrirTicket` — 1 sur 6
- celles du client actuel aussi, désormais

### `verrouVolumeBadgeAppareil` — 10 sur 15
- hérité ACTIVÉ : la zone n’a pas de réglage, le général verrouille
- hérité DÉSACTIVÉ : pas de surcharge, le général ne verrouille pas
- SURCHARGÉ à « activé » : la zone décide, contre un général à l’arrêt
- SURCHARGÉ à « désactivé » : la zone échappe à un général qui verrouille
- elle passe par le module de décision, pas par un calcul local
- elle ne rejoue jamais l’héritage `surcharge ?? global` côté client
- le badge reste en LECTURE SEULE : aucun contrôle sur la carte
- un état inconnu n’affiche rien du tout dans le gabarit
- ${locale} : les cinq clés existent et ne sont pas vides
- la formulation dit « verrouillé » et « libre », pas la même chose deux fois

### `versionsPiste` — 2 sur 10
- les deux montages de la fiche d'album reçoivent onOtherVersions
- l'action déplie une ligne sous la piste, elle ne navigue pas

### `viderLaSuite1085` — 3 sur 8
- 🔴 `keep_current` a sa propre branche, AVANT celle qui arrête tout
- cette branche recharge la file et ne remet RIEN à zéro
- la branche d'arrêt, elle, garde ses remises à zéro

### `zoneDansHistorique1739` — 1 sur 6
- l’écran ACTUEL l’affichait déjà — c’est la référence de Fabien

### `zoneInitialeV1` — 1 sur 13
- l interface actuelle aussi

### `zoneRegardee` — 1 sur 9
- ne vide plus le cache de file sans condition

### `porteeRepertoireAleatoire` — 5 sur 10
- lit `scopedFolder` — la variable qui porte la pastille
- passe bien la portée de l'écran à la règle
- la branche « genre parent / sans genre » est gardée par `!scopedFolder`
- `scopedFolder` compte comme une portée pour le libellé et pour l’infobulle
- le libellé et l'infobulle lisent la MÊME expression

### `radioFranceSource` — 2 sur 7
- consulte la configuration au lieu de provoquer le refus
- n'appelle plus loadRfShows sans condition à l'ouverture de l'écran

### `rechercheContexte` — 8 sur 12
- enregistre un instantané de sa requête à chaque changement
- relit cet instantané à son montage, via la décision isolée
- annonce la recherche globale comme provenance en ouvrant un album de service
- annonce la même provenance en ouvrant une fiche artiste de service
- selectArtist n'efface plus la provenance sans condition
- selectArtist accepte de conserver la provenance de l'écran d'appel
- l'entrée par un autre écran conserve la provenance
- la restauration de position conserve elle aussi la provenance

### `rechercheTotaux` — 2 sur 11
- le compteur des pistes n'est plus la longueur de la liste
- un « voir plus » demande la suite locale par offset

### `streamingRetour` — 5 sur 11
- selectAlbum ne vide plus le niveau artiste sans condition
- selectAlbum accepte de venir d'une fiche artiste
- la discographie de l'artiste ouvre les albums en gardant son niveau
- goBack s'en remet à actionRetour plutôt qu'à ses propres conditions
- actionRetour est bien importé par le composant

### `streamingRetourRestauration` — 4 sur 11
- restaurerContexte existe toujours
- restaurerContexte s'en remet à etapesDeRestauration
- restaurerContexte ne rouvre plus l'album en écrasant l'artiste
- etapesDeRestauration est bien importé par le composant

### `suiviPisteEnCours` — 4 sur 14
- consomme la décision partagée au lieu de la réécrire sur place
- #1096 : ne recharge plus la file entière sans condition
- #1096 : prend la position portée par l’événement
- #72/#75 : relance la synchro tant que le chemin du signal manque

