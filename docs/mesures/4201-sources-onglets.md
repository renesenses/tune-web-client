# Bibliothèque unifiée — lot 2 : sources dans les trois onglets

Suivi : renesenses/tune-server-rust#4201. Suite du commit `3fa24a54`, dans
la PR web #1046 vers `rc/v0.9.150`. Code en préparation, non déployé.

## Comportement

- Source reste accessible dans Albums, Artistes et Pistes. La sélection se
  conserve au changement d'onglet ; « Toutes les sources » retire seulement
  cette sélection, sans effacer la recherche.
- Le menu propose Local, l'ensemble UPnP et chaque serveur nommé. Les sources
  intégrées sans contenu visible restent proposées à zéro.
- Les comptes suivent la recherche et l'onglet. Un artiste partagé entre deux
  serveurs compte une fois dans UPnP et une fois dans Toutes les sources.
- Les appartenances des artistes reposent sur les identifiants des albums et
  des pistes : les artistes de compilations sont inclus. La liste générale
  conserve les artistes sans album, depuis l'API artistes existante.
- Les pistes sont filtrées avant la limite des 500 lignes affichées. Les
  filtres propres aux albums ne masquent plus cette liste ni son état vide.
- La fiche artiste, ses commandes de lecture et l'aléatoire de bibliothèque
  respectent la source sélectionnée. Les pistes indexées, y compris UPnP,
  sont adressées par leurs identifiants de la base Tune.

## Validation

Le test DOM `sourcesOnglets4201.test.ts` monte les vrais composants, clique
les menus et vérifie les données envoyées à la lecture. Son catalogue porte
du local, deux serveurs UPnP, un serveur intégré vide, un artiste partagé,
un soliste de compilation et un artiste sans album. Un scénario place une
piste UPnP après 501 pistes locales pour vérifier l'ordre filtre/limite.

Les tests existants de portée dossier, de source et de contexte de lecture
artiste restent dans la validation.

Contre-épreuve exécutée : faire accepter toutes les sources par
`sourceCorrespond` provoque cinq échecs sur les six scénarios DOM (pistes
locales présentes sous UPnP, mauvais comptes, albums hors source). La fonction
est restaurée par copie, puis les six scénarios et les treize tests existants
de l'onglet Pistes passent. Le build Vite sous Node 22.23.2 passe également.

Suite complète sous Node 22.23.2 : 405 fichiers, 4 537 tests passent.
Les contrôles de types par rapport au socle, traductions (11 langues),
styles et dialogues passent. `git diff --check` passe.

## Portée et limites

Les appartenances sont calculées côté client avec le chargement paginé des
pistes existant, partagé entre Artistes et Pistes. Cela ajoute ce chargement
à la première ouverture d'Artistes. Les performances sur de très gros
catalogues restent à qualifier dans le lot final. La portée dossier conserve
le plafond existant de 5 000 pistes.

Les tests DOM ne constituent pas une vérification visuelle dans un navigateur
réel. Disponibilité hors connexion, pochettes en cache, identité après
réindexation et parité audio restent les lots suivants.
