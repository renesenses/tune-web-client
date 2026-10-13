/**
 * « Demander à l'assistant » (chantier assistant-ia, `/ai/query`,
 * tune-server-rust#6268) : citations tirées des outils, coût d'une question,
 * bouton visible seulement si l'assistant est prêt, liens lire / ajouter,
 * 11 langues.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { get } from 'svelte/store';
import type { ReglagesIa, EtatPlafondIa } from '../assistantIa';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
const notifier = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() };
vi.mock('../stores/notifications', () => ({ notifications: notifier }));

const d = await import('../assistantIaDialogue');

const source = (chemin: string) =>
  readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');

function reglages(p: Partial<ReglagesIa> = {}, cout = 1.0): ReglagesIa {
  return {
    fournisseur: 'anthropic', cle_definie: true, cle_illisible: false, tarif_connu: true,
    plafond_eur: 5,
    consommation: {
      mois: '2026-10', cout_eur: cout, appels: 3, jetons_entree: 0, jetons_sortie: 0,
      depuis_cache: 0, plafond_atteint: false,
    },
    ...p,
  } as ReglagesIa;
}
const plafond = (depense: number): EtatPlafondIa => ({
  depense_eur: depense, plafond_eur: 5, part: depense / 5, seuil_alerte: 80, alerte: false, atteint: false,
});

beforeEach(() => {
  d.oublierConversationIa();
  d.reglagesIaConnus.set(null);
});

describe('citations tirées des résultats d’outils', () => {
  const actions = [
    { tool: 'search_library', result: {
      albums: [{ id: 1, title: 'Kind of Blue', artist: 'Miles Davis' }, { id: 2, title: 'Bitches Brew', artist: 'Miles Davis' }],
      artists: [{ id: 7, name: 'Miles Davis' }],
      tracks: [{ id: 30, title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue' }],
    } },
    { tool: 'search_library', result: { albums: [{ id: 1, title: 'Kind of Blue', artist: 'Miles Davis' }] } },
    { tool: 'play_track', result: { track_id: 31, track: 'Blue in Green', artist: 'Miles Davis' } },
  ];

  it('le texte nomme : seuls les objets nommés, sans doublon', () => {
    const c = d.citationsDe({ reply: 'Je lance **Kind of Blue** et Blue in Green.', actions });
    expect(c.albums.map((a) => a.id)).toEqual([1]);
    expect(c.pistes.map((p) => p.id)).toEqual([31]);
  });

  it('le texte ne nomme rien : les premiers résultats, identifiants de la base seulement', () => {
    const c = d.citationsDe({ reply: 'Voici ce que j’ai trouvé.', actions: [
      ...actions, { tool: 'search_library', result: { albums: [{ id: 'x', title: 'faux' }, { id: -2, title: 'négatif' }] } },
    ] });
    expect(c.albums.map((a) => a.id)).toEqual([1, 2]);
    expect(c.artistes.map((a) => a.id)).toEqual([7]);
  });

  it('aucune action : aucune citation', () => {
    expect(d.aucuneCitation(d.citationsDe({ reply: 'Bonjour', actions: [] }))).toBe(true);
  });
});

describe('coût d’une question', () => {
  it('le coût rendu par le serveur ; inconnu s’il manque ou n’est pas un nombre', () => {
    expect(d.coutDeReponse({ cout_eur: 0.0042 })).toBe(0.0042);
    expect(d.coutDeReponse({ cout_eur: 0 })).toBe(0);
    expect(d.coutDeReponse({})).toBeNull();
    expect(d.coutDeReponse({ cout_eur: 'x' as any })).toBeNull();
    expect(d.coutDeReponse({ cout_eur: -1 })).toBeNull();
    expect(d.coutDeReponse(null)).toBeNull();
  });

  it('poserQuestionIa : le coût EXACT de chaque question, jamais un écart de dépense', async () => {
    d.noterReglagesIa(reglages({}, 1.0));
    const demander = vi.fn()
      // La dépense du mois bouge plus que la question (un autre usage entre-temps) :
      // le coût affiché reste celui que rend le serveur.
      .mockResolvedValueOnce({ reply: 'ok', actions: [], cout_eur: 0.003, plafond: plafond(1.009) })
      .mockResolvedValueOnce({ reply: 'ok', actions: [], cout_eur: 0.000037, plafond: plafond(1.5) });
    const t1 = await d.poserQuestionIa('  joue du jazz  ', 2, (c) => c, demander);
    expect(demander).toHaveBeenCalledWith('joue du jazz', 2);
    expect(t1.cout_eur).toBe(0.003);
    const t2 = await d.poserQuestionIa('encore', 2, (c) => c, demander);
    expect(t2.cout_eur).toBe(0.000037);
    expect(d.dernierPlafond(get(d.conversationIa))?.depense_eur).toBe(1.5);
    expect(d.texteCout('{cout} €', t1.cout_eur)).toBe('0.003 €');
    expect(d.texteCout('{cout} €', t2.cout_eur)).toBe('0.000037 €');
    expect(d.texteCout('{cout} €', 0.125)).toBe('0.125 €');
    expect(d.texteCout('{cout} €', 0)).toBe('0.00 €');
    expect(d.textePlafond('{depense}/{plafond}', plafond(1.005))).toBe('1.00/5.00');
  });

  it('serveur antérieur sans cout_eur : aucun coût de question, le plafond reste', async () => {
    d.noterReglagesIa(reglages({}, 1.0));
    const demander = vi.fn().mockResolvedValue({ reply: 'ok', actions: [], plafond: plafond(1.004) });
    const t = await d.poserQuestionIa('x', null, (c) => c, demander);
    expect(t.cout_eur).toBeNull();
    expect(d.texteCout('{cout} €', t.cout_eur)).toBeNull();
    expect(t.plafond?.depense_eur).toBe(1.004);
  });

  it('un refus en cours de question garde le coût des tours payés', async () => {
    const demander = vi.fn().mockResolvedValue({
      reply: 'Plafond…', error: 'plafond_atteint', actions: [], cout_eur: 0.1, plafond: plafond(5),
    });
    const tour = await d.poserQuestionIa('x', null, (c) => `trad:${c}`, demander);
    expect(tour.erreur).toBe('trad:plafond_atteint');
    expect(tour.cout_eur).toBe(0.1);
  });

  it('un refus du serveur est traduit par son code, sans citation', async () => {
    const demander = vi.fn().mockResolvedValue({ reply: 'Plafond…', error: 'plafond_atteint', actions: [] });
    const tour = await d.poserQuestionIa('x', null, (c) => `trad:${c}`, demander);
    expect(tour.erreur).toBe('trad:plafond_atteint');
    expect(tour.reponse).toBeNull();
    expect(tour.cout_eur).toBeNull();
  });

  it('un échec réseau : message générique, le tour n’est plus en cours', async () => {
    const tour = await d.poserQuestionIa('x', null, (c) => `trad:${c}`, vi.fn().mockRejectedValue(new Error('boom')));
    expect(tour.erreur).toBe('trad:generique');
    expect(get(d.conversationIa).every((t) => !t.enCours)).toBe(true);
  });
});

describe('visible seulement si l’assistant est configuré', () => {
  it('prêt : fournisseur, clé qui s’ouvre, tarif connu', async () => {
    expect(await d.sonderAssistantIa(async () => reglages())).toBe(true);
    expect(get(d.assistantIaPret)).toBe(true);
  });

  it('pas de fournisseur, pas de clé, clé illisible, tarif inconnu : absent', async () => {
    for (const p of [{ fournisseur: null }, { cle_definie: false }, { cle_illisible: true }, { tarif_connu: false }]) {
      expect(await d.sonderAssistantIa(async () => reglages(p as Partial<ReglagesIa>))).toBe(false);
    }
    // Ollama n'a pas de clé.
    expect(await d.sonderAssistantIa(async () => reglages({ fournisseur: 'ollama', cle_definie: false }))).toBe(true);
  });

  it('serveur sans le greffon (404, corps illisible) : absent, sans bandeau', async () => {
    d.reglagesIaConnus.set(reglages());
    expect(await d.sonderAssistantIa(async () => { throw new Error('404'); })).toBe(false);
    expect(await d.sonderAssistantIa(async () => ({}))).toBe(false);
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it('la coquille ne montre le bouton et le panneau que si prêt ; les réglages tiennent le magasin', () => {
    const shell = source('../../components/v2/ShellV2.svelte');
    expect(shell).toMatch(/\{#if \$assistantIaPret\}\s*<button[^\n]{0,120}data-demander-assistant-bouton/);
    expect(shell).toMatch(/\{#if demanderIa && \$assistantIaPret\}/);
    expect(shell).toContain('sonderAssistantIa()');
    expect(source('../../components/v2/AssistantIaReglagesV2.svelte')).toMatch(/function remplir\([^)]*\) \{\s*noterReglagesIa\(v\);/);
  });
});

describe('lire et ajouter', () => {
  it('album → album_id, piste → track_id, vers la zone courante', async () => {
    const jouer = vi.fn().mockResolvedValue({});
    const ajouter = vi.fn().mockResolvedValue({});
    await d.lireCitation('album', 1, 3, jouer);
    await d.lireCitation('piste', 30, 3, jouer);
    await d.ajouterCitation('album', 2, 3, ajouter);
    await d.ajouterCitation('piste', 31, 3, ajouter);
    expect(jouer.mock.calls).toEqual([[3, { album_id: 1 }], [3, { track_id: 30 }]]);
    expect(ajouter.mock.calls).toEqual([[3, { album_id: 2 }], [3, { track_id: 31 }]]);
  });

  it('le panneau branche les deux boutons sur albums et pistes', () => {
    const panneau = source('../../components/v2/DemanderAssistantIaV2.svelte');
    expect(panneau).toContain("lire('album', a.id)");
    expect(panneau).toContain("ajouter('album', a.id, a.title)");
    expect(panneau).toContain("lire('piste', p.id)");
    expect(panneau).toContain("ajouter('piste', p.id, p.title)");
    expect(panneau).toContain('data-ia-cout');
    expect(panneau).toContain('data-ia-plafond');
  });
});

describe('11 langues', () => {
  const cles = ['button', 'title', 'intro', 'placeholder', 'send', 'thinking', 'new', 'play', 'add', 'added', 'noZone', 'cost', 'cap']
    .map((k) => `assistantIa.ask.${k}`).concat('assistantIa.err.erreur_fournisseur');
  for (const loc of ONZE_LANGUES) {
    it(`${loc} : toutes les clés, gabarits conservés`, () => {
      const dico = dictionnaire(loc);
      for (const k of cles) expect(dico[k], `${loc} ${k}`).toBeTruthy();
      expect(dico['assistantIa.ask.cost']).toContain('{cout}');
      expect(dico['assistantIa.ask.cap']).toContain('{depense}');
      expect(dico['assistantIa.ask.cap']).toContain('{plafond}');
      expect(dico['assistantIa.ask.added']).toContain('{titre}');
    });
  }
});
