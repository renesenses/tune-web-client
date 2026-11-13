// @vitest-environment jsdom
//
// web#2771, point 3 — le parcours du contrôle parental, vu de l'enfant et du
// parent, aligné sur les routes du lot rc12 (tune-server-rust#8606, #8636) :
//
//  - un artiste bloqué est refusé par le serveur (403
//    `parental_content_blocked`, à la lecture comme à l'ouverture d'une
//    fiche) : l'enfant doit LIRE pourquoi, au lieu d'un geste sans effet ;
//  - l'état « règles posées » dit qu'elles valent pour ce que le profil voit
//    ET lit, plus seulement pour quelques listes ;
//  - une plage ne passe pas minuit (le serveur exige début < fin) : l'aide
//    dit comment écrire une soirée qui déborde sur la nuit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { locale, t } from '../i18n';
import { notifications } from '../stores/notifications';
import lFr from '../locales/fr';
import { dictionnaire } from './onzeDictionnaires';
import lEn from '../locales/en';

const LANGUES = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh'];
const derniereNotification = () => { const l = get(notifications); return l[l.length - 1]?.message; };
const refus = (corps: Record<string, unknown>) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corps), {
  status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'application/json' },
})));

beforeEach(() => {
  locale.set('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('web#2771 — l’enfant voit pourquoi un artiste bloqué ne joue pas', () => {
  it('lecture refusée : la phrase du serveur s’affiche, et l’appelant le sait', async () => {
    const phrase = 'Cet artiste est bloqué : le contrôle parental de ce profil en interdit l’affichage et la lecture.';
    refus({ error: 'parental_content_blocked', code: 'parental_content_blocked', message: phrase });
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(derniereNotification()).toBe(phrase);
    expect(err.message).toBe(phrase);
    expect(err.dejaAnnonce).toBe(true);
  });

  it('sans phrase du serveur : la phrase locale, dans la langue de l’interface', async () => {
    locale.set('en');
    refus({ error: 'parental_content_blocked', code: 'parental_content_blocked' });
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    const attendu = get(t)('playback.errorParentalBlocked' as any);
    expect(attendu).toContain('blocked');
    expect(derniereNotification()).toBe(attendu);
    expect(err.message).toBe(attendu);
  });

  it('fiche refusée (album d’un artiste bloqué) : le refus n’est pas muet', async () => {
    const phrase = 'Cet artiste est bloqué : le contrôle parental de ce profil en interdit l’affichage et la lecture.';
    refus({ error: 'parental_content_blocked', code: 'parental_content_blocked', message: phrase });
    await api.fetchJSON(`${api.BASE}/library/albums/5`).catch(() => undefined);
    expect(derniereNotification()).toBe(phrase);
  });

  it('la phrase locale existe dans les 15 langues', async () => {
    for (const l of LANGUES) {
      const dict = dictionnaire(l);
      expect(dict['playback.errorParentalBlocked'], l).toBeTruthy();
    }
  });
});

describe('web#2771 — les textes du parcours', () => {
  const FR = lFr as Record<string, string>;
  const EN = lEn as Record<string, string>;

  it('« règles posées » vaut pour ce que le profil voit et lit, playlists et favoris compris', () => {
    expect(FR['parental.active']).toMatch(/lire/);
    expect(FR['parental.active']).toMatch(/playlists/);
    expect(FR['parental.active']).toMatch(/favoris/);
    expect(EN['parental.active']).toMatch(/play/);
    expect(EN['parental.active']).toMatch(/favorites/);
  });

  it('l’aide des plages dit comment passer minuit, dans les 15 langues', async () => {
    for (const l of LANGUES) {
      const dict = dictionnaire(l);
      expect(dict['parental.hours.hint'], l).toContain('23:59');
      expect(dict['parental.hours.hint'], l).toContain('00:00');
    }
  });

  it('la fin d’une plage est exclue (le serveur compare `heure < fin`) : l’aide ne promet pas 23:59', () => {
    expect(FR['parental.hours.hint']).toMatch(/dernière minute avant minuit/);
    expect(EN['parental.hours.hint']).toMatch(/last minute before midnight/);
    // Une seule fois la consigne « passer minuit » : pas de phrase répétée.
    expect(FR['parental.hours.hint'].match(/minuit/g)?.length).toBe(2);
  });
});
