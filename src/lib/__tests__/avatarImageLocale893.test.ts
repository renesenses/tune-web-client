/**
 * #893 — se donner une photo dans la bulle du coin haut-droit.
 *
 * La bulle n'avait qu'une source : `GET /cloud/sso/status` → `user.avatar_url`,
 * la photo du compte mozaiklabs.fr. Sur un serveur personnel sans nuage
 * configuré, il n'existait AUCUN moyen de s'en donner une, et deux testeurs
 * l'ont demandé à un jour d'intervalle (fils 1681 et 1676) ; l'un des deux
 * s'en croyait bloqué pour tester la nouvelle interface.
 *
 * Ce fichier tient les deux moitiés du correctif :
 *
 *  - le TRAITEMENT de l'image (`lib/avatarLocal`), testable pour de vrai —
 *    cadrage, refus motivés, encodage borné ;
 *  - le CÂBLAGE du menu et des préférences, vérifié sur la source. Le rendu
 *    Svelte demanderait un DOM, un canevas et un décodeur d'images ; le banc
 *    tourne en `environment: 'node'`. Une garde de source dit franchement ce
 *    qu'elle regarde, là où un test de rendu à moitié simulé passerait au vert
 *    sans rien avoir exécuté.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AvatarRefuse,
  CLE_MESSAGE,
  COTE_MAX,
  POIDS_ENCODE_MAX,
  QUALITES,
  TAILLE_SOURCE_MAX,
  avatarDepuisFichier,
  cadreCarre,
  encodeCanevas,
  estDataUrlImage,
  octetsDataUrl,
  verifieFichier,
} from '../avatarLocal';

/* ───────────────────────── Le traitement de l'image ───────────────────── */

describe('cadreCarre — un carré pris au centre, jamais agrandi', () => {
  it('découpe au centre d’une image large', () => {
    const c = cadreCarre(1000, 400);
    expect(c.source, 'le carré doit prendre le plus petit côté').toBe(400);
    expect(c.sx, 'le carré n’est pas centré horizontalement').toBe(300);
    expect(c.sy).toBe(0);
  });

  it('découpe au centre d’une image haute', () => {
    const c = cadreCarre(400, 1000);
    expect(c.source).toBe(400);
    expect(c.sx).toBe(0);
    expect(c.sy, 'le carré n’est pas centré verticalement').toBe(300);
  });

  it('réduit une grande photo au côté annoncé', () => {
    expect(cadreCarre(4000, 3000).cible).toBe(COTE_MAX);
  });

  it('🔴 n’agrandit JAMAIS une petite icône', () => {
    // Une favicon de 48 px redessinée à 192 sortirait floue et plus lourde que
    // l'originale, pour zéro pixel de détail gagné.
    expect(cadreCarre(48, 48).cible).toBe(48);
    expect(cadreCarre(60, 48).cible).toBe(48);
  });

  it('ne produit jamais un côté nul', () => {
    // `canvas.width = 0` lève à `drawImage`, et un canevas de côté 0 encodé
    // donnerait une data-URL valide représentant… rien.
    expect(cadreCarre(1, 1).cible).toBeGreaterThan(0);
  });
});

describe('verifieFichier — refuser AVANT de décoder, et dire pourquoi', () => {
  it('refuse ce qui n’est pas une image, avec le motif', () => {
    expect(() => verifieFichier('application/pdf', 1000)).toThrowError(AvatarRefuse);
    try {
      verifieFichier('application/pdf', 1000);
    } catch (e) {
      expect((e as AvatarRefuse).motif).toBe('type');
    }
  });

  it('refuse un type vide — un fichier sans extension connue', () => {
    expect(() => verifieFichier('', 1000)).toThrowError(AvatarRefuse);
  });

  it('refuse une source démesurée, sans la décoder', () => {
    // Le point de ce contrôle : une image de 100 mégapixels fait allouer des
    // centaines de mégaoctets AVANT qu'on ait pu la réduire, et l'onglet gèle
    // sans message.
    try {
      verifieFichier('image/jpeg', TAILLE_SOURCE_MAX + 1);
      expect.unreachable('une source au-delà du plafond doit être refusée');
    } catch (e) {
      expect((e as AvatarRefuse).motif).toBe('taille');
    }
  });

  it('laisse passer une photo de téléphone ordinaire', () => {
    expect(() => verifieFichier('image/jpeg', 4 * 1024 * 1024)).not.toThrow();
  });

  it('chaque motif de refus a un message à l’écran', () => {
    // Un « ça n'a pas marché » sans cause renvoie l'utilisateur réessayer le
    // même fichier indéfiniment.
    for (const motif of ['type', 'taille', 'lecture', 'poids'] as const) {
      expect(CLE_MESSAGE[motif], `le motif ${motif} n’a pas de message`).toMatch(
        /^settings\.avatar/,
      );
    }
    expect(new Set(Object.values(CLE_MESSAGE)).size, 'deux motifs partagent un message').toBe(4);
  });
});

describe('estDataUrlImage — ce qui revient du serveur n’est pas de confiance', () => {
  const image = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4H';

  it('accepte la forme que ce client écrit', () => {
    expect(estDataUrlImage(image)).toBe(true);
  });

  it('accepte le rembourrage base64', () => {
    expect(estDataUrlImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(estDataUrlImage('data:image/png;base64,iVBORw0KGg==')).toBe(true);
  });

  it('🔴 refuse une URL qui n’est pas une donnée d’image', () => {
    // `avatarImage` est relu depuis `ui_preferences`, donc depuis le serveur,
    // et posé dans l'attribut `src` d'une balise. C'est une valeur distante.
    // Les charges utiles sont volontairement inertes : `check-native-dialogs`
    // interdit `alert(` / `confirm(` / `prompt(` dans tout `src/`, y compris
    // dans une chaîne de test, et il a raison — une regex ne sait pas qu'ici
    // ce serait une donnée.
    expect(estDataUrlImage("javascript:fetch('//exemple.test')")).toBe(false);
    expect(estDataUrlImage('https://exemple.test/photo.png')).toBe(false);
    expect(estDataUrlImage('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(estDataUrlImage('data:image/svg+xml,<svg onload=fuite()>')).toBe(false);
  });

  it('refuse ce qui n’est pas une chaîne', () => {
    expect(estDataUrlImage(undefined)).toBe(false);
    expect(estDataUrlImage(null)).toBe(false);
    expect(estDataUrlImage(42)).toBe(false);
    expect(estDataUrlImage({ toString: () => image })).toBe(false);
  });

  it('refuse une valeur gonflée au-delà du plafond', () => {
    // Sans ce plafond, une préférence trafiquée repartirait en entier dans
    // CHAQUE `PATCH /system/config`, c'est-à-dire à chaque réglage touché.
    const gonflee = 'data:image/webp;base64,' + 'A'.repeat(POIDS_ENCODE_MAX);
    expect(octetsDataUrl(gonflee)).toBeGreaterThan(POIDS_ENCODE_MAX);
    expect(estDataUrlImage(gonflee)).toBe(false);
  });
});

/** Un canevas de façade : `toDataURL` est la seule chose qu'`encodeCanevas`
 *  appelle, et c'est exactement ce qu'on veut observer. */
function canevasFactice(rendu: (type: string, q: number) => string) {
  const appels: Array<{ type: string; q: number }> = [];
  const canevas = {
    toDataURL(type: string, q: number) {
      appels.push({ type, q });
      return rendu(type, q);
    },
  } as unknown as HTMLCanvasElement;
  return { canevas, appels };
}

describe('encodeCanevas — la plus légère qui tienne', () => {
  it('garde le premier WebP qui passe sous le plafond', () => {
    const { canevas, appels } = canevasFactice(() => 'data:image/webp;base64,AAAA');
    expect(encodeCanevas(canevas)).toBe('data:image/webp;base64,AAAA');
    expect(appels, 'un seul essai suffisait').toHaveLength(1);
    expect(appels[0].q, 'le premier essai doit être la MEILLEURE qualité').toBe(QUALITES[0]);
  });

  it('baisse la qualité tant que c’est trop lourd', () => {
    // Chaque tour allège : le troisième passe. On doit s'arrêter là.
    const poids = [POIDS_ENCODE_MAX * 2, POIDS_ENCODE_MAX * 2, 1000];
    let tour = 0;
    const { canevas, appels } = canevasFactice(
      () => 'data:image/webp;base64,' + 'A'.repeat(poids[tour++] ?? 1000),
    );
    expect(octetsDataUrl(encodeCanevas(canevas))).toBeLessThanOrEqual(POIDS_ENCODE_MAX);
    expect(appels).toHaveLength(3);
  });

  it('🔴 s’arrête au premier tour quand le navigateur rend un PNG', () => {
    // `toDataURL('image/webp', q)` ne signale PAS un format inconnu : il rend
    // silencieusement un PNG. Or la qualité n'a aucun effet sur PNG — boucler
    // cinq fois produirait cinq fois la même chaîne, pour cinq encodages.
    //
    // 🔴 Le PNG de ce cas est LOURD, et c'est tout le test. Avec un PNG léger,
    // le plafond de poids rendrait la main au premier tour de toute façon :
    // supprimer la reconnaissance du repli passait au vert. Mesuré — la
    // première version de cette garde ne voyait pas le défaut qu'elle décrit.
    const lourd = 'data:image/png;base64,' + 'A'.repeat(POIDS_ENCODE_MAX * 2);
    const { canevas, appels } = canevasFactice(() => lourd);
    expect(encodeCanevas(canevas)).toBe(lourd);
    expect(appels, 'le repli PNG doit couper la recherche de qualité').toHaveLength(1);
  });

  it('un repli PNG léger est gardé tel quel', () => {
    const { canevas } = canevasFactice(() => 'data:image/png;base64,AAAA');
    expect(encodeCanevas(canevas)).toBe('data:image/png;base64,AAAA');
  });

  it('épuise les qualités sans boucler à l’infini', () => {
    const { canevas, appels } = canevasFactice(
      () => 'data:image/webp;base64,' + 'A'.repeat(POIDS_ENCODE_MAX * 2),
    );
    const rendu = encodeCanevas(canevas);
    expect(appels).toHaveLength(QUALITES.length);
    // Le résultat reste trop lourd : c'est à l'appelant de refuser, et il le
    // fait — voir le motif `poids` ci-dessous.
    expect(octetsDataUrl(rendu)).toBeGreaterThan(POIDS_ENCODE_MAX);
  });
});

describe('avatarDepuisFichier — le refus sort AVANT tout accès au DOM', () => {
  it('un fichier qui n’est pas une image est refusé sans décodeur ni canevas', async () => {
    // Ce banc n'a ni `document` ni `createImageBitmap`. Que l'appel rende un
    // refus motivé prouve que le contrôle a lieu en tête, pas après un
    // décodage : c'est ce qui protège l'onglet d'un fichier de 200 Mo.
    const faux = { type: 'application/pdf', size: 2048 } as File;
    await expect(avatarDepuisFichier(faux)).rejects.toThrowError(AvatarRefuse);
  });
});

/* ─────────────────────────── Le câblage du menu ────────────────────────── */

const MENU = fileURLToPath(new URL('../../components/v2/AvatarMenu.svelte', import.meta.url));
/**
 * La source SANS ce qu'on a écrit pour l'expliquer : un commentaire qui cite un
 * identifiant ne prouve pas qu'il est branché.
 *
 * 🔴 Le bloc `/* … *\/` n'est reconnu qu'en DÉBUT de ligne. Le motif large
 * employé ailleurs dans le dépôt ouvre un faux commentaire sur le `/*` de
 * `accept="image/*"` et mange tout jusqu'au commentaire CSS suivant — la garde
 * la plus utile de ce fichier échouait ainsi sur du code parfaitement présent.
 * Tous les vrais blocs de ce composant commencent leur ligne.
 */
const menu = () =>
  readFileSync(MENU, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('Menu avatar — la photo qu’on choisit soi-même', () => {
  it('🔴 la photo locale PRIME sur celle du compte', () => {
    // Sans cet ordre, une photo mozaiklabs.fr — qu'on ne peut pas changer
    // depuis Tune — resterait indélogeable, et le bouton « Choisir » serait
    // un bouton qui ne fait rien de visible.
    expect(menu()).toMatch(/photoLocaleCassee \? '' : photoLocale\) \|\| ssoAvatar/);
  });

  it('🔴 la BULLE ouvre l’explorateur, pas le menu', () => {
    // Geste demandé par Matteo le 12/09/2026 : on clique sa photo pour la
    // changer. C'est le bouton visible en permanence.
    const src = menu();
    const bulle = src.indexOf('<button class="avatar"');
    expect(src.slice(bulle, src.indexOf('>', bulle))).toContain('onclick={ouvrirExplorateur}');
  });

  it('🔴 le menu du compte garde une porte — le chevron', () => {
    // La bulle était sa SEULE porte. La lui prendre sans rien mettre à la place
    // enterrait Réglages, Thèmes, « Se déconnecter » et le retour vers
    // l'interface actuelle — que les notes décrivent comme l'issue de sortie
    // d'une prévisualisation.
    const src = menu();
    const chevron = src.indexOf('<button class="chevron"');
    expect(chevron, 'plus aucun bouton n’ouvre le menu du compte').toBeGreaterThan(-1);
    expect(src.slice(chevron, src.indexOf('</button>', chevron))).toContain('onclick={toggle}');
  });

  it('🔴 le champ de fichier vit HORS du panneau', () => {
    // Depuis que la bulle l'ouvre, il doit exister menu FERMÉ. Le laisser dans
    // le panneau rendrait le clic sur la bulle sans effet — et sans erreur.
    const src = menu();
    const champ = src.indexOf('type="file"');
    const panneau = src.indexOf('{#if open}');
    expect(champ, 'le champ de fichier a disparu').toBeGreaterThan(-1);
    expect(champ, 'le champ est enfermé dans le panneau : la bulle ne l’atteindrait pas')
      .toBeLessThan(panneau);
  });

  it('🔴 déconnecté, on refuse en disant pourquoi', () => {
    // La photo est attachée à un compte : en poser une sans compte produirait
    // une image aussitôt masquée, c'est-à-dire un bouton qui ne fait rien.
    const src = menu();
    const i = src.indexOf('function ouvrirExplorateur');
    const corps = src.slice(i, i + 400);
    expect(corps).toContain('if (!ssoConnected)');
    expect(corps).toContain("settings.avatarSignInFirst");
    expect(corps.indexOf('return;'), 'le refus ne coupe pas : l’explorateur s’ouvrirait quand même')
      .toBeLessThan(corps.indexOf('champFichier?.click()'));
  });

  it('🔴 la photo n’est montrée qu’à SON compte', () => {
    // Sans ce recoupement, elle survit à la déconnexion — affichée dans le coin
    // de l'écran alors qu'il n'y a plus personne — et le compte suivant ouvert
    // sur la même machine hérite de celle du précédent.
    const src = menu();
    expect(src).toContain('ssoConnected && identiteCompte && $preferences.avatarCompte === identiteCompte');
  });

  it('🔴 la photo et son propriétaire s’écrivent ENSEMBLE', () => {
    // Séparés, il existerait un instant où l'un vit sans l'autre : une photo
    // sans compte ne s'affiche jamais, et elle serait rangée pour rien.
    const src = menu();
    expect(src).toContain('avatarImage: url, avatarCompte: identiteCompte');
    expect(src, 'retirer laisse un propriétaire orphelin').toContain(
      "avatarImage: '', avatarCompte: ''",
    );
  });

  it('🔴 les deux actions sont dépliées par le ROND de l’en-tête', () => {
    // Choix de Matteo (12/09/2026) : pas de rubrique permanente de plus dans
    // un panneau déjà plafonné en hauteur. Le geste est « je clique ma photo
    // pour la changer ».
    const src = menu();
    const rond = src.indexOf('<button class="avatar sm"');
    expect(rond, 'le rond de l’en-tête n’est plus un bouton').toBeGreaterThan(-1);
    expect(src.slice(rond, src.indexOf('</button>', rond))).toContain(
      'photoActions = !photoActions',
    );
    const actions = src.indexOf("$t('settings.avatarChoose'");
    expect(
      src.slice(0, actions).lastIndexOf('{#if photoActions}'),
      'les actions ne sont plus repliées : le panneau grandit pour tout le monde',
    ).toBeGreaterThan(rond);
  });

  it('🔴 refermer le menu replie les actions', () => {
    // Trois chemins referment le panneau (le bouton, `close()`, le clic
    // dehors) : sans repli sur l'état, il rouvrirait déplié par un geste que
    // l'utilisateur a oublié.
    expect(menu()).toMatch(/\$effect\(\(\) => \{\s*if \(!open\) photoActions = false;\s*\}\);/);
  });

  it('le champ de fichier existe, et n’accepte que des images', () => {
    const src = menu();
    expect(src).toContain('type="file"');
    expect(src, 'sans filtre, le sélecteur propose tous les fichiers').toContain(
      'accept="image/*"',
    );
    expect(src, 'plus rien ne déclenche le champ masqué').toContain('champFichier?.click()');
  });

  it('🔴 le champ est vidé AVANT le premier retour possible', () => {
    // Un `<input type="file">` ne relève `change` que si la valeur CHANGE :
    // rechoisir le même fichier après l'avoir retiré ne déclencherait plus
    // rien, et le bouton paraîtrait mort. Le vidage doit donc précéder le
    // `if (!fichier) return`.
    const src = menu();
    const vidage = src.indexOf("champ.value = ''");
    const retour = src.indexOf('if (!fichier) return');
    expect(vidage, 'le champ n’est plus vidé').toBeGreaterThan(-1);
    expect(retour).toBeGreaterThan(-1);
    expect(vidage, 'le vidage est passé APRÈS le retour : il sera sauté').toBeLessThan(retour);
  });

  it('« Retirer » n’apparaît que s’il y a une photo à retirer', () => {
    const src = menu();
    const i = src.indexOf("$t('settings.avatarRemove'");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, i - 160), i)).toContain('{#if photoLocale}');
  });

  it('🔴 une photo locale illisible n’est pas EFFACÉE', () => {
    // Un WebP écrit par Chrome et ouvert dans un moteur qui l'ignore : effacer
    // la préférence repartirait en `PATCH` et détruirait chez tout le monde
    // une image parfaitement lisible ailleurs. On l'écarte pour la session.
    const src = menu();
    const i = src.indexOf('onerror=');
    const fin = src.indexOf('/>', i);
    const gestionnaire = src.slice(i, fin);
    expect(gestionnaire).toContain('photoLocaleCassee = true');
    expect(
      gestionnaire,
      'le gestionnaire d’erreur efface la préférence : une photo lisible ailleurs serait détruite',
    ).not.toMatch(/avatarImage: ''/);
  });

  it('🔴 le panneau ne se ferme pas sur un bouton qui vient de disparaître', () => {
    // « Retirer » s'efface lui-même dès que la photo est retirée. Svelte le
    // détache AVANT que le gestionnaire de fenêtre ne s'exécute :
    // `closest('.avwrap')` rend alors null, et le menu se referme comme si on
    // avait cliqué dehors. Constaté dans Chrome, pas déduit.
    const src = menu();
    const i = src.indexOf('function onDocClick');
    expect(src.slice(i, i + 320)).toContain('!cible.isConnected');
  });

  it('le refus est traduit par son MOTIF, pas par un message générique', () => {
    const src = menu();
    expect(src).toContain('CLE_MESSAGE[err.motif]');
    expect(src).toContain('err instanceof AvatarRefuse');
  });

  it('la photo est portée par le BOUTON, visible menu fermé', () => {
    // Reprise de la garde posée le 01/09 pour la photo du compte : elle vaut
    // pour la photo locale, et pour la même raison — le bouton est la seule
    // chose visible en permanence.
    const src = menu();
    const bouton = src.indexOf('<button class="avatar"');
    const fin = src.indexOf('</button>', bouton);
    expect(src.slice(bouton, fin)).toContain('src={photo}');
  });
});

/* ───────────────────── Le rangement dans les préférences ───────────────── */

const PREFS = fileURLToPath(new URL('../stores/preferences.ts', import.meta.url));
const prefs = () => readFileSync(PREFS, 'utf8');

describe('Préférences — la photo est rangée, et filtrée aux DEUX entrées', () => {
  it('la clé existe et part vide', () => {
    expect(prefs()).toMatch(/^\s*avatarImage: '',$/m);
  });

  it('🔴 le blob relu du navigateur est filtré', () => {
    expect(prefs()).toContain("estDataUrlImage((raw as { avatarImage?: unknown })?.avatarImage)");
  });

  it('🔴 le blob relu du SERVEUR est filtré lui aussi', () => {
    // `syncPreferencesFromServer` adopte le blob serveur tel quel sur un
    // navigateur sans préférences locales : il ne repasse JAMAIS par
    // `loadPrefs`. Filtrer d'un seul côté laisserait grande ouverte la seule
    // porte réellement distante.
    const src = prefs();
    const sync = src.indexOf('export async function syncPreferencesFromServer');
    expect(sync).toBeGreaterThan(-1);
    expect(src.slice(sync)).toContain('estDataUrlImage(server.avatarImage)');
  });
});
