// @vitest-environment jsdom
//
// rc12 — le bouton « Régler » d'une étape du chemin du signal : présent
// seulement quand l'étape a un écran, joignable au clavier, nommé pour les
// lecteurs d'écran, et il ouvre l'écran en refermant le panneau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ReglerEtapeDuChemin from '../../components/partages/ReglerEtapeDuChemin.svelte';
import { locale } from '../i18n';
import { activeView } from '../stores/navigation';
import { retourAuChemin } from '../reglagesDuCheminDuSignal';

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

function monter(etape: Record<string, unknown>, onouvrir = vi.fn()) {
  instance = mount(ReglerEtapeDuChemin, {
    target: hote,
    props: { etape: { description: '', ...etape } as any, zoneId: 5, nom: 'Crossfeed Pro', origine: 'barre', onouvrir },
  });
  flushSync();
  return onouvrir;
}

beforeEach(() => {
  locale.set('fr');
  activeView.set('library');
  retourAuChemin.set(null);
  hote = document.createElement('div');
  document.body.append(hote);
});
afterEach(() => {
  if (instance) unmount(instance);
  instance = null;
  hote.remove();
});

describe('ReglerEtapeDuChemin', () => {
  it('étape de greffon : un vrai bouton, nommé, focalisable, qui ouvre l\'écran du greffon', () => {
    const onouvrir = monter({ name: 'Crossfeed Pro', code: 'crossfeed', plugin: 'crossfeed-pro' });
    const b = hote.querySelector('button') as HTMLButtonElement;
    expect(b).not.toBeNull();
    expect(b.type).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('Régler Crossfeed Pro');
    b.focus();
    expect(document.activeElement).toBe(b);
    // Un <button> natif : Entrée et Espace déclenchent `click` dans le navigateur.
    b.click();
    expect(onouvrir).toHaveBeenCalledOnce();
    expect(get(activeView)).toBe('crossfeedpro');
    expect(get(retourAuChemin)).toMatchObject({ depuis: 'library', cible: 'crossfeedpro', origine: 'barre' });
  });

  it('étape inconnue ou sans réglage : aucun bouton', () => {
    monter({ name: 'Decoder' });
    expect(hote.querySelector('button')).toBeNull();
  });

  it('réglage armé mais non appliqué : « Désactivé — régler »', () => {
    monter({ name: 'Correction de pièce', code: 'room_correction', kind: 'eq', applied: false });
    expect(hote.querySelector('button')?.textContent?.trim()).toBe('Désactivé — régler');
  });
});
