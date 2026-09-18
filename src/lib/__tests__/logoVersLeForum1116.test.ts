// @vitest-environment jsdom
//
// #1116 — « Il serait bien de remettre le lien pour le forum dans le logo en
// haut à gauche » (Jean Valjean, fil 1671, réponse 6300, 17/09/2026).
//
// Le lien existait — et existe toujours — dans l'ANCIENNE coquille :
//
//   src/components/Sidebar.svelte:691
//   <a href="https://mozaiklabs.fr/forum" target="_blank"
//      rel="noopener noreferrer" class="logo-link" …><img … /></a>
//
// La nouvelle coquille (`v2/Sidebar.svelte:282-283`) posait le logo dans un
// simple `<div class="logo">` : plus rien à cliquer. « Remettre » est donc
// exact — c'est une perte au passage à la nouvelle coquille, pas une demande
// de nouveauté.
//
// 🔴 CE TÉMOIN MONTE LE COMPOSANT. Il ne cherche PAS la chaîne
// « mozaiklabs.fr/forum » dans le fichier : une garde de texte est satisfaite
// par n'importe quelle occurrence — un commentaire, une constante morte, un
// lien posé ailleurs dans la barre — et ne prouve jamais que le LOGO mène au
// forum. Ce qu'on regarde ici, c'est l'ancre réellement peinte autour de
// l'image du logo, et ses attributs réels lus sur le DOM.
//
// 🔴 ET C'EST UN RÉTABLISSEMENT, PAS UNE REFONTE : l'URL, la cible et le `rel`
// attendus ne sont pas écrits à la main ici, ils sont EXTRAITS de l'ancienne
// coquille. Le témoin compare donc deux comportements ; si quelqu'un change le
// lien du forum d'un seul côté, il tombe.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SidebarV2 from '../../components/v2/Sidebar.svelte';

/* ------------------------------------------------------------------ */
/* Le contrat de référence : l'ancre du logo de l'ANCIENNE coquille.   */
/* ------------------------------------------------------------------ */

const ancienne = readFileSync(
  resolve(__dirname, '../../components/Sidebar.svelte'),
  'utf-8',
);

/** L'ancre qui enveloppe `<img … class="logo-img">` dans l'ancienne barre. */
const ancreAncienne = /<a\s([^>]*?)>\s*<img[^>]*class="logo-img"/.exec(ancienne);
expect(
  ancreAncienne,
  "l'ancienne coquille ne porte plus d'ancre autour de son logo : " +
    'la référence de ce témoin a disparu, il faut le réécrire',
).not.toBeNull();

const attribut = (nom: string): string => {
  const m = new RegExp(`${nom}="([^"]*)"`).exec(ancreAncienne![1]);
  expect(m, `l'ancre de l'ancienne coquille n'a pas d'attribut ${nom}`).not.toBeNull();
  return m![1];
};

const URL_FORUM = attribut('href');
const CIBLE = attribut('target');
const REL = attribut('rel');

/* ------------------------------------------------------------------ */
/* Montage de la NOUVELLE barre.                                      */
/* ------------------------------------------------------------------ */

let monte: Record<string, any> | null = null;
let hote: HTMLElement | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

/** Monte `v2/Sidebar` et rend son bloc de marque réellement peint. */
function marque(): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SidebarV2, { target: hote });
  flushSync();
  const brand = hote.querySelector('.brand');
  expect(brand, "la nouvelle barre n'a pas peint de bloc de marque").not.toBeNull();
  return brand as HTMLElement;
}

describe('#1116 — le logo de la nouvelle barre mène au forum', () => {
  it('la référence lue dans l\'ancienne coquille est bien le forum, en nouvel onglet', () => {
    // Garde-fou : si l'extraction ci-dessus attrapait une autre ancre, tout le
    // reste du témoin comparerait le lien v2 à n'importe quoi.
    expect(URL_FORUM).toBe('https://mozaiklabs.fr/forum');
    expect(CIBLE).toBe('_blank');
    expect(REL).toContain('noopener');
    expect(REL).toContain('noreferrer');
  });

  it("l'image du logo est enveloppée d'une ancre", () => {
    const img = marque().querySelector('.logo img') as HTMLImageElement | null;
    expect(img, "la nouvelle barre ne peint pas d'image de logo").not.toBeNull();

    const ancre = img!.closest('a');
    expect(
      ancre,
      "le logo de la nouvelle barre n'est enveloppé d'AUCUNE ancre : " +
        'il n\'y a rien à cliquer en haut à gauche (#1116)',
    ).not.toBeNull();
  });

  it('cette ancre mène à la même URL que l\'ancienne barre', () => {
    const ancre = marque().querySelector('.logo img')!.closest('a')!;
    // `getAttribute` et pas `.href` : jsdom résout `.href` contre `location`,
    // ce qui masquerait une URL relative posée par erreur.
    expect(ancre.getAttribute('href')).toBe(URL_FORUM);
  });

  it("elle s'ouvre comme l'ancienne : nouvel onglet, et sans fuite d'origine", () => {
    const ancre = marque().querySelector('.logo img')!.closest('a')!;
    expect(ancre.getAttribute('target')).toBe(CIBLE);
    const rel = ancre.getAttribute('rel') ?? '';
    // `target="_blank"` sans `noopener` donne à la page ouverte la main sur
    // `window.opener` : c'est exactement ce que l'ancienne barre évitait.
    for (const jeton of REL.split(/\s+/)) expect(rel.split(/\s+/)).toContain(jeton);
  });

  it('elle se présente : une infobulle traduite, pas la clé brute', () => {
    const ancre = marque().querySelector('.logo img')!.closest('a')!;
    const titre = ancre.getAttribute('title') ?? ancre.getAttribute('aria-label') ?? '';
    expect(titre.length, "l'ancre du logo sort muette").toBeGreaterThan(0);
    // Une clé non traduite ressort telle quelle (`sidebar.forumMozaiklabs`) :
    // c'est ce que `$t()` rend quand la clé manque du dictionnaire.
    expect(titre).not.toMatch(/^[a-z0-9]+(\.[A-Za-z0-9]+)+$/);
  });

  it("le bouton de repli reste atteignable, hors de l'ancre", () => {
    const brand = marque();
    const repli = brand.querySelector('button.collapse');
    expect(repli, 'le bouton de repli a disparu du bloc de marque').not.toBeNull();
    // Le ticket le signalait : replié, le logo voisine le bouton d'extension.
    // Absorber ce bouton dans le lien le rendrait inatteignable — un clic
    // dessus partirait sur le forum au lieu de déplier la barre.
    expect(
      repli!.closest('a'),
      'le bouton de repli est passé DANS le lien du forum : ' +
        'le déplier ouvrirait le forum',
    ).toBeNull();
  });
});
