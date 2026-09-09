# Agents Tune

Ces règles s’appliquent aux agents OpenAI/Codex, Claude et aux humains. La
doctrine canonique est
[`tune-gouvernance/regles/RELEASE.md`](https://github.com/renesenses/tune-gouvernance/blob/main/regles/RELEASE.md)
et le runbook opératoire est
[`tune-server-rust/docs/RELEASE-OPERATIONS.md`](https://github.com/renesenses/tune-server-rust/blob/main/docs/RELEASE-OPERATIONS.md).

- travailler dans un worktree isolé, depuis la RC active ;
- ouvrir les PR unitaires vers `rc/vX.Y.Z` avec les tests ciblés ;
- demander la batterie complète pour tout changement CI, release ou transversal ;
- ne jamais pousser directement dans `rc/*` ou `main` ;
- seule une PR `rc/* -> main` peut promouvoir une release ;
- ne jamais fusionner, taguer ou publier depuis un agent de correctif ;
- sans instruction humaine explicite portant sur l'étape précise, ne modifier
  ni protection, ni environnement, ni secret, ni variable d'armement ;
- un dry-run vert ne donne jamais l'autorisation de franchir le STOP suivant ;
- un échec, un check absent ou une situation inconnue bloque la promotion.

Le contrôleur de release de `tune-server-rust` épingle le SHA exact de ce
dépôt dans son manifeste. Le tag du composant ne peut être créé qu’après que
ce SHA est devenu atteignable depuis `main`.

Les consignes techniques locales peuvent renforcer ces règles, jamais les
assouplir.
