// @vitest-environment jsdom
//
// web#2653 — l'écran « Statistiques de la bibliothèque » et le bloc « Mes
// notes », montés, avec un serveur simulé dans ses deux âges : celui de
// tune-server-rust#7874 (`distributions`, `/library/notes`) et un serveur
// plus ancien (ni l'un ni l'autre).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';

import StatsBibliothequeV2 from '../../components/v2/StatsBibliothequeV2.svelte';
import MesNotes from '../../components/partages/MesNotes.svelte';
import AlbumRating from '../../components/partages/AlbumRating.svelte';
import { activeView, pendingLibraryFiltre } from '../stores/navigation';
import { dialogs } from '../stores/dialogs';
import { oublierSondageNotes } from '../api';
import { fr } from './onzeDictionnaires';

const FR = fr as unknown as Record<string, string>;
const espaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]+/g, ' ').trim();

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

type Requete = { methode: string; chemin: string; corps: any };
let requetes: Requete[] = [];
let stats: unknown;
/** `true` : le serveur connaît `/library/notes` ; `false` : 404 (serveur ancien). */
let routeNotes = true;
let notes: Map<string, string>;
let noteSur5: { rating: number; note: string | null };

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  requetes = [];
  routeNotes = true;
  notes = new Map();
  noteSur5 = { rating: 0, note: null };
  oublierSondageNotes();
  pendingLibraryFiltre.set(null);
  activeView.set('statsbibliotheque');
  stats = {
    tracks: 10, albums: 3, artists: 2,
    distributions: {
      by_codec: [{ value: 'flac', tracks: 6 }, { value: 'mp3', tracks: 3 }, { value: null, tracks: 1 }],
      by_sample_rate: [{ value: 44100, tracks: 5 }, { value: 96000, tracks: 4 }, { value: null, tracks: 1 }],
      by_decade: [{ value: 1990, tracks: 9 }, { value: null, tracks: 1 }],
      by_credit_role: [{ value: 'composer', tracks: 8, people: 3 }],
    },
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(String(url), 'http://tune.test');
    const methode = init?.method ?? 'GET';
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    requetes.push({ methode, chemin: u.pathname + u.search, corps });
    const p = u.pathname.replace(/^\/api\/v1/, '');
    if (p === '/library/stats') return json(stats);
    if (p === '/library/notes') {
      if (!routeNotes) return json({ error: 'not found', path: p }, 404);
      const q = (u.searchParams.get('q') ?? '').toLowerCase();
      const liste = [...notes.entries()]
        .filter(([, t]) => t.toLowerCase().includes(q))
        .map(([k, t]) => ({ item_type: k.split(':')[0], item_id: Number(k.split(':')[1]), texte_md: t, maj_le: '2026-11-05T10:00:00Z' }));
      return json({ count: liste.length, notes: liste });
    }
    const m = /^\/library\/notes\/(artist|album|track)\/(\d+)$/.exec(p);
    if (m) {
      if (!routeNotes) return json({ error: 'not found', path: p }, 404);
      const cle = `${m[1]}:${m[2]}`;
      if (methode === 'PUT') {
        if (!corps.texte_md) { notes.delete(cle); return json({ item_type: m[1], item_id: Number(m[2]), deleted: true }); }
        notes.set(cle, corps.texte_md);
        return json({ item_type: m[1], item_id: Number(m[2]), texte_md: corps.texte_md, maj_le: 'x' });
      }
      if (methode === 'DELETE') { const ex = notes.delete(cle); return json({ item_type: m[1], item_id: Number(m[2]), deleted: ex }); }
      const t = notes.get(cle);
      return t === undefined ? json({ code: 'not_found', error: 'aucune note sur cet objet' }, 404)
        : json({ item_type: m[1], item_id: Number(m[2]), texte_md: t, maj_le: 'x' });
    }
    if (/^\/library\/albums\/\d+\/rating$/.test(p)) return json(noteSur5);
    if (/^\/library\/albums\/\d+\/rate$/.test(p)) {
      noteSur5 = { rating: corps.rating, note: corps.note ?? null };
      return json({ ok: true });
    }
    if (/^\/library\/albums\/\d+\/community$/.test(p)) return json({ available: false });
    if (/^\/library\/albums\/\d+$/.test(p)) return json({ id: 42, title: 'Kind of Blue' });
    return json({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function monter(composant: any, props: Record<string, unknown> = {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  await attendre();
  return hote;
}

describe('#2653 — écran des statistiques de la bibliothèque', () => {
  it('un graphique par répartition, valeurs exactes, pourcentage, inconnu en dernier', async () => {
    const h = await monter(StatsBibliothequeV2);
    const blocs = [...h.querySelectorAll('[data-repartition]')].map((b) => b.getAttribute('data-repartition'));
    expect(blocs).toEqual(['by_codec', 'by_sample_rate', 'by_decade', 'by_credit_role']);

    const codecs = [...h.querySelectorAll('[data-repartition="by_codec"] li')];
    expect(codecs.map((li) => espaces(li.querySelector('.nom')?.textContent))).toEqual(['FLAC', 'MP3', FR['statsBibliotheque.inconnu']]);
    expect(espaces(codecs[0].querySelector('[data-valeur]')?.textContent)).toBe('6 pistes 60 %');
    expect(espaces(codecs[2].querySelector('[data-valeur]')?.textContent)).toBe('1 pistes 10 %');

    const frequences = [...h.querySelectorAll('[data-repartition="by_sample_rate"] .nom')].map((n) => espaces(n.textContent));
    expect(frequences).toEqual(['44,1 kHz', '96 kHz', FR['statsBibliotheque.inconnu']]);

    const role = h.querySelector('[data-repartition="by_credit_role"] li');
    expect(espaces(role?.querySelector('.nom')?.textContent)).toBe(FR['credits.composer']);
    expect(espaces(role?.querySelector('[data-valeur]')?.textContent)).toBe('8 pistes · 3 personnes 100 %');
  });

  it('clic sur un format ou une fréquence : la Bibliothèque filtrée ; décennie et inconnu ne sont pas cliquables', async () => {
    const h = await monter(StatsBibliothequeV2);
    const flac = h.querySelector<HTMLButtonElement>('[data-repartition="by_codec"] li [data-filtre]')!;
    flac.click();
    flushSync();
    expect(get(pendingLibraryFiltre)).toEqual({ format: 'FLAC' });
    expect(get(activeView)).toBe('library');

    const f96 = h.querySelectorAll<HTMLButtonElement>('[data-repartition="by_sample_rate"] [data-filtre]')[1];
    f96.click();
    flushSync();
    expect(get(pendingLibraryFiltre)).toEqual({ frequence: 96000 });

    expect(h.querySelectorAll('[data-repartition="by_codec"] [data-filtre]')).toHaveLength(2);
    expect(h.querySelectorAll('[data-repartition="by_decade"] [data-filtre]')).toHaveLength(0);
    expect(h.querySelectorAll('[data-repartition="by_credit_role"] [data-filtre]')).toHaveLength(0);
  });

  it.each([
    ['absente (serveur ancien)', { tracks: 10, albums: 3, artists: 2 }],
    ['null (lecture échouée côté serveur)', { tracks: 10, albums: 3, artists: 2, distributions: null }],
  ])('repli propre quand distributions est %s', async (_nom, corps) => {
    stats = corps;
    const h = await monter(StatsBibliothequeV2);
    expect(h.querySelector('[data-stats-indisponible]')?.textContent?.trim()).toBe(FR['statsBibliotheque.indisponible']);
    expect(h.querySelectorAll('[data-repartition]')).toHaveLength(0);
  });

  it('la Bibliothèque consomme le filtre demandé (format → fFormat, fréquence → fRate)', () => {
    const src = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
    const effet = src.slice(src.indexOf('const f = $pendingLibraryFiltre;'), src.indexOf('const f = $pendingLibraryFiltre;') + 400);
    expect(effet).toContain('pendingLibraryFiltre.set(null)');
    expect(effet).toContain("if ('format' in f) fFormat = [f.format];");
    expect(effet).toContain('else fRate = [f.frequence];');
  });
});

describe('#2653 — « Mes notes »', () => {
  it('création : PUT du texte Markdown, puis rendu', async () => {
    const h = await monter(MesNotes, { type: 'artist', id: 7 });
    expect(h.textContent).toContain(FR['mesNotes.vide']);
    h.querySelector<HTMLButtonElement>('[data-mes-notes-modifier]')!.click();
    flushSync();
    const saisie = h.querySelector<HTMLTextAreaElement>('[data-mes-notes-saisie]')!;
    saisie.value = '**Pressage japonais**';
    saisie.dispatchEvent(new Event('input'));
    h.querySelector<HTMLButtonElement>('[data-mes-notes-enregistrer]')!.click();
    await attendre();
    const put = requetes.find((r) => r.methode === 'PUT');
    expect(put?.chemin).toBe('/api/v1/library/notes/artist/7');
    expect(put?.corps).toEqual({ texte_md: '**Pressage japonais**' });
    expect(h.querySelector('[data-mes-notes-rendu] strong')?.textContent).toBe('Pressage japonais');
  });

  it('édition : le texte existant est repris, remplacé, et relu', async () => {
    notes.set('album:42', 'ancienne');
    const h = await monter(MesNotes, { type: 'album', id: 42 });
    expect(h.querySelector('[data-mes-notes-rendu]')?.textContent?.trim()).toBe('ancienne');
    h.querySelector<HTMLButtonElement>('[data-mes-notes-modifier]')!.click();
    flushSync();
    const saisie = h.querySelector<HTMLTextAreaElement>('[data-mes-notes-saisie]')!;
    expect(saisie.value).toBe('ancienne');
    saisie.value = 'nouvelle *version*';
    saisie.dispatchEvent(new Event('input'));
    h.querySelector<HTMLButtonElement>('[data-mes-notes-enregistrer]')!.click();
    await attendre();
    expect(notes.get('album:42')).toBe('nouvelle *version*');
    expect(h.querySelector('[data-mes-notes-rendu] em')?.textContent).toBe('version');
  });

  it('suppression : DELETE après confirmation', async () => {
    notes.set('track:5', 'à jeter');
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const h = await monter(MesNotes, { type: 'track', id: 5 });
    h.querySelector<HTMLButtonElement>('[data-mes-notes-supprimer]')!.click();
    await attendre();
    expect(confirmer).toHaveBeenCalled();
    expect(requetes.some((r) => r.methode === 'DELETE' && r.chemin === '/api/v1/library/notes/track/5')).toBe(true);
    expect(notes.has('track:5')).toBe(false);
    expect(h.textContent).toContain(FR['mesNotes.vide']);
    confirmer.mockRestore();
  });

  it('assainissement au rendu : <script>, javascript: et onerror ne deviennent jamais des éléments', async () => {
    notes.set('album:42', '<script>window.pirate = 1</script>\n\n[clic](javascript:pirate(1)) <img src=x onerror="window.pirate=2">\n\n[ok](https://exemple.fr)');
    const h = await monter(MesNotes, { type: 'album', id: 42 });
    const rendu = h.querySelector('[data-mes-notes-rendu]')!;
    expect(rendu.querySelector('script')).toBeNull();
    expect(rendu.querySelector('img')).toBeNull();
    expect(rendu.querySelector('[onerror]')).toBeNull();
    const liens = [...rendu.querySelectorAll('a')];
    expect(liens.map((a) => a.getAttribute('href'))).toEqual(['https://exemple.fr/']);
    expect(liens[0].getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(rendu.textContent).toContain('<script>window.pirate = 1</script>');
    expect((window as any).pirate).toBeUndefined();
  });

  it('recherche dans les notes : GET /library/notes?q=…', async () => {
    notes.set('album:42', 'piano en retrait');
    notes.set('album:43', 'batterie');
    const h = await monter(MesNotes, { type: 'album', id: 42 });
    h.querySelector<HTMLButtonElement>('[data-mes-notes-rechercher]')!.click();
    flushSync();
    const q = h.querySelector<HTMLInputElement>('[data-mes-notes-q]')!;
    q.value = 'piano';
    q.dispatchEvent(new Event('input'));
    q.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await attendre();
    expect(requetes.some((r) => r.chemin === '/api/v1/library/notes?q=piano&limit=20')).toBe(true);
    const res = [...h.querySelectorAll('[data-mes-notes-resultats] li')];
    expect(res).toHaveLength(1);
    expect(res[0].textContent).toContain('Kind of Blue');
  });

  it('repli sur un serveur ancien : l’album lit et écrit album_ratings.note', async () => {
    routeNotes = false;
    noteSur5 = { rating: 4, note: 'note **d’avant**' };
    const h = await monter(MesNotes, { type: 'album', id: 42 });
    expect(h.querySelector('[data-mes-notes-rendu] strong')?.textContent).toBe('d’avant');
    h.querySelector<HTMLButtonElement>('[data-mes-notes-modifier]')!.click();
    flushSync();
    const saisie = h.querySelector<HTMLTextAreaElement>('[data-mes-notes-saisie]')!;
    saisie.value = 'reprise';
    saisie.dispatchEvent(new Event('input'));
    h.querySelector<HTMLButtonElement>('[data-mes-notes-enregistrer]')!.click();
    await attendre();
    const ecrit = requetes.find((r) => r.methode === 'POST' && r.chemin === '/api/v1/library/albums/42/rate');
    expect(ecrit?.corps).toEqual({ rating: 4, note: 'reprise' });
    expect(requetes.some((r) => r.methode === 'PUT')).toBe(false);
  });

  it('repli sur un serveur ancien : artiste et piste disent que les notes ne sont pas disponibles', async () => {
    routeNotes = false;
    const h = await monter(MesNotes, { type: 'artist', id: 7 });
    expect(h.querySelector('[data-mes-notes-indisponible]')?.textContent?.trim()).toBe(FR['mesNotes.indisponible']);
    expect(h.querySelector('[data-mes-notes-modifier]')).toBeNull();
  });
});

describe('#2653 — les étoiles ne réécrivent plus une note périmée', () => {
  it('un clic sur une étoile renvoie la note RELUE, pas celle chargée à l’ouverture', async () => {
    noteSur5 = { rating: 3, note: 'avant' };
    const h = await monter(AlbumRating, { albumId: 42 });
    // « Mes notes » écrit entre-temps (le serveur tient album_ratings.note).
    noteSur5 = { rating: 3, note: 'après' };
    h.querySelectorAll<HTMLButtonElement>('.star-btn')[4].click();
    await attendre();
    const ecrit = requetes.filter((r) => r.chemin === '/api/v1/library/albums/42/rate').at(-1);
    expect(ecrit?.corps).toEqual({ rating: 5, note: 'après' });
    expect(h.querySelector('input.rating-note-input')).toBeNull();
  });
});
