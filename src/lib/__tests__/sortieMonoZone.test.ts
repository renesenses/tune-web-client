// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { fr } from '../locales';
import type { Zone } from '../types';

/**
 * Sortie mono par zone (#2362) — l'écran, pas le moteur.
 *
 * ## Ce qui manquait
 *
 * Le serveur sait sommer les deux voies depuis toujours
 * (`tune-core/src/audio/channels.rs`, bras `(2, 1)` ⇒ 0.5/0.5), il expose
 * `mono_downmix` en PATCH sur `/zones/{id}` et le relit à chaud
 * (`refresh_zone_mono_downmix`). Mesuré le 02/09 : `mono_downmix` vaut 0
 * occurrence dans tout `src/` du client contre 2 côté serveur. Nicolas Tardif
 * (fil forum 1532, 26/08) était donc en panne devant un réglage qui existait
 * et qu'aucun écran ne lui laissait atteindre : « En effet, je perds toute la
 * musique qui passe par le canal droit. »
 *
 * ## Pourquoi on MONTE le composant
 *
 * Ce dépôt garde d'ordinaire ce genre de branchement par lecture de source
 * (`transportRecalageGuard`), faute de `@testing-library/svelte`. Ici ça ne
 * suffirait pas : le défaut à prévenir n'est pas « la fonction d'API existe »
 * mais « un écran l'appelle et affiche ce que le serveur rend ». La couche
 * `api` de ce dépôt compte déjà 96 fonctions exportées que plus aucun écran
 * n'appelle ; une garde de source aurait accepté la 97ᵉ.
 *
 * On monte donc `ZoneConfigModal` pour de vrai dans jsdom — `mount` de Svelte
 * 5, avec la condition de résolution `browser` déjà posée par
 * `vitest.config.ts` (sans elle `$effect` est un no-op et tout passerait au
 * vert sans rien exécuter).
 *
 * ## Contre-épreuve (sabotage, mesurée)
 *
 * 1. Lecture figée — remplacer `$state(zone.mono_downmix ?? false)` par
 *    `$state(false)` dans le composant : « l'état coché vient du serveur »
 *    tombe.
 * 2. Envoi débranché — retirer l'appel `api.updateZoneMonoDownmix(...)` de
 *    `setMonoDownmix` : « cocher écrit sur le serveur » tombe.
 */

/** Zone locale minimale, façonnée comme la charge utile RÉELLE de `GET /zones`
 *  relevée sur le serveur .18 le 02/09 — où `mono_downmix` est bien présent,
 *  à `false`, sur les dix-huit zones. */
function zoneLocale(over: Partial<Zone> = {}): Zone {
  return {
    id: 21,
    name: 'Bureau',
    output_type: 'local',
    output_device_id: 'local:dac-1',
    volume: 1,
    state: 'stopped',
    mono_downmix: false,
    ...over,
  } as Zone;
}

const patchMono = vi.fn(async (_id: number, enabled: boolean) => ({ mono_downmix: enabled }));

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    // Seul l'appel qu'on éprouve est remplacé. Le reste du module reste réel :
    // un module d'API entièrement inventé rendrait le montage vert quoi qu'il
    // arrive au vrai contrat.
    updateZoneMonoDownmix: (id: number, enabled: boolean) => patchMono(id, enabled),
  };
});

let cible: HTMLElement;
let monte: Record<string, any> | null = null;

/** Le panneau interroge le serveur à l'ouverture (état du FIR, pins). On ne
 *  teste pas cela ici : la réponse est vide, et surtout aucune requête ne
 *  sort de la machine. */
beforeEach(() => {
  patchMono.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

async function ouvrirPanneau(zone: Zone) {
  const { default: ZoneConfigModal } = await import('../../components/ZoneConfigModal.svelte');
  monte = mount(ZoneConfigModal, {
    target: cible,
    props: {
      zone,
      allZones: [zone],
      groups: [],
      onClose: () => {},
      onDelete: () => {},
      onGroupChanged: () => {},
      onRenamed: () => {},
    },
  });
  flushSync();
  return cible;
}

function interrupteurMono(racine: HTMLElement): HTMLInputElement {
  const el = racine.querySelector<HTMLInputElement>('.mono-toggle input[type="checkbox"]');
  if (!el) throw new Error('aucun interrupteur de sortie mono dans le panneau de zone');
  return el;
}

describe('#2362 — la sortie mono est atteignable depuis le panneau de zone', () => {
  it('expose un interrupteur, et son libellé DIT ce que le réglage fait', async () => {
    const racine = await ouvrirPanneau(zoneLocale());
    const label = racine.querySelector('.mono-toggle')!;

    // Le libellé rendu est celui du dictionnaire : si la clé manquait, l'écran
    // afficherait « zoneConfig.monoLabel » — un interrupteur muet, ce que
    // l'issue interdit explicitement.
    expect(label.textContent?.trim()).toBe(fr['zoneConfig.monoLabel']);
    expect(label.textContent).not.toContain('zoneConfig.');

    // Et il nomme l'opération, pas seulement « mono » : additionner les deux
    // canaux.
    expect(fr['zoneConfig.monoLabel']).toMatch(/[Aa]dditionner/);
    expect(fr['zoneConfig.monoLabel']).toMatch(/gauche/);
    expect(fr['zoneConfig.monoLabel']).toMatch(/droit/);
  });

  it("l'état coché vient du SERVEUR, pas d'un défaut local", async () => {
    // Sabotage n°1 vise ceci : figer la valeur affichée fait tomber ce cas.
    const racine = await ouvrirPanneau(zoneLocale({ mono_downmix: true }));
    expect(interrupteurMono(racine).checked).toBe(true);
  });

  it('une zone dont le serveur rend `false` affiche un interrupteur désarmé', async () => {
    const racine = await ouvrirPanneau(zoneLocale({ mono_downmix: false }));
    expect(interrupteurMono(racine).checked).toBe(false);
  });

  it('un serveur trop ancien, qui ne rend pas le champ, ne coche rien', async () => {
    const sansChamp = zoneLocale();
    delete (sansChamp as Partial<Zone>).mono_downmix;
    const racine = await ouvrirPanneau(sansChamp);
    expect(interrupteurMono(racine).checked).toBe(false);
  });

  it('cocher ÉCRIT sur le serveur, avec le nom de champ du contrat', async () => {
    // Sabotage n°2 vise ceci : débrancher l'envoi fait tomber ce cas.
    const racine = await ouvrirPanneau(zoneLocale());
    const boite = interrupteurMono(racine);

    boite.checked = true;
    boite.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patchMono).toHaveBeenCalled());

    expect(patchMono).toHaveBeenCalledWith(21, true);
  });

  it('décocher écrit false — le réglage se retire aussi bien qu\'il se pose', async () => {
    const racine = await ouvrirPanneau(zoneLocale({ mono_downmix: true }));
    const boite = interrupteurMono(racine);

    boite.checked = false;
    boite.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patchMono).toHaveBeenCalled());

    expect(patchMono).toHaveBeenCalledWith(21, false);
  });

  it("un PATCH refusé RAMÈNE l'interrupteur, il n'affirme pas un réglage absent", async () => {
    patchMono.mockRejectedValueOnce(new Error('boum'));
    const racine = await ouvrirPanneau(zoneLocale({ mono_downmix: false }));
    const boite = interrupteurMono(racine);

    boite.checked = true;
    boite.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patchMono).toHaveBeenCalled());
    await vi.waitFor(() => {
      flushSync();
      expect(interrupteurMono(racine).checked).toBe(false);
    });
  });

  it("prévient quand la zone n'est pas locale, au lieu de MASQUER le réglage", async () => {
    // Masquer est la faute que le bloc FIR d'à côté a déjà commise : un abonné
    // Premium en a conclu que la correction de pièce n'existait pas. On dit
    // que ça ne fera rien ici, et on laisse le réglage atteignable.
    const reseau = await ouvrirPanneau(zoneLocale({ output_type: 'dlna' }));
    expect(interrupteurMono(reseau)).toBeTruthy();
    expect(reseau.querySelector('.mono-note')?.textContent?.trim()).toBe(
      fr['zoneConfig.monoLocalOnly'],
    );
  });

  it('ne prévient de rien sur une zone locale, où le réglage agit', async () => {
    const local = await ouvrirPanneau(zoneLocale({ output_type: 'local' }));
    expect(local.querySelector('.mono-note')).toBeNull();
  });
});

/**
 * TÉMOIN — les autres réglages de zone doivent continuer de fonctionner à
 * l'identique. Une section ajoutée au milieu d'un panneau est une occasion
 * classique d'en casser une autre (balise mal refermée, `{#if}` avalé) ; sans
 * ce témoin, le test ci-dessus resterait vert sur un panneau amputé.
 */
describe('#2362 — témoin : le panneau de zone garde ses autres réglages', () => {
  it('conserve renommage, groupe, décalage de synchro, correction de pièce et suppression', async () => {
    const racine = await ouvrirPanneau(zoneLocale());
    const titres = [...racine.querySelectorAll('.section-title')].map((h) => h.textContent?.trim());

    expect(titres).toContain(fr['zone.groupedPlayback']);
    expect(titres).toContain(fr['zone.syncOffset']);
    expect(titres).toContain(fr['zoneConfig.firTitle']);
    expect(titres).toContain(fr['zone.actions']);
    expect(titres).toContain(fr['zoneConfig.monoTitle']);

    // Le champ de renommage et le bouton de suppression sont toujours là.
    expect(racine.querySelector('input[type="text"]')).toBeTruthy();
    expect(racine.querySelector('.danger-section')).toBeTruthy();
  });
});
