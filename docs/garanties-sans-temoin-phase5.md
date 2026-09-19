# Garanties restées sans témoin — phase 5

La phase 5 retire l'ancienne interface : `App.svelte`, ses 64 vues et le
drapeau `?v2=0`. Les gardes qui LISAIENT ces fichiers ne peuvent pas survivre à
leur sujet : elles partent avec lui.

Ce document est leur inventaire. **Il ne dit pas qu'un fait est faux — il dit
qu'il n'a plus de témoin.** La plupart de ces faits existent toujours, mais dans
l'interface actuelle, où rien ne les garde aujourd'hui. Recouvrir ces faits côté
v2 est un travail à part entière, qui n'est PAS fait ici.

Chiffres mesurés : 119 fichiers de garde retirés.

---

## `accueilInfobulles`
- fichier retiré : `src/lib/__tests__/accueilInfobulles.test.ts`
- la feuille globale définit bien une classe de troncature
- les règles propres du tableau de bord sont vues elles aussi
- la section de recommandations tronque avec sa propre règle
- chaque composant du lot tronque bien du texte
- chaque élément tronqué peut se lire au survol
- l'infobulle porte la donnée, pas un libellé d'interface
- un texte coupé à l’intérieur d’un élément déjà pourvu reste exempté

## `albumsDistincts`
- fichier retiré : `src/lib/__tests__/albumsDistincts.test.ts`
- la clé est normalisée
- un arbitrage se reconnaît dans les deux sens
- une variante déclarée distincte de l'original sort du groupe
- un groupe vidé de ses variantes n'est plus signalé DU TOUT
- la comparaison se fait contre l'ORIGINAL, pas entre variantes
- sans aucun arbitrage, rien ne change
- un album sans identifiant ne peut être arbitré, et reste
- produit l'original contre chaque variante
- ignore un doublon d'identifiant — le serveur refuse a == b (400)
- ne produit rien sans original identifiable
- compte les copies EN TROP après arbitrage, pas avant
- la liste de révision lit GET /library/albums/distinct
- poser l'arbitrage est un POST sur /albums/{id}/distinct/{other}
- revenir dessus est un DELETE sur la MÊME adresse
- la liste des groupes passe par le filtre des arbitrages
- le compteur dérive de la liste filtrée, pas des groupes bruts
- les paires audio du scan priment sur le repli par nom (#670)
- un arbitrage posé par erreur est révocable depuis l'écran

## `ancrageEnTetes925`
- fichier retiré : `src/lib/__tests__/ancrageEnTetes925.test.ts`
- porte bien position:sticky avec un offset et un fond opaque
- 🔴 n’a AUCUN ancêtre bloquant entre lui et son conteneur de défilement
- AlphaIndex expose un offset réglable, à zéro par défaut
- .${zone} décale le rail de ${variable}
- les deux bandes épinglées ont une hauteur ARRÊTÉE
- la rangée de modes est épinglée à la hauteur de la bande du titre
- la bande du titre réserve exactement cette hauteur
- un chemin sain ne signale rien, et trouve le conteneur de défilement
- 🔴 signale un ancêtre en ${propriete}: ${valeur}
- ne prend PAS le conteneur de défilement lui-même pour un bloqueur
- 🔴 ne lit PAS une règle de @media comme une règle inconditionnelle
- ne se laisse pas berner par un `overflow` cité dans un COMMENTAIRE

## `appareilsIgnores`
- fichier retiré : `src/lib/__tests__/appareilsIgnores.test.ts`
- affiche le nom annoncé quand il y en a un
- retombe sur l'hôte, puis sur l'identifiant
- ne prend pas un nom fait d'espaces pour un nom
- montre l'hôte et la MAC, les deux identités testées après l'id
- écarte les champs vides plutôt que de les rendre par un tiret
- n'affiche pas de pastille de transport quand le serveur n'a rien figé
- retire l'identifiant visé et celui que le serveur a figé
- ignore les identifiants vides — l'instantané peut n'en porter aucun
- la croix de la liste des appareils réseau appelle handleIgnoreDevice
- l'écran n'appelle plus api.deleteDevice, qui n'oublie qu'en mémoire
- handleIgnoreDevice passe par api.ignoreDevice
- api.ignoreDevice vise POST /devices/{id}/ignore
- l'écran lit GET /devices/ignored — la SEULE vue qui les annonce encore
- chaque ligne offre le retour en arrière
- débloquer est un DELETE sur la MÊME adresse que le blocage
- la section dit son vide plutôt que de disparaître

## `assistantSmbPartagesDecouverts3637`
- fichier retiré : `src/lib/__tests__/assistantSmbPartagesDecouverts3637.test.ts`
- rend la liste des hôtes découverts, alors qu'ils ne portent aucun champ `shares`
- le clic sur un hôte découvert APPELLE `scan-host` avec son ADRESSE
- affiche les partages rendus par le serveur, et non « aucun partage »
- le chemin par ADRESSE SAISIE continue de marcher, et n'appelle pas `scan-host` deux fois

## `audioNavigateurV2_1171`
- fichier retiré : `src/lib/__tests__/audioNavigateurV2_1171.test.ts`
- 🔴 vider la file ARRÊTE l’élément audio
- pause, reprise et démarrage suivent aussi
- 🔴 un changement de piste FORCE le rechargement
- une zone qui ne sort PAS sur le navigateur n’est pas touchée
- les événements qui ne concernent pas l’élément ne font rien
- sans zone, rien ne se passe
- sans adresse de flux, on ne joue pas dans le vide
- 🔴 la nouvelle coquille l’applique — c’est tout le défaut
- l’ancienne aussi, et par le MÊME module
- 🔴 aucune des deux ne garde sa propre copie de la règle

## `backendsAudioPlateforme`
- fichier retiré : `src/lib/__tests__/backendsAudioPlateforme.test.ts`
- Debian : rien de Windows n’est proposé
- macOS : un seul choix, CoreAudio
- Windows avec ASIO : les trois choix, dans l’ordre du serveur
- Windows sans ASIO : ASIO n’est pas proposé
- build sans sortie locale : aucun choix, l’écran masque le réglage
- une entrée malformée est ignorée, elle ne devient pas une option vide
- on ne rétablit pas Auto/WASAPI/ASIO en dur — c’était le défaut
- un réglage déjà persisté reste visible et réversible
- sans champ, le repli est « auto » et non « wasapi »
- l’ancien nom `audio_backend` est encore lu
- une valeur Windows persistée sur Linux sélectionne « auto », pas du vide
- « Auto » se traduit, la parenthèse est un nom propre et reste
- les autres libellés sont rendus tels quels
- ne s’affiche pas là où WASAPI n’existe pas
- s’affiche sous Windows quand WASAPI est sélectionné
- aucune option WASAPI ou ASIO codée dans le gabarit
- le sélecteur boucle sur la liste du serveur
- le repli « wasapi » de la valeur retenue a disparu
- le libellé « Mode WASAPI » n’est plus du texte en dur

## `bandcampFileDAlbum_2702`
- fichier retiré : `src/lib/__tests__/bandcampFileDAlbum_2702.test.ts`
- 🔴 lancer le PREMIER titre envoie l’ALBUM, pas la piste seule
- cliquer la troisième piste ouvre l’album À cette piste
- l’identifiant d’album est l’ADRESSE de la page — c’est ce que le serveur rouvre
- un indice hors bornes ou absurde retombe sur le début, jamais sur rien
- sans adresse d’album, la piste seule reste — mieux qu’un silence
- ni adresse ni piste : `null`, et surtout pas un corps vide
- un article de collection donne le même corps d’album
- un article sans adresse ne fabrique rien
- 🔴 `ecouter` passe par `corpsDeLectureBandcamp`
- 🔴 `ecouter` n’envoie PLUS la piste distante seule à `playAndSync`
- `jouer_collection` existe et passe par `corpsDeLectureCollection`
- la mise en FILE d’une piste seule reste ce qu’elle était

## `bandcampInfobulles`
- fichier retiré : `src/lib/__tests__/bandcampInfobulles.test.ts`
- le composant tronque bien du texte (sinon ce test ne garde rien)
- chaque élément tronqué porte un title=
- les quatre vues signalées sont couvertes
- le title= porte la valeur affichée, pas un libellé statique

## `bandcampLiaisonAffichee_2778`
- fichier retiré : `src/lib/__tests__/bandcampLiaisonAffichee_2778.test.ts`
- 🔴 l’écran interroge la route d’état de liaison
- 🔴 le formulaire de saisie ne réapparaît plus quand un compte est lié
- le compte lié est NOMMÉ à l’écran, et se change à la demande
- 🔴 chaque album de la collection porte un vrai bouton de lecture
- la pochette résolue par le serveur est affichée
- le lien « Ouvrir sur Bandcamp » reste — on ajoute, on ne retire pas
- le client parle bien onze langues — le hongrois n’existe que côté client
- « ${cle} » est traduite dans les onze
- « linkedAs » porte bien le gabarit {pseudo} partout

## `basculeTelemetrie3383`
- fichier retiré : `src/lib/__tests__/basculeTelemetrie3383.test.ts`
- une demande d’activation refusée par la machine laisse la case décochée
- un refus accepté est repris tel quel
- un serveur antérieur à #3383 ne bloque pas la bascule : on retombe sur le repli
- une valeur qui n’est pas un booléen ne décide de rien
- la route demandée correspond au souhait, pas à l’état courant
- la bascule lit la réponse du serveur au lieu d’inverser son booléen
- le rafraîchissement du statut passe par la même décision
- la case est inerte quand l’exploitant a verrouillé la machine
- les trois clés existent partout et ne sont pas vides
- l’intitulé ne promet plus l’anonymat — un server_id persistant est envoyé
- l’écran dit ce que le refus coupe EN PLUS, et ce qu’il ne coupe pas
- les deux hints sont affichés, pas seulement traduits

## `bibliothequeAjoutsRecents3039`
- fichier retiré : `src/lib/__tests__/bibliothequeAjoutsRecents3039.test.ts`
- la barre d’onglets de la Bibliothèque le porte
- l’ouvrir DEMANDE la fenêtre de quinze jours, liste et résumé
- la règle est ÉNONCÉE, avec la fenêtre en cours
- le décompte compte les DEUX, plus la durée — celui de la capture
- les albums de la fenêtre sont rendus
- « 30 jours » REDEMANDE au serveur, et la liste ET le décompte suivent
- la liste tombe et l’utilisateur est prévenu

## `bibliothequeAleatoireAffordance`
- fichier retiré : `src/lib/__tests__/bibliothequeAleatoireAffordance.test.ts`
- les deux boutons ont bien été retrouvés dans les sources
- l'en-tête Bibliothèque ne dessine pas le symbole de la bascule de transport
- le glyphe de l'en-tête porte une marque de lecture, absente de la bascule
- il ne se déguise pas en bascule avec aria-pressed
- il ne se déguise pas en bascule avec class:active
- la vraie bascule, elle, conserve son état
- les onze langues sont couvertes par ce test
- ${nom} — ${cle} est renseigné
- ${nom} — ${cle} ne répète pas transport.shuffle

## `bibliothequeUnSeulAscenseur`
- fichier retiré : `src/lib/__tests__/bibliothequeUnSeulAscenseur.test.ts`
- .main-content ne défile pas — les bandeaux s’empilent au-dessus du scroller
- .view-scroller est LE scroller de la vue active, et il peut se rétrécir
- les bandeaux ne volent jamais leur hauteur au scroller
- .library-view met en page mais ne défile pas
- .library-scroller est le seul scroller de la bibliothèque

## `bibliothequeVivante`
- fichier retiré : `src/lib/__tests__/bibliothequeVivante.test.ts`
- les deux événements sont écoutés
- elle appelle le suivi, et lui rend son désabonnement
- 🔴 ce que l'ancien client écoute, la v2 doit l'écouter aussi

## `calibrationTruth`
- fichier retiré : `src/lib/__tests__/calibrationTruth.test.ts`
- ne propose plus le faux calibrage par demi-RTT
- affiche explicitement la médiane du RTT de contrôle

## `collectionAlbumIndex`
- fichier retiré : `src/lib/__tests__/collectionAlbumIndex.test.ts`
- indexe le nom d’artiste, pas le titre de l’album
- replie les accents comme le tri serveur et garde les valeurs absentes à la fin
- rend une lettre par bloc et retrouve la première carte du bloc
- est réellement branché dans la grille, pas seulement calculé hors écran

## `comptesLocauxBranche`
- fichier retiré : `src/lib/__tests__/comptesLocauxBranche.test.ts`
- SettingsView importe le decideur
- SettingsView derive les deux comptes locaux des stats du serveur
- SettingsView rend le compte local a cote du total
- le total, lui, reste affiche — on nomme les populations, on n'en cache aucune

## `convertisseurFormatOrigine3466`
- fichier retiré : `src/lib/__tests__/convertisseurFormatOrigine3466.test.ts`
- importe le badge de qualité plutôt que d’en redessiner un
- affiche le format D’ORIGINE de l’album, pas celui de sortie
- le badge est posé sur la CARTE d’album, pas dans l’en-tête

## `crossfadeUnavailable`
- fichier retiré : `src/lib/__tests__/crossfadeUnavailable.test.ts`
- aucun écran ne propose le réglage inerte
- le client ne porte plus une API qui promet un faux succès

## `dashboardDurationLabels912`
- fichier retiré : `src/lib/__tests__/dashboardDurationLabels912.test.ts`
- (aucun titre extrait — voir `git show HEAD:src/lib/__tests__/dashboardDurationLabels912.test.ts`)

## `debordementMeilleurResultat849`
- fichier retiré : `src/lib/__tests__/debordementMeilleurResultat849.test.ts`
- le badge lui-même peut se replier DANS cette carte
- la portée reste LOCALE : QualityBadge n’est pas modifié pour tout le reste
- la colonne du meilleur résultat est bien celle de 300 px qu’on a mesurée
- 🔴 « ${nom} » est FAUX sur l’ancienne feuille

## `ecranConcertsAtteignable`
- fichier retiré : `src/lib/__tests__/ecranConcertsAtteignable.test.ts`
- 'concerts' est une vue déclarée
- l'application aiguille bien vers l'écran
- la barre latérale porte une entrée, rendue une seule fois
- l'entrée navigue vers la vue, et pas vers une autre
- l'entrée disparaît quand le binaire n'embarque pas le greffon
- l'état du greffon est bien demandé au serveur
- traite le refus d'offre comme un refus, pas comme une panne
- offre les trois crans du périmètre, jamais un choix binaire
- propose d'élargir quand la liste est vide
- n'interroge pas le greffon tant que ses routes ne sont pas montées

## `enrichissementApresScan`
- fichier retiré : `src/lib/__tests__/enrichissementApresScan.test.ts`
- rend visible le refus Premium et indique le chemin manuel
- distingue un réglage désactivé d'un refus de licence
- n'invente rien quand la passe a démarré ou quand le serveur est ancien
- branche le contrat sur library.scan.completed au lieu de toujours afficher « Prêt »

## `enTetesAncres2112`
- fichier retiré : `src/lib/__tests__/enTetesAncres2112.test.ts`
- l’en-tête et la recherche sont hors de `.ms-body`, qui porte la liste
- l’en-tête est hors de `.playlists-body`, qui porte la liste
- les trois lignes du haut vivent dans la MÊME barre ancrée
- ce qui défile reste EN DEHORS de la barre ancrée
- une cible passée en FONCTION est résolue au moment où elle existe
- un élément déjà présent est servi tout de suite, comme avant

## `eqPrereglages`
- fichier retiré : `src/lib/__tests__/eqPrereglages.test.ts`
- porte exactement les sept noms que le serveur sait résoudre
- « vocal » n’est plus proposé nulle part
- pose les préréglages sur la grille du serveur, au même Q
- les gains sont ceux du serveur, gain pour gain
- rend dix bandes prêtes pour POST /zones/{id}/eq
- ne vise aucun canal
- rend null sur un nom inconnu, y compris « custom »
- retrouve le nom d’une courbe qu’on vient d’écrire
- rend null plutôt que d’inventer un nom
- rend le libellé connu, et la clé brute sinon
- le panneau ne tient plus sa propre liste de libellés
- l’écran Égaliseur non plus
- le panneau applique le préréglage par le même chemin que l’écran complet
- la route « un nom seul » n’existe plus dans la couche API

## `etiquetteCreationAtteignable`
- fichier retiré : `src/lib/__tests__/etiquetteCreationAtteignable.test.ts`
- la création a plus d’un point d’appel
- la barre de filtres de la grille d’albums porte un déclencheur de création
- le déclencheur n’est pas conditionné à l’existence d’une étiquette
- la création depuis la barre crée l’étiquette seule, sans assigner d’album
- le champ de la fiche d’album offre une validation visible, pas seulement Entrée

## `etiquetteZoneCreationAncree`
- fichier retiré : `src/lib/__tests__/etiquetteZoneCreationAncree.test.ts`
- `.tag-add-wrap` n’est pas une règle morte : le balisage l’emploie
- le bouton « + Tag » et la zone de création vivent dans ce conteneur
- `.tag-add-wrap` reste le bloc de référence — sinon le défaut revient
- `.tag-picker` reste positionné en absolu sous son ancre

## `favoriPlaylistQobuz`
- fichier retiré : `src/lib/__tests__/favoriPlaylistQobuz.test.ts`
- fait réapparaître une playlist Qobuz mise en favori
- garde la playlist locale, son identifiant et sa source
- range les locales et les playlists de service dans la même liste
- ne prend que le type playlist
- écarte une entrée sans identifiant ou sans service
- ne confond pas deux services sur le même identifiant
- n'affiche qu'une fois la même playlist du même service
- reporte `favorite_added_at` d'une playlist locale
- reporte `created_at` d'une playlist de service
- laisse la date vide quand le serveur n'en donne aucune
- rend le tri « date d'ajout » effectif sur l'onglet Playlists
- pose un HeartButton de type playlist sur la fiche
- désigne la playlist par son identifiant de service, pas par son rang

## `ficheAlbumListeEtrangere3178`
- fichier retiré : `src/lib/__tests__/ficheAlbumListeEtrangere3178.test.ts`
- la fiche de l’album suivant ne porte AUCUNE piste de l’album d’avant
- l’échec est DIT, au lieu de laisser un écran muet
- la fiche garde l’album ouvert quand la requête d’avant se dénoue
- une liste posée pour un AUTRE album n’est jamais rendue

## `fixedVolumeConfirmationGuard`
- fichier retiré : `src/lib/__tests__/fixedVolumeConfirmationGuard.test.ts`
- l’accord « 100 » précède le PATCH et lui seul crée le témoin
- le client API omet le témoin tant qu’il n’a pas été confirmé

## `forcerImagesArtistes`
- fichier retiré : `src/lib/__tests__/forcerImagesArtistes.test.ts`
- compte 11 locales
- api.ts expose forceRefetchArtistImages sur la route /force
- le bouton existe dans les réglages et appelle cette fonction
- les 11 langues ont le libellé et son infobulle
- s'arrête pour le passage « manquantes » quand plus rien ne manque
- ne s'arrête pas pour « manquantes » tant qu'il reste des artistes
- ne s'arrête JAMAIS pour le passage forcé, même à 0 manquante
- le bouton porte toujours son title
- les 11 langues annoncent la ré-extraction des pochettes embarquées

## `gestesServiceCoquilleV1_888_931_869`
- fichier retiré : `src/lib/__tests__/gestesServiceCoquilleV1_888_931_869.test.ts`
- elle ARME les gestes à son montage — le magasin ne reste plus null
- 🔴 le lien ALBUM ouvre la fiche Qobuz, et non la recherche
- 🔴 le lien ARTISTE résout le NOM chez le service, puis ouvre sa fiche
- repli EXPLICITE : service muet, on revient à la recherche — le geste d’avant
- contrôle : coquille NON armée, les deux entrées sont ABSENTES
- 🔴 coquille actuelle MONTÉE : les deux entrées apparaissent
- 🔴 « Aller à l’album » du menu ouvre bien l’album QOBUZ de la piste

## `greffonRedemarrageAnnonce3662`
- fichier retiré : `src/lib/__tests__/greffonRedemarrageAnnonce3662.test.ts`
- ne s'affiche pas quand le serveur dit qu'aucun redémarrage n'est nécessaire
- s'affiche quand le serveur dit qu'un redémarrage est nécessaire

## `historiqueEcoutesV2_889`
- fichier retiré : `src/lib/__tests__/historiqueEcoutesV2_889.test.ts`
- seuls `started` et `track_changed` ouvrent une écoute
- la zone COURANTE est notée
- un membre du MÊME groupe multiroom aussi — il joue la même chose
- une autre zone, hors groupe, ne l’est pas
- deux zones SANS groupe ne sont pas « groupées ensemble »
- sans zone courante, rien n’est noté
- une zone sans piste courante ne note rien
- un titre de RADIO est noté, avec le nom de sa zone
- un `resumed` sur la même zone ne note rien
- une écoute sur une zone étrangère ne note rien
- la NOUVELLE coquille l’appelle, après le rechargement des zones
- l’ANCIENNE coquille passe par la même fonction — elles ne divergeront plus
- le module reste le SEUL décideur : aucune coquille ne refiltre le type

## `historiqueV2`
- fichier retiré : `src/lib/__tests__/historiqueV2.test.ts`
- la barre latérale y mène, dans le NOYAU et non derrière un niveau
- la coquille MONTE l'écran — une entrée qui ne mène nulle part ne vaut rien
- l'écran passe par la ligne PARTAGÉE, comme les autres listes de pistes
- la logique est PARTAGÉE avec le client actuel, pas recopiée
- le temps relatif passe par les traductions, il n'est pas en dur
- la fusion ne garde que la plus récente écoute de chaque piste
- une piste sans identifiant est dédupliquée par sa source et son titre
- le local passe devant le serveur : il est plus frais
- « Episode » et le nom de station nu ne sont pas des titres enregistrables
- la clé de favori radio distingue deux titres homonymes d’artistes différents

## `imageSansSource201`
- fichier retiré : `src/lib/__tests__/imageSansSource201.test.ts`
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

## `infobullesQuatreVues914`
- fichier retiré : `src/lib/__tests__/infobullesQuatreVues914.test.ts`
- 🔴 plus aucun texte coupé sans infobulle
- chacune porte bien l’action, et non un `title=` écrit à la main
- elles portent toujours exactement ce qu’elles portaient
- le témoin prouve que la mesure VOIT quelque chose

## `interactionsBibliothequePerdues`
- fichier retiré : `src/lib/__tests__/interactionsBibliothequePerdues.test.ts`
- la feuille ne vise cette icône que par les sélecteurs examinés ici
- est visible au doigt : opacité non nulle sans aucun survol
- reste discrète au repos et pleine au survol
- la feuille ne vise cette pastille que par les sélecteurs examinés ici
- ne capte pas le doigt tant qu'elle est invisible
- redevient cliquable dès que le survol la révèle
- la grille virtuelle des albums épingle ses colonnes sur le calcul JS
- la grille virtuelle par année épingle les siennes de la même façon

## `interfaceChoisie`
- fichier retiré : `src/lib/__tests__/interfaceChoisie.test.ts`
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

## `langueAuDemarrage`
- fichier retiré : `src/lib/__tests__/langueAuDemarrage.test.ts`
- la coquille v2 applique la préférence
- 🔴 les DEUX coquilles le font, chacune pour elle-même
- aucune boucle : `locale` n'écrit jamais dans `preferences`
- le sélecteur des Réglages reste explicite
- il n'est plus posé EN ABSOLU par-dessus le logo
- la marque passe en COLONNE quand la barre est repliée
- le bouton reste nommé dans les deux états

## `lectureEnMasse1947`
- fichier retiré : `src/lib/__tests__/lectureEnMasse1947.test.ts`
- une liste entièrement LOCALE part en UNE requête
- une liste de SERVICE lance sa tête puis enfile le reste
- une piste qu’on ne sait pas désigner ne part pas
- une liste vide n’envoie RIEN — pas une requête que le serveur refusera
- aucun geste de masse n’appelle `api.setShuffle`
- le mélange ne perd ni n’invente aucune piste
- il mélange VRAIMENT — et pas toujours de la même façon
- l’ordre demandé est bien celui qui part sur le fil
- une portée vide n’est pas une portée
- `api.shuffleAll` porte bien les quatre portées qu’on lui demande
- le lot n’enfile rien derrière lui
- une seule piste de service ne déclenche aucune mise en file
- la fiche d’album du client actuel a une « lecture aléatoire »
- la fiche d’artiste du nouveau client a les deux boutons
- la fiche de liste de lecture a une « lecture aléatoire »
- la fiche de collection a les deux boutons, sur TOUS ses albums
- les résultats de recherche du nouveau client ont les deux boutons
- l’écran des répertoires tire dans le SOUS-ARBRE, pas dans la page
- aucune de ces surfaces n’arme le drapeau de la zone

## `lectureSuivanteStreamingConfirme`
- fichier retiré : `src/lib/__tests__/lectureSuivanteStreamingConfirme.test.ts`
- un enfilage réussi affiche un toast de succès, après l'ajout
- un échec ne reste pas muet non plus
- une zone absente ou une piste sans source_id se dit, au lieu de sortir en silence
- le second clic est désarmé tant que le premier n'a pas répondu
- la bibliothèque locale, elle, confirmait déjà — et continue

## `libellesTableauDeBord1155`
- fichier retiré : `src/lib/__tests__/libellesTableauDeBord1155.test.ts`
- les quatre totaux portent une légende
- les trois classements aussi
- 🔴 la légende des albums dit que le compte porte sur les PISTES
- 🔴 la légende des pistes écarte l'hypothèse de la durée
- la légende est VISIBLE, pas seulement une infobulle
- l'échelle est écrite
- 🔴 aucune infobulle ne reste en anglais codé en dur
- « Streak » passe par une clé
- 🔴 « skippées » disparaît du français
- 🔴 la place du cœur est RÉSERVÉE

## `licenceGraceVisible`
- fichier retiré : `src/lib/__tests__/licenceGraceVisible.test.ts`
- se tait quand la vérification est fraîche
- annonce la fenêtre en cours, avec ses deux bornes
- annonce la retombée une fois la fenêtre écoulée
- reste muet face à un serveur qui ne connaît pas le champ
- est traduit dans les onze langues
- garde les substitutions attendues dans chaque langue
- n'écrit jamais la durée en dur : le chiffre vient du serveur
- reste factuel : aucune formule alarmiste sur la fenêtre en cours
- affiche la bannière et la règle chiffrée
- réserve le ton d’avertissement à la fenêtre réellement écoulée
- n'affiche aucune donnée de licence dans la bannière

## `listesInfobulles2411`
- fichier retiré : `src/lib/__tests__/listesInfobulles2411.test.ts`
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
- 🔴 la piste de la fiche porte titre ET artiste en infobulle
- 🔴 le focus clavier sur la ligne ouvre la bulle

## `logoBarreReduite`
- fichier retiré : `src/lib/__tests__/logoBarreReduite.test.ts`
- la ligne du logo ne déborde pas des 52px réellement disponibles
- l'image du logo ne se laisse pas écraser par la ligne flex
- la combinaison qui rend le débordement invisible est bien celle décrite
- « Quoi de neuf » garde un point d'entrée quand son bouton est masqué

## `menuPisteCoherence`
- fichier retiré : `src/lib/__tests__/menuPisteCoherence.test.ts`
- une piste de l'onglet « Titres » porte un menu « … »
- le menu de l'onglet « Titres » offre les sept actions praticables
- « Autres versions » reste absente faute de panneau pour l'afficher
- les rendus multi-disque et mono-disque montent chacun un menu
- les deux rendus offrent EXACTEMENT les mêmes actions
- aucun menu ne propose « Aller à l'album » vers l'album déjà ouvert
- couvre bien onze langues
- search.addToQueue = queue.addToQueue — ${langue}

## `miniLecteurOuverture`
- fichier retiré : `src/lib/__tests__/miniLecteurOuverture.test.ts`
- s'allume sur le drapeau du serveur et s'éteint à la lecture
- s'éteint tout seul quand PLUS AUCUNE nouvelle n'arrive du serveur
- garde son minuteur malgré le flot de mises à jour du serveur
- ne se réveille pas sur sa propre écriture (#2555)
- libère son minuteur quand le composant disparaît
- branche le suivi partagé sur la zone courante
- remplace le titre pendant l'ouverture, au lieu d'annoncer « aucune lecture »
- le dit aussi aux technologies d'assistance
- porte une animation subtile, retirée si l'utilisateur refuse le mouvement
- n'invente aucune clé : `zone.buffering` existait, morte, dans les 11 langues

## `mobileStreamingSelector`
- fichier retiré : `src/lib/__tests__/mobileStreamingSelector.test.ts`
- reste utilisable dans la largeur où la barre latérale disparaît
- ne propose que les services actifs et mène aux réglages si la liste est vide
- ne renvoie plus vers une barre latérale absente dans aucune langue

## `motifEchecCreationProfil`
- fichier retiré : `src/lib/__tests__/motifEchecCreationProfil.test.ts`
- 🔴 un 402 est un refus de PALIER
- un nom déjà pris est un 409
- 🔴 tout le reste est « autre » — surtout pas « premium »
- lit aussi le MESSAGE, pour les aides qui lèvent des Error nues
- un objet sans rien d’exploitable ne devine pas
- 🔴 `createProfile` ne rend plus un `null` muet
- 🔴 l’écran Profils ne présume plus le premium
- 🔴 le sélecteur n’ignore plus le résultat
- 🔴 le message générique n’affirme plus le premium

## `motifEchecEq`
- fichier retiré : `src/lib/__tests__/motifEchecEq.test.ts`
- reconnaît les DEUX formes du refus d’offre
- distingue la session expirée
- distingue la panne du serveur de son refus
- nomme le serveur injoignable
- ne prend pas une panne pour une limite d’offre, ni l’inverse
- rend un motif — jamais rien — sur une entrée inattendue
- remonte ce que le serveur a écrit, et rien qu’utile
- accole le message du serveur APRÈS la phrase traduite
- se contente de la phrase quand le serveur n’a rien écrit
- retombe sur le code quand il n’y a pas de message
- ${code} traduit les quatre nouvelles clés
- aucune langue ne recopie le français
- aucun `catch` ne jette sa raison
- le lecteur de `catch` en trouve bien plusieurs
- passe par le classement partagé des motifs
- ne trie plus les refus sur le seul message
- un 402 reçu lève un bandeau permanent
- dit quand la liste des presets ne vient pas du serveur

## `murOxygen994`
- fichier retiré : `src/lib/__tests__/murOxygen994.test.ts`
- 🔴 le type des dispositions la connaît
- 🔴 le sélecteur la propose, et la branche de rendu existe
- 🔴 le mur ne porte NI titre NI artiste en texte — seulement l’image, le texte en infobulle
- mêmes albums, mêmes gestes que la Grille : clic = ouvrir, double-clic = lire
- des carrés jointifs — le CSS du mur
- le libellé existe dans les onze langues, et le sélecteur de l’ancienne coquille aussi

## `niveauxTraceDesMasques1617`
- fichier retiré : `src/lib/__tests__/niveauxTraceDesMasques1617.test.ts`
- chaque entrée `sub` porte un `parent` qui existe dans le registre
- « Valeurs par facette » est bien le cas d'espèce : expert, sous un parent intermédiaire
- parent ÉTEINT : rien à annoncer, la ligne ne se rend pas
- parent ALLUMÉ : la ligne se rend, le niveau la masque, elle compte
- la règle d'or prime encore : un plafond déjà changé n'est pas « masqué »
- au niveau expert, plus rien n'est masqué même parents allumés
- des masqués EXPERT vus d'un débutant renvoient expert, pas intermédiaire
- un masqué INTERMÉDIAIRE renvoie intermédiaire
- mélange : le plus bas niveau qui révèle au moins un réglage
- depuis expert, il n'y a plus rien à proposer
- annonce le nombre de réglages masqués et offre le geste
- ne rend RIEN quand rien n'est masqué (pas de bruit permanent)
- ne rend rien non plus au niveau expert : il n'y a plus de cran au-dessus
- le clic demande le niveau qui révèle le réglage — expert, pas intermédiaire
- settings.hiddenHere et settings.hiddenHereReveal sont traduites partout

## `nomFonctionnaliteLicence798`
- fichier retiré : `src/lib/__tests__/nomFonctionnaliteLicence798.test.ts`
- 🔴 les VINGT-CINQ codes du serveur ont leur traduction, dans les ONZE langues
- préfère la traduction au nom du serveur
- 🔴 mais garde `display_name` en REPLI
- et le code en dernier recours
- 🔴 « unlimited_zones » ne dit plus « Unlimited Zones » en français
- la grille de licence passe par le traducteur
- et n’affiche plus `display_name` nu

## `onboardingRequis`
- fichier retiré : `src/lib/__tests__/onboardingRequis.test.ts`
- l’appareil se souvient que c’est fait : on ne demande RIEN au serveur
- le serveur dit que c’est fait — sous ses quatre orthographes
- le serveur dit que c’est fait : on le mémorise pour ne plus le redemander
- l’état dédié dit que ce n’est pas complet : on propose
- dernier recours : une bibliothèque vide trahit une installation neuve
- une panne ne met JAMAIS l’assistant devant quelqu’un qui écoute depuis un an
- un statut « complete » ne déclenche pas l’assistant
- la coquille de la future v1 le monte
- la coquille actuelle le monte
- l’enveloppe monte le VRAI assistant, celui qui est branché
- la règle n’est écrite qu’UNE fois

## `oxygenBadgeEtFocus_977_978`
- fichier retiré : `src/lib/__tests__/oxygenBadgeEtFocus_977_978.test.ts`
- la pochette ne porte PLUS de badge de qualité
- la pochette garde ce qui doit y rester : le cœur et le bouton Lire
- le badge est rendu APRÈS le titre et l’artiste, sur sa propre ligne
- plus aucune règle ne positionne un badge sur la pochette
- le détecteur voit bien un badge resté sur la pochette
- la nouvelle coquille lit `focusMode`
- elle RETIRE la barre latérale, et passe à une seule colonne
- l’ancienne coquille le lit toujours — on n’a rien déplacé
- les trois sorties tiennent, et aucune ne dépend de la coquille
- il reste NON persisté — un rechargement doit rendre l’interface complète

## `paliersDsdFiltre1074`
- fichier retiré : `src/lib/__tests__/paliersDsdFiltre1074.test.ts`
- 🔴 le DSD entre dans la liste — il n'y était pas du tout
- l'ordre du serveur est conservé tel quel
- la famille 48 k garde son suffixe
- un serveur qui ne nomme rien retombe sur la liste figée, intacte
- le serveur envoie le point, le français lit la virgule
- l'anglais garde le point
- seul un point ENTRE DEUX CHIFFRES bouge
- le PCM perd son « kHz », le DSD garde son nom entier
- le palier connu gagne
- 🔴 sans palier servi, la forme arithmétique d'avant est conservée
- LibraryV2 ne porte plus de liste figée, et lit le serveur
- l'ancienne interface passe par le même nommage
- l'appel serveur retombe en silence sur un serveur antérieur

## `parolesEnLigneNiveauDebutant`
- fichier retiré : `src/lib/__tests__/parolesEnLigneNiveauDebutant.test.ts`
- le registre la classe débutant, et non intermédiaire
- un utilisateur qui n'a jamais rien réglé la voit
- « Enrichir pendant le scan » reste intermédiaire dans le registre
- et chaque ligne de la section porte sa propre garde de niveau
- la case ne compte plus parmi les réglages masqués au niveau débutant

## `perZoneGaplessPromise.i18n`
- fichier retiré : `src/lib/__tests__/perZoneGaplessPromise.i18n.test.ts`
- le bloc contient bien les contrôles que l'intitulé peut nommer
- ${code} : l'intitulé promet le gapless si et seulement si le bloc l'offre

## `pisteModifieeRelue3638`
- fichier retiré : `src/lib/__tests__/pisteModifieeRelue3638.test.ts`
- écrit bien la modification par PUT /library/tracks/{id}
- RELIT la piste après avoir écrit, et dans cet ordre
- remet à l'appelant une PISTE, pas l'accusé de réception du serveur
- relit aussi quand SEULES les métadonnées étendues ont changé
- ne relit RIEN quand rien n'a changé — pas de requête inutile

## `pluginsRailCategories`
- fichier retiré : `src/lib/__tests__/pluginsRailCategories.test.ts`
- le rail ne se cale plus sur une constante en pixels
- le décalage est posé en ligne, à la hauteur MESURÉE de l'en-tête
- le titre du rail passe par la traduction, dans les onze langues
- la garde lit les déclarations analysées, jamais les commentaires

## `plusDeV2DansLUI`
- fichier retiré : `src/lib/__tests__/plusDeV2DansLUI.test.ts`
- 🔴 plus une seule chaîne ne nomme « v1 » ou « v2 » comme une interface
- ⚠️ …mais le filet `?v2=0` est TOUJOURS là
- aucun écran n a « V2 » en dur
- 🔴 « Actuelle » nommait l ANCIENNE — or la nouvelle est le défaut
- les deux libellés sont traduits partout, et distincts

## `pochettePodcastMorte203`
- fichier retiré : `src/lib/__tests__/pochettePodcastMorte203.test.ts`
- 🔴 chaque `<img>` de pochette apprend son échec
- 🔴 et l’`onerror` reçoit l’adresse BRUTE, pas celle qui est affichée
- une adresse vue en échec disparaît de l’affichage
- l’écran v2 s’en remet à `AlbumArt`, qui gère déjà l’échec

## `podcastsInfobulles914`
- fichier retiré : `src/lib/__tests__/podcastsInfobulles914.test.ts`
- expose les titres complets et auteurs, avec coupe verticale et horizontale
- ne répète pas les textes courts et n’ajoute pas de point de tabulation
- couvre abonnements, nouveaux épisodes et titre dans la fiche
- réévalue la coupe au redimensionnement puis le titre après changement de pays
- retire la bulle clavier et les observateurs au démontage

## `porteeAleatoire882`
- fichier retiré : `src/lib/__tests__/porteeAleatoire882.test.ts`
- 🔴 le cas de Marco Polo : un répertoire ciblé, rien d’autre
- sans aucune portée, on n’envoie RIEN — l’aléatoire prend tout
- les espaces ne font pas une portée
- les deux posés : seul le répertoire part
- sans répertoire, le genre part bien
- la recherche prime sur le genre — on cherche DANS ce qu’on regarde
- répertoire ET recherche voyagent ensemble
- les trois posés : le genre saute, les deux autres restent
- 🔴 la nouvelle coquille transmet le répertoire
- l’écran actuel passe par la MÊME règle — plus deux constructions
- la construction de V2 perdait bien le répertoire

## `porteeRepertoire3101`
- fichier retiré : `src/lib/__tests__/porteeRepertoire3101.test.ts`
- une liste PLEINE remplie sans portée doit être rechargée sous la portée
- au changement de portée, la liste hors portée est VIDÉE avant tout rendu
- une liste remplie SOUS la portée ne se recharge pas en boucle
- retirer la pastille rend une liste scopée périmée : rechargement sans portée
- chaque liste a SA portée : des artistes non scopés ne passent pas sous une portée posée par les albums
- un clic délibéré sur « Bibliothèque » dans la barre latérale retire la portée
- la liste précédente ne reste PAS à l’écran
- rend le dernier segment, Unix ou Windows, et rien sans portée
- le dépôt « consommé une fois » n’existe plus nulle part
- Répertoires ÉCRIT le magasin ; les deux clients le LISENT en dérivé
- v1 : le chargement automatique dépend de la portée et de `listeARecharger`, plus de « magasin vide »
- v1 : les trois chargements scopés VIDENT la liste et PRÉVIENNENT en cas d’échec
- v1 : les listes écrites portent la portée sous laquelle elles l’ont été
- v1 : la croix de la pastille passe par le magasin, pas par un état local
- v2 : la croix passe par le magasin, et un échec est DIT plutôt que tu
- la clé du message existe dans les onze langues, avec le nom du dossier

## `porteeRepertoireEcranMonte3101`
- fichier retiré : `src/lib/__tests__/porteeRepertoireEcranMonte3101.test.ts`
- l’écran DEMANDE le dossier au serveur
- 🔴 il n’affiche PAS la bibliothèque entière sous la pastille
- la bibliothèque entière ne reste PAS à l’écran, et l’échec est dit
- elle retire la portée, et la grille se remplit à nouveau

## `positionLecture954`
- fichier retiré : `src/lib/__tests__/positionLecture954.test.ts`
- une piste de streaming SANS identifiant reste reconnaissable
- un identifiant de bibliothèque prime quand il existe
- deux titres d’une MÊME radio ne partagent pas la même clé
- rien qui joue ne donne aucune clé
- au changement, la barre repart de ZÉRO — pas à 68 s
- même quand le serveur annonce une position PLAUSIBLE pour la nouvelle
- sur la MÊME piste, un écart au-delà du seuil recale
- sur la même piste et dans le seuil, l’horloge locale fait foi
- à l’arrêt, la position du serveur fait foi
- une position négative ou absente ne descend jamais sous zéro
- la séquence mesurée ne montre jamais la position du morceau d’avant
- la coquille v2 emploie la règle au lieu de recopier la position
- le souvenir repart au changement de zone, et meurt au débranchement
- l’ancienne coquille garde sa propre remise à zéro

## `purgeOrphelines`
- fichier retiré : `src/lib/__tests__/purgeOrphelines.test.ts`
- le nombre à confirmer vient du serveur, jamais du client
- rien d’orphelin : aucune question posée
- serveur antérieur à #2149 : le retrait se comporte comme avant
- un compte annoncé sans nombre à confirmer ne déclenche rien
- dit le nombre, ce qui tombe avec, et que les fichiers sont saufs
- sans dégât collatéral, on n’écrit pas « 0 playlist, 0 favori »
- la phrase « les fichiers sont saufs » n’est jamais omise
- aucun {marqueur} ne survit dans la phrase affichée
- purge faite : on annonce le nombre RÉELLEMENT retiré
- purge refusée : 200 côté HTTP, mais le dossier EST retiré — on le dit
- le message français du serveur n’est JAMAIS affiché tel quel
- plus rien à retirer entre les deux appels : ce n’est pas un échec
- le nombre ne disparaît pas avec la boîte de dialogue
- `removeMusicDir` sait porter une confirmation chiffrée
- le type de retour ne ment plus : le serveur rend `dirs`, pas `music_dirs`
- la réponse du retrait n’est plus jetée
- l’échec du retrait ne meurt plus dans la console

## `quoiDeNeufLangue906`
- fichier retiré : `src/lib/__tests__/quoiDeNeufLangue906.test.ts`
- 🔴 l’appel porte `lang`
- la langue vient du MAGASIN, pas d’une constante
- la valeur est ÉCHAPPÉE — une locale ne se concatène pas crue dans une URL
- 🔴 `fallback` est lu, entrée par entrée
- et il a un site de rendu — sans quoi il ne servirait à rien
- le bandeau est distinct de l’erreur hors ligne
- le message existe dans les onze langues
- l’appel d’avant ne portait aucune langue

## `raccourcisCible`
- fichier retiré : `src/lib/__tests__/raccourcisCible.test.ts`
- ${f} publie l'élément ouvert
- ${f} écoute la restauration
- ${f} OUBLIE la cible en quittant
- les clés sont STABLES et ne se confondent pas entre elles
- l'onglet suit l'élément rouvert

## `radioGenres`
- fichier retiré : `src/lib/__tests__/radioGenres.test.ts`
- les onze langues sont bien chargées
- couvre les seize genres du catalogue livré
- chaque clé est un identifiant ASCII, sans accent ni espace
- aucune langue non française ne recopie le français accentué
- deux genres réellement différents gardent deux rayons
- une valeur vide ou absente ne fabrique pas de rayon « (vide) »
- un genre inconnu n'est pas jeté : il garde son propre rayon et son mot
- le libellé passe par la traduction quand le genre est connu
- vingt-six valeurs se rangent en seize rayons
- la source est bien celle de la page Radios
- la liste des rayons ne se dérive plus d'un Set de chaînes brutes
- le filtre compare des clés de rayon
- les pastilles affichent un libellé traduit

## `radiosRefusUrlAffiche`
- fichier retiré : `src/lib/__tests__/radiosRefusUrlAffiche.test.ts`
- les deux zones de message sont remises à zéro avant chaque tentative
- le message affiché est celui du serveur, pas un texte fabriqué ici

## `rechercheComptesAlbumsArtistes3623`
- fichier retiré : `src/lib/__tests__/rechercheComptesAlbumsArtistes3623.test.ts`
- affiche le VRAI total du serveur, pas la longueur de la page
- offre une suite, et la demande au bon rang
- le vrai total est affiché à côté du titre
- le bouton découvre d’abord ce qui est DÉJÀ reçu, sans rien demander
- puis va chercher la page suivante quand tout le reçu est montré
- charger la suite des pistes ne fait pas sauter cinquante albums
- une nouvelle recherche remet les trois rangs à zéro

## `rechercheCreerPlaylist3191`
- fichier retiré : `src/lib/__tests__/rechercheCreerPlaylist3191.test.ts`
- le bouton existe dans la section Pistes
- il crée la liste, PUIS y range les pistes affichées
- un dialogue annulé n’écrit RIEN
- le message annonce le nombre enregistré ET le nombre de correspondances
- quand tout est affiché, le message ne parle QUE du nombre enregistré
- les pistes de service, sans identifiant local, ne sont pas enregistrées
- la création qui échoue ne laisse pas croire à un enregistrement

## `rechercheDureeTotale3190`
- fichier retiré : `src/lib/__tests__/rechercheDureeTotale3190.test.ts`
- elle apparaît, et vaut la somme des pistes RENDUES
- elle s’écrit NUE quand tous les résultats sont affichés
- quand la liste est une page, la durée DIT qu’elle ne couvre que l’affiché
- une durée nue ne peut pas se glisser sous un compteur tronqué
- aucune durée quand la recherche ne rend aucune piste

## `rechercheFedereePlafond764`
- fichier retiré : `src/lib/__tests__/rechercheFedereePlafond764.test.ts`
- 🔴 dépasse cinquante — sans quoi le serveur ne pagine PAS
- 🔴 reste distinct du plafond de page par service
- est bien le défaut de `federatedSearch`
- 🔴 la barre de suggestions garde le plafond ÉTROIT
- les deux écrans de recherche COMPLETS prennent le défaut

## `refusModuleSortie`
- fichier retiré : `src/lib/__tests__/refusModuleSortie.test.ts`
- nomme le module, dit que l'installation n'est pas en cause, et dit où cliquer
- n'affiche JAMAIS le code technique à l'écran
- distingue « compte non relié » de « module non possédé » : ni le même texte, ni la même action
- l'URL d'achat vient du serveur et n'est jamais inventée
- prévient même sur un code de refus inconnu, plutôt que de se taire
- ne rend AUCUN bandeau quand le module est possédé, même sans appareil trouvé
- rend le code exact des deux refus du serveur
- ne regarde jamais `devices` : un module refusé se dit même à côté de zones qui marchent
- groupe par code et dédoublonne les modules, de façon déterministe
- replie sur `required_module` puis `provider` quand `refusal.module` manque
- range tout code non reconnu — ou absent — dans le refus générique
- l'écran des ZONES lit `output_providers` et monte le bandeau
- l'écran Diagnostics monte le même bandeau, sans requête supplémentaire
- le bandeau est hors du bloc « aucune zone » : il prévient, il ne se masque pas

## `reglagesParZoneOngletAudio`
- fichier retiré : `src/lib/__tests__/reglagesParZoneOngletAudio.test.ts`
- la recherche sait voir les deux onglets en jeu (témoin)
- le bloc « Réglages par zone » se rend sous l'onglet Réseau / Audio
- le décalage des paroles voyage avec sa carte de zone
- le registre des niveaux range les clés par-zone sous « network »
- plus aucune clé « services.perZone… » ne subsiste
- le préfixe de chaque clé du registre nomme bien son onglet

## `reglagesZonePanneauUnique920`
- fichier retiré : `src/lib/__tests__/reglagesZonePanneauUnique920.test.ts`
- 🔴 les TROIS réglages y sont
- chacun passe par une route, aucun n’est décoratif
- 🔴 `updateZoneGapless` existe — elle n’avait AUCUN écrivain
- les trois affichent ce que le SERVEUR répond, pas ce qu’on lui a demandé
- 🔴 un échec REMET le contrôle où il était
- il est réservé aux zones locales, et le dit pour les autres
- le dialogue de confirmation n’est PAS recopié
- le sélecteur DSD reprend les libellés de Réglages
- CONTRE-ÉPREUVE : le panneau d’AVANT est bien refusé

## `renvoiPluginsBandcamp.i18n`
- fichier retiré : `src/lib/__tests__/renvoiPluginsBandcamp.i18n.test.ts`
- les onze langues sont couvertes par ce test
- ${nom} ne présente plus Plugins comme un sous-niveau
- ${nom} nomme la rubrique par interpolation
- ${nom} traduit nav.plugins
- la vue interpole {rubrique} depuis nav.plugins
- la vue offre un accès cliquable à la rubrique Plugins

## `retourCollectionArtiste`
- fichier retiré : `src/lib/__tests__/retourCollectionArtiste.test.ts`
- une entrée sans fiche vide la fiche ouverte
- un état nul (entrée initiale Safari) vide aussi
- une entrée qui portait un album le fait RECHARGER — c’est le niveau sauté
- la fiche déjà à l’écran est gardée — pas de rechargement inutile
- une entrée hors Bibliothèque ne recharge RIEN, même si elle porte des id
- la fiche artiste suit exactement la même règle
- collection → album → artiste
- forme fautive — le retour dépose sur la GRILLE, un écran jamais visité
- forme corrigée — le retour revient à la fiche album de la collection
- forme corrigée — le retour suivant rentre dans la collection, pas sur sa liste
- la forme fautive saute un cran : deux appuis pour la collection au lieu de trois
- « Précédent » du navigateur revient lui aussi à la fiche album
- « Suivant » repart en avant sans rien perdre
- la forme fautive perd les deux sens
- la grille de la Bibliothèque reste atteignable en remontant tout en haut
- le gestionnaire s’en remet à `reconcilierFiche`
- la règle « nettoyer sans jamais rétablir » a bien disparu
- le vidage, lui, est CONSERVÉ — la fiche fantôme de Safari
- le rechargement ne ré-empile pas d’entrée d’historique
- une fiche périmée n’est pas plaquée sur un écran que l’utilisateur a quitté
- `navigateToAlbum` mémorise la collection ouverte
- le montage la ré-ouvre

## `retourConteneurDefilant`
- fichier retiré : `src/lib/__tests__/retourConteneurDefilant.test.ts`
- rend la grille d’albums, et non les deux conteneurs qui ne défilent pas
- contre-épreuve : les cibles d’origine mémorisaient 0 là où il y avait 600
- reconnaît qu’un conteneur ne défile pas quand son contenu tient dedans
- à défaut de conteneur défilant, rend le premier présent plutôt que rien
- suit la disposition : l’onglet Années porte son propre ascenseur
- la liste d’artistes défile bien dans `.library-scroller` — pas de régression
- attend que la liste soit assez haute avant d’écrire la position
- n’attend pas indéfiniment : après 30 essais elle écrit quand même
- supporte un conteneur pas encore monté : elle le redemande à chaque essai
- ne fait rien pour une cible nulle — écrire 0 écraserait une restauration en cours
- App.svelte mémorise la position sur le conteneur qui défile
- LibraryView restaure la liste sur le conteneur qui défile

## `retourDefilementListes`
- fichier retiré : `src/lib/__tests__/retourDefilementListes.test.ts`
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

## `retourHistoriqueBibliotheque`
- fichier retiré : `src/lib/__tests__/retourHistoriqueBibliotheque.test.ts`
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

## `retourHistoriqueFiche`
- fichier retiré : `src/lib/__tests__/retourHistoriqueFiche.test.ts`
- retour d’écran : une seule opération, comme le retour navigateur
- contre-épreuve : sans l’intention, le `replace` revient et écrase la fiche
- l’entrée de la fiche survit : « suivant » peut y revenir
- fermer une fiche AUTREMENT qu’en reculant réécrit toujours l’entrée
- l’intention ne vaut que pour le retour en cours
- les mutations tournent DANS la fenêtre d’intention, avant le back()
- filet de sécurité : sans `popstate`, le drapeau retombe seul
- une mutation qui échoue ne laisse pas le drapeau levé ni le retour en plan
- App.svelte décide par `opPourFiche` au lieu d’un `replaceState` inconditionnel
- le goBack() de LibraryView annonce le retour

## `retourVueArtisteScroll`
- fichier retiré : `src/lib/__tests__/retourVueArtisteScroll.test.ts`
- forme fautive — capturer sans condition ramène en début de liste
- forme corrigée — ne mémoriser qu’en quittant une liste garde la position
- la décision elle-même : depuis une liste oui, depuis une fiche non
- la règle est importée depuis le module partagé
- la capture de `savedArtistScrollTop` est gardée par la règle
- la capture du défilement des genres est gardée elle aussi

## `serveurMediaJoignable`
- fichier retiré : `src/lib/__tests__/serveurMediaJoignable.test.ts`
- consomme le champ reachable réellement émis par le serveur
- ne déclare indisponible que le false explicite, sans inventer l ancien contrat

## `serveurMediaSeptRayons2971`
- fichier retiré : `src/lib/__tests__/serveurMediaSeptRayons2971.test.ts`
- 🔴 elle en peint SEPT, pas cinq
- elle suit l’ordre et les libellés de `RAYONS_TUNE`
- cliquer « Années » DEMANDE le conteneur `years` au serveur
- cliquer « Listes de lecture » DEMANDE le conteneur `playlists`
- un serveur tiers n’en reçoit aucun — on ne connaît pas sa racine

## `shutdownErrorHonesty`
- fichier retiré : `src/lib/__tests__/shutdownErrorHonesty.test.ts`
- un refus HTTP réarme le bouton et affiche la cause
- une coupure de transport reste compatible avec une machine déjà éteinte

## `sidebarBandcampSource`
- fichier retiré : `src/lib/__tests__/sidebarBandcampSource.test.ts`
- est rendu UNE seule fois
- est dans « Sources », après le début de cette section
- n'est plus dans « Navigation »
- reste masqué quand le plugin est absent

## `smartCollectionLimite`
- fichier retiré : `src/lib/__tests__/smartCollectionLimite.test.ts`
- l’éditeur relit la borne sauvegardée sous max_limit, pas max_albums
- l’éditeur enregistre sous le nom qu’il relit
- le type SmartCollection suit la réponse réelle du serveur
- le résumé des règles accepte le tableau que le serveur renvoie

## `smartCollectionV2`
- fichier retiré : `src/lib/__tests__/smartCollectionV2.test.ts`
- elle décrit tous les champs que le serveur connaît
- un champ inconnu retombe sur le texte, il ne casse pas
- « est vide » n’attend PAS de valeur
- une règle incomplète est reconnue AVANT l’enregistrement
- « entre » exige ses DEUX bornes
- la valeur de départ suit l’opérateur ET le type
- il puise dans la grammaire partagée, il ne la recopie pas
- il ANNONCE ce que les règles retiennent avant d'enregistrer
- il ne descend jamais sous UNE règle
- un FAVORI se qualifie par sa SORTE
- les RÉFÉRENCES ont chacune leur sélecteur
- la collection editee ne peut pas se referencer elle-meme
- une reference part VIDE, et une reference vide n’est pas complete
- le seul champ encore hors de portee est `credit`
- il va CHERCHER la collection à modifier
- l'écran Collections sait enfin en créer une
- leurs pochettes portent les CINQ gestes
- cliquer une carte OUVRE l'album, il ne le lance plus
- la carte n'est plus un <button>
- la fiche d'album et l'édition sont montées
- la troisième ligne y est comme ailleurs
- existe, et porte son propre type
- n'offre que « est dans » et « contient »
- n'offre PAS l'égalité, et c'est délibéré
- « est dans » est le défaut, parce qu'il attrape les sous-dossiers
- les DEUX éditeurs savent le saisir
- le sélecteur tire ses dossiers de la BASE, pas du disque
- les cinq libellés existent dans les onze langues

## `streamingFavoritesContext`
- fichier retiré : `src/lib/__tests__/streamingFavoritesContext.test.ts`
- le double-clic et le bouton transmettent tous deux l index de la liste
- aucune action des favoris ne retombe sur la lecture d une piste isolée

## `streamingFeaturedGate`
- fichier retiré : `src/lib/__tests__/streamingFeaturedGate.test.ts`
- loadFeatured existe et son corps est délimitable
- les intitulés ne sont pas publiés avant les données
- intitulés et données sont affectés ensemble, sous la garde service === s
- le drapeau de chargement ne retombe que pour le service affiché

## `streamingNavGuard`
- fichier retiré : `src/lib/__tests__/streamingNavGuard.test.ts`
- le corps de la remise à zéro est appelé sous untrack
- untrack est importé depuis svelte
- resetForService efface bien la navigation par genre
- les chargeurs restent DANS le corps untracké, pas dans l’effet

## `supportSystemeV2`
- fichier retiré : `src/lib/__tests__/supportSystemeV2.test.ts`
- l'écran a bien les trois volets qui manquaient
- les quatre sondes du diagnostic sont INDÉPENDANTES
- le schéma est rendu par MERMAID, charge en import differe
- le dessin fait main RESTE, en secours
- le rendu suit le theme et ne se marche pas dessus
- les deux écrans partagent le MÊME générateur
- une zone sans identifiant ne figure pas au schéma
- une zone dont le serveur ne dit rien est réputée EN LIGNE
- le Mermaid échappe ce qui casserait son analyseur
- une zone hors ligne se dessine en pointillés, des deux côtés
- le serveur est centré sur la hauteur des zones, pas posé en haut
- le plan n'invente pas de colonne d'appareils quand aucune zone n'en a

## `terminologieEqMesure`
- fichier retiré : `src/lib/__tests__/terminologieEqMesure.test.ts`
- le profileur à l'oreille ne mesure rien — sa réinitialisation ne doit promettre aucune mesure
- la correction FIR part bien d'une mesure — elle doit continuer à le dire
- le bouton « Réinitialiser » du profileur ne touche effectivement à aucune mesure

## `transportRecalageGuard`
- fichier retiré : `src/lib/__tests__/transportRecalageGuard.test.ts`
- l’annonce en direct d’une autre télécommande est lue
- le commentaire périmé « ni /zones ni /zones/{id} ne les portent » a disparu

## `triDynamicRangeV2`
- fichier retiré : `src/lib/__tests__/triDynamicRangeV2.test.ts`
- 🔴 la clé de tri existe — elle s’arrêtait à « added »
- 🔴 il ne PARAÎT que s’il trie quelque chose
- 🔴 un tri devenu indisponible ne reste pas ACTIF
- 🔴 « 0 » est une VRAIE valeur, pas une absence
- les albums SANS tag sortent en DERNIER, jamais à zéro
- l’écran ACTUEL l’a bien — c’est la référence de la parité

## `typeDeZoneSonosFantome`
- fichier retiré : `src/lib/__tests__/typeDeZoneSonosFantome.test.ts`
- « sonos » n’est pas offert comme type de zone
- aucun sélecteur d’enceintes Sonos ne subsiste dans la modale
- tout autre type proposé est routable par le serveur

## `v2OuvrirTicket`
- fichier retiré : `src/lib/__tests__/v2OuvrirTicket.test.ts`
- appelle la route de création
- envoie du MULTIPART, pas du JSON
- les diagnostics restent OPTIONNELS et ne font pas échouer l’envoi
- les refus passent par le module partagé, qui porte le délai ET le motif
- chaque clé de catégorie du nouvel écran est traduite
- celles du client actuel aussi, désormais

## `verrouVolumeBadgeAppareil`
- fichier retiré : `src/lib/__tests__/verrouVolumeBadgeAppareil.test.ts`
- hérité ACTIVÉ : la zone n’a pas de réglage, le général verrouille
- hérité DÉSACTIVÉ : pas de surcharge, le général ne verrouille pas
- SURCHARGÉ à « activé » : la zone décide, contre un général à l’arrêt
- SURCHARGÉ à « désactivé » : la zone échappe à un général qui verrouille
- `lock_volume` ABSENT vaut « hérité », pas « surchargé »
- sans `effective_lock_volume`, aucun badge — on ne devine pas
- état absent (requête en vol ou en échec) : aucun badge
- un `effective_lock_volume` non booléen ne passe pas pour vrai
- elle passe par le module de décision, pas par un calcul local
- elle ne rejoue jamais l’héritage `surcharge ?? global` côté client
- le badge reste en LECTURE SEULE : aucun contrôle sur la carte
- un état inconnu n’affiche rien du tout dans le gabarit
- les onze dictionnaires sont bien onze
- ${locale} : les cinq clés existent et ne sont pas vides
- la formulation dit « verrouillé » et « libre », pas la même chose deux fois

## `viderLaSuite1085`
- fichier retiré : `src/lib/__tests__/viderLaSuite1085.test.ts`
- sans argument, le corps reste ABSENT — la forme d'avant, inchangée
- l'appel passe bien le drapeau
- le bouton existe et appelle le bon geste
- 🔴 il ne s'affiche QUE s'il reste quelque chose après la piste en cours
- le geste « Vider » d'origine est intact
- 🔴 `keep_current` a sa propre branche, AVANT celle qui arrête tout
- cette branche recharge la file et ne remet RIEN à zéro
- la branche d'arrêt, elle, garde ses remises à zéro

## `volumeCentPourCentDistinct`
- fichier retiré : `src/lib/__tests__/volumeCentPourCentDistinct.test.ts`
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

## `zoneDansHistorique1739`
- fichier retiré : `src/lib/__tests__/zoneDansHistorique1739.test.ts`
- 🔴 le NUMÉRO du serveur devient le NOM de la zone
- une zone INCONNUE retombe sur le libellé fabriqué, jamais sur le vide
- une écoute LOCALE garde le vrai nom écrit au moment de la lecture
- sans zone du tout, rien n’est inventé
- 🔴 l’écran v2 REND la zone — c’est ce qui manquait
- l’écran ACTUEL l’affichait déjà — c’est la référence de Fabien

## `zoneInitialeV1`
- fichier retiré : `src/lib/__tests__/zoneInitialeV1.test.ts`
- sans rien de mémorisé, prend la zone QUI JOUE et non la première
- respecte un choix mémorisé encore valable
- abandonne un choix mémorisé qui a disparu de la liste
- le défaut du SERVEUR passe avant la zone qui joue
- le défaut de l APPAREIL passe avant la zone qui joue
- le défaut du serveur l emporte sur celui de l appareil
- un défaut d appareil qui ne correspond à aucune zone est ignoré
- sans zone qui joue ni défaut, retombe sur la première
- rend null sur une liste vide, sans exception
- tolère une zone sans identifiant plutôt que de rendre undefined
- la coquille V1 appelle `zoneInitiale`
- l interface actuelle aussi
- plus aucune des deux ne retombe sur `list[0]` à la main

## `zoneRegardee`
- fichier retiré : `src/lib/__tests__/zoneRegardee.test.ts`
- oui, quand c’est la même zone
- 🔴 NON, quand c’est une autre zone — c’était le défaut #753
- oui, quand les deux zones sont dans le même groupe
- non, quand les groupes diffèrent
- 🔴 deux ABSENCES de groupe ne se rencontrent pas
- un événement sans zone ne concerne personne
- sans zone courante, rien ne concerne l’écran
- une zone émettrice inconnue de la liste ne devient pas solidaire
- ne vide plus le cache de file sans condition

## `boutonSuivant`
- fichier retiré : `src/lib/boutonSuivant.test.ts`
- désactive sur la dernière piste, répétition éteinte
- laisse actif tant qu'il reste un titre après
- laisse actif en répétition « all » même sans suite immédiate
- laisse actif en répétition « one » sur la dernière piste
- désactive à la fin RÉELLE du tirage, même loin de la fin brute
- reste actif sur la dernière position BRUTE si le tirage a une suite
- NE désactive PAS sur la dernière piste de l'ordre BRUT
- reste actif au milieu du tirage
- ne laisse pas playState réactiver un bouton sans suite
- conserve le repli historique quand le serveur ne porte pas le champ
- ${composant} transmet can_skip_next à la règle partagée
- désactive à l'arrêt, sans piste et sans YouTube
- laisse actif quand une vidéo YouTube pilote sa propre suite
- laisse actif à l'arrêt si une piste est chargée et qu'il reste une suite

## `chargementPistesStreamingEcran`
- fichier retiré : `src/lib/chargementPistesStreamingEcran.test.ts`
- selectAlbum passe par le chargeur borné, et n’attend plus l’API à nu
- le catch muet a disparu des quatre chargeurs de fiche
- l’échec vide la liste au lieu de garder les pistes de la fiche d’avant
- l’échec est DIT : motif à l’écran et bandeau
- la borne est finie, et passée au chargeur
- une réponse périmée ne touche ni aux pistes ni au témoin
- quitter une fiche en cours de chargement annule sa demande
- les trois fiches ont bien DEUX sorties dans le gabarit
- le bloc d’erreur propose de relancer la fiche affichée

## `moodMixFileEcrasee`
- fichier retiré : `src/lib/moodMixFileEcrasee.test.ts`
- file serveur non vide, cache client vide : on ajoute, on n’écrase pas
- le serveur seul décide : `length` non nul suffit, même sans `tracks`
- `tracks` non vide suffit aussi, même si `length` annonce zéro
- lecture de la file en échec : on ajoute, on ne remplace pas
- réponse illisible : doute, donc ajout
- file serveur vraiment vide : on joue, comme avant
- la file est lue AVANT toute décision, une seule fois
- ${fichier} : ${fonction} ne tranche plus sur le cache client

## `porteeRepertoireAleatoire`
- fichier retiré : `src/lib/porteeRepertoireAleatoire.test.ts`
- accepte une option `folder`
- l'écrit dans la chaîne de requête sous le nom que le serveur attend
- lit `scopedFolder` — la variable qui porte la pastille
- la met sous la clé `folder` — vérifié sur la RÈGLE, plus sur sa recopie
- passe bien la portée de l'écran à la règle
- laisse partir la recherche AVEC le répertoire, pas à sa place
- n'envoie pas le genre en même temps que le répertoire
- la branche « genre parent / sans genre » est gardée par `!scopedFolder`
- `scopedFolder` compte comme une portée pour le libellé et pour l’infobulle
- le libellé et l'infobulle lisent la MÊME expression

## `radioFranceSource`
- fichier retiré : `src/lib/radioFranceSource.test.ts`
- ne sonde plus la route quand le serveur déclare l'absence de clé
- interroge les émissions quand la clé est déclarée posée
- retombe sur l'ancienne détection face à un serveur antérieur au drapeau
- ne prend pas une chaîne « false » pour un oui
- survit à une configuration absente ou illisible
- consulte la configuration au lieu de provoquer le refus
- n'appelle plus loadRfShows sans condition à l'ouverture de l'écran

## `rechercheContexte`
- fichier retiré : `src/lib/rechercheContexte.test.ts`
- rejoue la recherche du passage précédent
- une demande venue d'un autre écran prime sur le contexte
- laisse la vue à son écran de découverte quand il n’y a rien à rejouer
- ignore une requête qui ne contient que des espaces
- enregistre un instantané de sa requête à chaque changement
- relit cet instantané à son montage, via la décision isolée
- annonce la recherche globale comme provenance en ouvrant un album de service
- annonce la même provenance en ouvrant une fiche artiste de service
- selectArtist n'efface plus la provenance sans condition
- selectArtist accepte de conserver la provenance de l'écran d'appel
- l'entrée par un autre écran conserve la provenance
- la restauration de position conserve elle aussi la provenance

## `rechercheTotaux`
- fichier retiré : `src/lib/rechercheTotaux.test.ts`
- « 50 sur 731 » quand le serveur compte
- un serveur qui ne compte pas (avant la 0.9.132) : le compte affiché, sans invention
- tout est là : un seul nombre
- le plafond de comptage se lit « au moins »
- les pistes des services et celles trouvées par métadonnées comptent dans le total
- existe quand le serveur le dit, et seulement alors
- se demande au rang offset + limit, pas à la longueur de la liste
- fusionne la page à la suite de la liste, sans doublon, sans muter, et relit has_more
- la dernière page éteint la suite et ne touche pas has_more des autres familles
- le compteur des pistes n'est plus la longueur de la liste
- un « voir plus » demande la suite locale par offset

## `streamingRetour`
- fichier retiré : `src/lib/streamingRetour.test.ts`
- remonte à la fiche artiste quand l'album a été ouvert depuis celle-ci
- retombe à la racine du service pour un album ouvert hors fiche artiste
- retombe à la racine du service depuis une fiche artiste
- retombe à la racine du service depuis une playlist
- une provenance externe ramène à l'écran d'origine
- dépile le niveau album AVANT de rendre la main à la provenance
- selectAlbum ne vide plus le niveau artiste sans condition
- selectAlbum accepte de venir d'une fiche artiste
- la discographie de l'artiste ouvre les albums en gardant son niveau
- goBack s'en remet à actionRetour plutôt qu'à ses propres conditions
- actionRetour est bien importé par le composant

## `streamingRetourRestauration`
- fichier retiré : `src/lib/streamingRetourRestauration.test.ts`
- rouvre l'artiste PUIS l'album quand les deux niveaux étaient ouverts
- ne rouvre que l'album quand il n'y avait pas d'artiste dessous
- rouvre la seule fiche artiste quand aucun album n'était ouvert
- le fil de genres prime sur tout le reste
- rouvre la playlist du service quand c'est elle qui était ouverte
- rejoue la recherche quand rien n'était ouvert par-dessus
- ne rouvre rien quand la position était la racine du service
- restaurerContexte existe toujours
- restaurerContexte s'en remet à etapesDeRestauration
- restaurerContexte ne rouvre plus l'album en écrasant l'artiste
- etapesDeRestauration est bien importé par le composant

## `suiviPisteEnCours`
- fichier retiré : `src/lib/suiviPisteEnCours.test.ts`
- consomme la décision partagée au lieu de la réécrire sur place
- #1096 : ne recharge plus la file entière sans condition
- #1096 : prend la position portée par l’événement
- #72/#75 : relance la synchro tant que le chemin du signal manque
- prend l’index annoncé, y compris la première piste
- refuse tout ce qui n’est pas un index — mieux vaut recharger que mentir
- ne recharge PLUS sur une simple avance de piste
- recharge au démarrage : le contenu peut être neuf
- recharge contre un serveur qui ne porte pas la position
- réessaie sur une zone qui joue sans chemin de signal
- ne renonce PAS sur un état transitoire — le défaut corrigé par #75
- s’arrête dès que le chemin est résolu — coût nul en régime établi
- s’arrête sur un arrêt franc ou une zone disparue
- borne le budget et l’élargit assez pour un démarrage lent

