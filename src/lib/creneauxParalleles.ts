/**
 * UN NOMBRE BORNÉ DE TÂCHES EN VOL — renesenses/tune-web-client#1152.
 *
 * ## Le défaut que ce module existe pour corriger
 *
 * Belkadi Yacine, fil 1785 : « la page d'accueil ne charge pas les widgets
 * sans plusieurs rafraîchissements ». Sa capture du 14/09/2026 montre trois
 * widgets sur trois tombés avec le même motif, `(delai)` — le verdict du
 * `Promise.race` de `PageWidgets`, huit secondes.
 *
 * L'instruction de l'issue s'arrête là : « reste ouvert, *où* les 8 s sont
 * passées ». Voici où elles peuvent passer sans que le serveur y soit pour
 * quoi que ce soit.
 *
 * `PageWidgets` lançait ses widgets D'UN SEUL COUP — `for (const id of
 * disposition) chargerWidget(id)` — et chaque `chargerWidget` armait son
 * compte à rebours de huit secondes AU MOMENT DE L'APPEL. Or un navigateur
 * n'ouvre pas autant de connexions qu'on lui demande de requêtes : la limite
 * usuelle est de SIX par origine en HTTP/1.1, et le client de Tune parle à son
 * serveur en HTTP/1.1. `DISPOSITION_DEFAUT` compte six widgets, la ligne de
 * chiffres en demande d'autres, et la coquille a les siennes (zones, profils,
 * bibliothèque, licence…).
 *
 * Résultat : les premières requêtes partent, les suivantes attendent un
 * socket — et leur budget de huit secondes s'écoule PENDANT CETTE ATTENTE. Un
 * serveur qui répond en cinq secondes, parfaitement sain, fait tomber en
 * `(delai)` tout ce qui n'a pas pu partir dans les trois premières. C'est le
 * seul mécanisme connu qui explique la forme exacte de la capture : TROIS
 * routes sans rapport — `/home/artist-releases` (réseau), `/library/albums/
 * recent` et `/library/stats` (deux lectures SQLite locales) — tombant
 * ENSEMBLE. Une lenteur de route ne les ferait pas tomber toutes les trois ;
 * une file d'attente commune, si.
 *
 * Et le rafraîchissement, lui, finit par marcher : au tour suivant les
 * réponses sont en cache, la file se vide plus vite, et tout passe sous les
 * huit secondes. « Plusieurs rafraîchissements », mot pour mot.
 *
 * ## Ce que ce module change, et ce qu'il ne change PAS
 *
 * Il ne raccourcit rien et ne rend pas la page plus rapide : avec un plafond
 * égal à celui du navigateur, les widgets se servent dans le MÊME ordre et le
 * dernier arrive au MÊME instant. Ce qui change, c'est que le compte à rebours
 * de chacun démarre quand sa tâche PART, pas quand on la met dans la file. Le
 * délai mesure enfin le serveur au lieu de mesurer l'embouteillage du
 * navigateur.
 *
 * 🔴 LE JETON EST RENDU MÊME QUAND LA TÂCHE ÉCHOUE. C'est le seul vrai piège
 * de cette forme : un créneau qu'on oublie de rendre sur le chemin d'erreur
 * assèche la file pour la vie de la page — et le symptôme serait exactement
 * celui qu'on corrige, en pire (plus rien ne charge, jamais). D'où le
 * `finally`, et le témoin qui le tient.
 */

/**
 * Rend une fonction `poser(tache)` qui n'exécute jamais plus de `max` tâches
 * à la fois. Les autres attendent leur tour, dans l'ordre où elles ont été
 * posées, et ne sont CRÉÉES qu'au moment de partir — c'est tout l'intérêt :
 * ce qui se compte dans la tâche (un délai, une horloge) ne court pas pendant
 * l'attente.
 *
 * La promesse rendue est celle de la tâche : succès, échec et valeur passent
 * sans être touchés.
 */
export function creneauxParalleles(max: number): <T>(tache: () => Promise<T>) => Promise<T> {
  const plafond = Math.max(1, Math.floor(max));
  let enVol = 0;
  const attente: Array<() => void> = [];

  function rendre() {
    enVol--;
    // `shift` et non `pop` : l'ordre de la disposition est celui de l'écran,
    // et un widget posé en haut de page ne doit pas se charger en dernier.
    const suivant = attente.shift();
    if (suivant) suivant();
  }

  return function poser<T>(tache: () => Promise<T>): Promise<T> {
    return new Promise<T>((resoudre, rejeter) => {
      const partir = () => {
        enVol++;
        let p: Promise<T>;
        try {
          p = Promise.resolve(tache());
        } catch (e) {
          // Une tâche qui jette AVANT de rendre sa promesse — un accès à une
          // propriété d'un objet absent, par exemple — doit rendre son créneau
          // comme les autres.
          rendre();
          rejeter(e);
          return;
        }
        p.then(resoudre, rejeter).finally(rendre);
      };
      if (enVol < plafond) partir();
      else attente.push(partir);
    });
  };
}
