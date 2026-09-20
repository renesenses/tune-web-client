/**
 * #1358 — « quand on clique dans le sous menu il ne se passe rien »
 * (FabienM, fil 1862, 20/09/2026, v0.9.158, point 1).
 *
 * La barre latérale POSE le service demandé dans `activeStreamingService`
 * (`Sidebar.svelte`, `allerService`) puis va sur la vue Streaming. Quand
 * l'écran y est déjà, rien ne le remonte : `StreamingV2` n'avait lu le
 * magasin qu'une fois, au montage, et avec `get(...)` — une lecture qui ne
 * s'abonne à rien. D'où l'image de la capture : Bandcamp allumé à gauche,
 * Qobuz allumé à droite, en même temps.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BANDCAMP_EXT, BANDCAMP_SVC, ongletApresDemande } from '../ongletsStreaming';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ecran = () => lire('../../components/v2/StreamingV2.svelte');

/** Trois services connectés, dans l'ordre où le serveur les rend. */
const connectes = {
  qobuz: { enabled: true, authenticated: true, username: 'Fabien' },
  bandcamp: { enabled: true, authenticated: true, username: 'fabienm2002' },
  youtube: { enabled: true, authenticated: true },
} as any;

describe('#1358 — le service demandé après le montage', () => {
  it('🔴 le geste du testeur : Qobuz ouvert, la barre demande Bandcamp', () => {
    // Sans extension Bandcamp chargée, la rangée porte la clé générique.
    expect(ongletApresDemande(connectes, false, 'qobuz', 'bandcamp')).toBe('bandcamp');
  });

  it('le souhait est donné dans la langue du SERVEUR, la rangée dans la sienne', () => {
    // L'extension absorbe le service générique : `bandcamp` doit retrouver
    // l'onglet `__bandcamp__` qui a pris sa place, sinon le clic reste sans
    // effet — le défaut que ce ticket corrige, sous une autre forme.
    expect(ongletApresDemande(connectes, true, 'qobuz', BANDCAMP_SVC)).toBe(BANDCAMP_EXT);
  });

  it('le service DÉJÀ ouvert ne rend rien — les deux effets ne bouclent pas', () => {
    // L'écran republie son onglet dans ce même magasin (#1138). Sans cette
    // sortie, l'écriture de l'un réveillerait la lecture de l'autre sans fin.
    expect(ongletApresDemande(connectes, false, 'qobuz', 'qobuz')).toBe(null);
    expect(ongletApresDemande(connectes, true, BANDCAMP_EXT, BANDCAMP_SVC)).toBe(null);
  });

  it('🔴 un souhait INTENABLE ne fait pas sauter l’écran ailleurs', () => {
    // Au montage, retomber sur le premier onglet est le bon choix (#860).
    // En cours de route, ce serait un écran qui quitte Qobuz tout seul parce
    // qu'un raccourci d'ailleurs a écrit un service déconnecté depuis.
    expect(ongletApresDemande(connectes, false, 'qobuz', 'tidal')).toBe(null);
    expect(ongletApresDemande({}, false, 'qobuz', 'bandcamp')).toBe(null);
  });

  it('aucune demande, aucun changement', () => {
    expect(ongletApresDemande(connectes, false, 'qobuz', null)).toBe(null);
    expect(ongletApresDemande(connectes, false, 'qobuz', '')).toBe(null);
  });
});

describe('#1358 — l’écran suit vraiment le magasin', () => {
  it('🔴 il s’ABONNE au service demandé, il ne le lit pas une fois', () => {
    const src = ecran();
    expect(
      src.includes('$activeStreamingService'),
      'l’écran ne lit le magasin qu’au montage (`get(...)`) : le clic de la '
        + 'barre latérale n’atteint jamais l’onglet.',
    ).toBe(true);
    expect(
      src.includes('ongletApresDemande(services, bandcampLive, active, $activeStreamingService)'),
      'la demande extérieure n’est plus convertie en onglet.',
    ).toBe(true);
  });

  it('🔴 les DEUX chemins ouvrent un service de la même façon', () => {
    // La remise à zéro (sous-onglet, recherche, résultats) ne vivait que dans
    // le `onclick` du bouton : le chemin de la barre latérale aurait ouvert le
    // bon onglet en gardant sous les yeux la recherche du service précédent.
    const src = ecran();
    expect(
      src.includes('onclick={() => ouvrirOnglet(name)}'),
      'la rangée d’onglets n’emprunte plus le geste commun.',
    ).toBe(true);
    expect(
      src.includes('if (cible) ouvrirOnglet(cible)'),
      'la barre latérale n’emprunte plus le geste commun.',
    ).toBe(true);
    const geste = src.slice(src.indexOf('function ouvrirOnglet'), src.indexOf('function ouvrirOnglet') + 300);
    for (const remise of ["sub = 'editorial'", "q = ''", 'results = null']) {
      expect(geste.includes(remise), `le geste commun a perdu « ${remise} »`).toBe(true);
    }
  });
});
