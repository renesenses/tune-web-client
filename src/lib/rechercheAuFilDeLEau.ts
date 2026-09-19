/**
 * LE DEUXIÈME TEMPS DE LA RECHERCHE — chaque service se pose dès qu'il répond.
 *
 * Bertrand, 19/09/2026 : « La recherche se fait en deux temps : local puis
 * streaming. Il ne faut pas faire patienter l'utilisateur ».
 *
 * Le premier temps allait déjà : `SearchV2` lance `searchLibrary` et la
 * recherche de services en parallèle, et `busy` ne suit que le local. Le
 * second était un BLOC : un appel `/search` rendait les quatre services d'un
 * coup, et rien de Qobuz ne paraissait tant que YouTube n'avait pas répondu.
 *
 * Mesuré sur le .18 (0.9.155), requête « coltrane », à chaud :
 *
 *     qobuz     0,13 s        les quatre en un appel, à la file : 1,20 s
 *     tidal     0,03 s        le plus lent seul                 : 0,42 s
 *     youtube   0,42 s
 *     bandcamp  0,30 s
 *
 * renesenses/tune-server-rust#4495 a ramené le bloc de 1,20 s à ~0,42 s en les
 * interrogeant sous `join_all`. Ce module va au bout : un appel PAR service,
 * et Tidal paraît à 0,03 s sans attendre personne.
 *
 * ## 🔴 LE REPLI, ET POURQUOI IL EXISTE
 *
 * Chercher service par service oblige l'écran à CONNAÎTRE la liste avant de
 * chercher, donc à demander `/streaming/services`. Or `statutsStreaming` avale
 * ses erreurs en rendant `{}` : un échec, un délai, un profil sans service
 * enregistré, et la volée ne part sur RIEN — zéro résultat de streaming, sans
 * un mot. C'est le défaut de #1231 à l'identique, et vingt tests existants
 * l'ont montré en rougissant quand cette version est passée la première fois.
 *
 * D'où la règle de ce module, qui n'est pas un détail d'implémentation :
 *
 *     liste de services connue et non vide  →  un appel par service
 *     liste vide, ou inconnue               →  UN appel, `sources=streaming`
 *
 * Le repli rend exactement ce que rendait la version d'avant. Il n'y a donc
 * aucun cas où l'écran montre moins qu'avant : au pire il montre la même
 * chose, un peu plus tard.
 */
import { SOURCES_SERVICES } from './sourcesRecherche';
import type { FederatedSearchResult, SearchResult } from './types';

/**
 * Le bloc d'UN service dans une réponse fédérée.
 *
 * 🔴 On ne prend pas « la première clé venue » : un serveur qui rendrait deux
 * blocs poserait les résultats de l'un sous le nom de l'autre — un album Tidal
 * affiché comme un album Qobuz. On lit la clé DEMANDÉE, et rien d'autre.
 */
export function blocDuService(
  service: string,
  reponse: FederatedSearchResult | null | undefined,
): SearchResult | null {
  return reponse?.services?.[service] ?? null;
}

/**
 * La forme que prend le deuxième temps, selon ce qu'on sait des services.
 *
 * Extraite pour être décidable SANS lancer d'appel : c'est la règle du repli,
 * et elle doit pouvoir rougir seule.
 */
export type PlanDuDeuxiemeTemps =
  | { voie: 'par-service'; services: string[] }
  | { voie: 'un-seul-appel'; sources: string[] };

export function planDuDeuxiemeTemps(
  services: readonly string[] | null | undefined,
): PlanDuDeuxiemeTemps {
  const connus = (services ?? []).map((s) => s.trim()).filter(Boolean);
  if (connus.length === 0) {
    // 🔴 Le repli. Sans lui, un `/streaming/services` muet vide l'écran.
    return { voie: 'un-seul-appel', sources: [SOURCES_SERVICES] };
  }
  return { voie: 'par-service', services: connus };
}

/**
 * Lancer le deuxième temps et POSER chaque réponse dès son arrivée.
 *
 * `aJour` est relu à CHAQUE réponse, jamais une seule fois au départ : une
 * frappe pendant les appels invalide la volée, et une réponse en retard ne
 * doit pas venir écraser les résultats de la recherche suivante. C'est le
 * `mine === seq` de l'écran, passé en paramètre pour rester testable.
 *
 * Un service qui échoue ne fait rien tomber : les autres se posent quand même.
 * La promesse rendue n'est là que pour savoir quand le deuxième temps est
 * fini — elle ne rejette jamais.
 */
export function chercherAuFilDeLEau(
  plan: PlanDuDeuxiemeTemps,
  chercher: (sources: string[]) => Promise<FederatedSearchResult>,
  poser: (service: string, resultats: SearchResult) => void,
  aJour: () => boolean,
): Promise<void> {
  if (plan.voie === 'un-seul-appel') {
    // Le repli : un appel, et on pose TOUT ce qu'il rend — on ne sait pas
    // d'avance quels services répondront, c'est justement le cas où on
    // l'ignore.
    return chercher(plan.sources)
      .then((r) => {
        if (!aJour()) return;
        for (const [svc, bloc] of Object.entries(r?.services ?? {})) {
          if (bloc) poser(svc, bloc);
        }
      })
      .catch(() => undefined);
  }
  return Promise.all(
    plan.services.map((svc) =>
      chercher([svc])
        .then((r) => {
          if (!aJour()) return;
          const bloc = blocDuService(svc, r);
          if (bloc) poser(svc, bloc);
        })
        .catch(() => {
          /* Un service muet n'entre pas dans la réponse — règle du serveur. */
        }),
    ),
  ).then(() => undefined);
}
