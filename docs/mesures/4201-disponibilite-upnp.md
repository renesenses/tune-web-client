# Bibliothèque UPnP — lot 3 : disponibilité visible

Suivi #4201, PR #1046. Code validé localement, non déployé.

Les cartes d'album, fiches album et listes de pistes (tableau et lignes)
affichent le dernier état connu de leur serveur UPnP. Les noms proviennent
du registre durable de Tune. Aucun album ni aucune piste n'est retiré par
ce marquage, et la lecture reste possible à la demande.

| Constat | Libellé français |
|---|---|
| Annonce SSDP récente | Serveur détecté |
| Plus revu récemment, mais pas déclaré absent | Non revu récemment |
| Présence qualifiée absente par le serveur | Serveur absent |
| Serveur désactivé par l'utilisateur | Serveur désactivé |
| Registre indisponible ou données insuffisantes | État inconnu |

Une annonce réseau ne prouve pas qu'un fichier est lisible. Le texte décrit
donc le serveur, sans annoncer une lecture garantie.

Un magasin partagé interroge le registre toutes les 30 secondes pendant
qu'une vue concernée est montée. Il ne lance pas une requête par carte.
Une requête sans réponse est annulée après huit secondes et rend l'état
inconnu ; les réponses tardives après démontage sont ignorées.

Tests DOM : extinction puis retour sur Albums et Pistes, conservation du
catalogue, maintien d'une URL de pochette locale pendant une panne de
registre. Tests de qualification : absence d'annonce récente, serveur
désactivé, réponse ancienne ou inconnue. Test de requête suspendue : l'état
devient inconnu puis récupère au sondage suivant.

Contre-épreuve : faire qualifier « présent » un serveur explicitement absent
fait échouer le scénario DOM avec « Serveur détecté » reçu à la place de
« Serveur absent ». Restauration par copie ; 81 tests ciblés API et interface
passent. Traductions présentes dans les onze langues.

Validation finale sous Node 22.23.2 : `npm test -- --maxWorkers=4` passe
(406 fichiers, 4 541 tests), ainsi que le build Vite. Le contrôle Svelte
ne relève aucune nouvelle erreur par rapport au socle existant.

Les images hors connexion nécessitent le cache serveur de la PR #4205 et
une synchronisation des sources. Les tests DOM ne remplacent pas une revue
visuelle dans un navigateur ni une qualification sur les appareils réels.
