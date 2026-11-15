// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AuditIntegrite from '../../components/partages/AuditIntegrite.svelte';
import { locale } from '../i18n';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let etat: Record<string, unknown>;
let lignesRapport: unknown[] | undefined;
let requetes: { url: string; method: string }[];
const response = (v: unknown) => new Response(JSON.stringify(v));
async function attendre() { for (let n = 0; n < 4; n++) { await new Promise(r => setTimeout(r, 0)); flushSync(); } }
function bouton(texte: string) { const b = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === texte); expect(b, `bouton ${texte} absent`).toBeTruthy(); return b!; }
beforeEach(() => {
  locale.set('fr');
  etat = { status: 'idle', total: 4, traites: 0, sains: 0, corrompus: 0, non_verifiables: 0, alertes_taille: 0 };
  requetes = [];
  lignesRapport = undefined;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    requetes.push({ url: String(url), method });
    if (String(url).includes('/integrity/pause')) etat.status = 'paused';
    else if (method === 'POST') {
      etat.status = 'running';
      if (!String(url).includes('resume=true')) etat.mode = String(url).includes('mode=quick') ? 'quick' : 'full';
    }
    if (String(url).includes('/all-tags')) return response({ track_id: 1, db_fields: { title: 'Fichier abîmé', path: '/musique/abîmé.flac' }, file_tags: {} });
    if (String(url).includes('/integrity/report?')) return response({ etat, lignes: lignesRapport ?? (etat.traites ? [
      { id: 1, chemin: '/musique/abîmé.flac', resultat: { verdict: 'corrompu', code: 'decodage', erreur: 'CRC invalide', position_trames: 4096 } },
      { id: 2, chemin: '/musique/sans-md5.flac', resultat: { verdict: 'non_verifiable', code: 'md5_nul', erreur: null, position_trames: null } },
    ] : []) });
    return response(etat);
  }));
  host = document.createElement('div'); document.body.append(host);
});
afterEach(async () => { if (component) await unmount(component); component = undefined; host.remove(); vi.unstubAllGlobals(); });
it('lance manuellement, suspend et reprend la même passe', async () => {
  component = mount(AuditIntegrite, { target: host }); await attendre();
  expect(requetes.some(r => r.method === 'POST'), 'aucun audit automatique au montage').toBe(false);
  bouton('Nouvel audit complet').click(); await attendre();
  expect(requetes).toContainEqual({ url: '/api/v1/library/integrity?resume=false', method: 'POST' });
  bouton('Mettre en pause').click(); await attendre();
  expect(requetes).toContainEqual({ url: '/api/v1/library/integrity/pause', method: 'POST' });
  bouton('Reprendre').click(); await attendre();
  expect(requetes).toContainEqual({ url: '/api/v1/library/integrity?resume=true', method: 'POST' });
});
it('rend le chemin, le défaut, la position et le MD5 nul séparément', async () => {
  Object.assign(etat, { status: 'completed', traites: 4, sains: 2, corrompus: 1, non_verifiables: 1 });
  component = mount(AuditIntegrite, { target: host }); await attendre();
  expect(host.textContent).toContain('/musique/abîmé.flac');
  expect(host.textContent).toContain('CRC invalide');
  expect(host.textContent).toContain('4096');
  expect(host.textContent).toContain('MD5 STREAMINFO nul');
  expect(host.textContent).toContain('Sains: 2');
  expect(bouton('Exporter en CSV').disabled).toBe(false);
});
it('signale une panne de lecture au lieu de présenter un rapport sain', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('hors ligne'));
  component = mount(AuditIntegrite, { target: host }); await attendre();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Audit indisponible');
  expect(host.textContent).not.toContain('Sains:');
});
it('refuse une réponse incomplète sans casser les autres réglages', async () => {
  vi.mocked(fetch).mockResolvedValue(response({}));
  component = mount(AuditIntegrite, { target: host }); await attendre();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Audit indisponible');
  expect(host.textContent).not.toContain('Sains:');
});
it('exporte le rapport CSV par la route authentifiée de la bibliothèque', async () => {
  etat.traites = 4;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:rapport'), revokeObjectURL: vi.fn() }));
  const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  component = mount(AuditIntegrite, { target: host }); await attendre();
  bouton('Exporter en CSV').click(); await attendre();
  expect(requetes).toContainEqual({ url: '/api/v1/library/integrity/report.csv', method: 'GET' });
  expect(clic).toHaveBeenCalledOnce();
  clic.mockRestore();
});

it.each(['corrompu', 'sain', 'non_verifiable'])('export CSV 2925 : conserve le filtre %s et nomme le fichier', async verdict => {
  etat.traites = 4;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:rapport'), revokeObjectURL: vi.fn() }));
  const noms: string[] = [];
  const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) { noms.push(this.download); });
  try {
    component = mount(AuditIntegrite, { target: host }); await attendre();
    const select = host.querySelector('option[value="corrompu"]')!.closest('select')!;
    select.value = verdict; select.dispatchEvent(new Event('change', { bubbles: true })); await attendre();
    bouton('Exporter en CSV').click(); await attendre();
    expect(requetes).toContainEqual({ url: `/api/v1/library/integrity/report.csv?verdict=${verdict}`, method: 'GET' });
    expect(noms).toEqual([`integrite-bibliotheque-${verdict}.csv`]);
    select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); await attendre();
    bouton('Exporter en CSV').click(); await attendre();
    expect(requetes).toContainEqual({ url: '/api/v1/library/integrity/report.csv', method: 'GET' });
    expect(noms.at(-1)).toBe('integrite-bibliotheque.csv');
  } finally { clic.mockRestore(); }
});


it('le mode rapide choisi envoie quick et annonce la limite MD5', async () => {
  component = mount(AuditIntegrite, { target: host }); await attendre();
  const choix = host.querySelector('option[value="quick"]')!.closest('select')!;
  choix.value = 'quick'; choix.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  expect(host.textContent).toContain('Il ne vérifie pas le MD5 du son décodé');
  bouton('Nouvel audit rapide').click(); await attendre();
  expect(requetes.filter(r => r.method === 'POST')).toEqual([{ url: '/api/v1/library/integrity?resume=false&mode=quick', method: 'POST' }]);
  expect(choix.disabled).toBe(true);
  expect(host.querySelector('[aria-live]')?.textContent).toContain('Rapide');
});

it('reprendre un audit rapide conserve le mode enregistré, même si le sélecteur dit complet', async () => {
  Object.assign(etat, { status: 'paused', mode: 'quick' });
  component = mount(AuditIntegrite, { target: host }); await attendre();
  expect(host.querySelector('option[value="quick"]')?.closest('select')?.value).toBe('full');
  bouton('Reprendre').click(); await attendre();
  expect(requetes.filter(r => r.method === 'POST')).toEqual([{ url: '/api/v1/library/integrity?resume=true', method: 'POST' }]);
  expect(etat.mode).toBe('quick');
  expect(host.querySelector('[aria-live]')?.textContent).toContain('Rapide');
});

it('le rapport distingue les modes, localise le défaut et ouvre le fichier exact sans lecture audio', async () => {
  Object.assign(etat, { status: 'completed', mode: 'quick', traites: 3 });
  lignesRapport = [
    { id: 1, chemin: '/musique/abîmé.flac', mode: 'quick', resultat: { verdict: 'corrompu', code: 'crc_trame', erreur: 'CRC invalide', localisation: { unite: 'trame', numero: 812, octet: 1204336, echantillon: 4096 }, fautes: 2 } },
    { id: 2, chemin: '/musique/coupé.flac', mode: 'full', resultat: { verdict: 'corrompu', code: 'tronque', position_trames: 8192 } },
    { id: 3, chemin: '/musique/sans-fin.ogg', mode: 'quick', resultat: { verdict: 'non_verifiable', code: 'fin_de_flux_absente', localisation: { unite: 'page', numero: 0, octet: 104, echantillon: null }, fautes: 0 } },
  ];
  component = mount(AuditIntegrite, { target: host }); await attendre();
  const rows = [...host.querySelectorAll('tbody tr')];
  expect(rows[0].textContent).toContain('Rapide');
  expect(rows[0].textContent).toContain('Trame 812 · Octet 1204336');
  expect(rows[0].textContent).toContain('Défauts: 2');
  expect(rows[1].textContent).toContain('Complet');
  expect(rows[1].textContent).toContain('Fichier tronqué');
  expect(rows[2].textContent).toContain('Marque de fin absente');
  expect(rows[2].textContent).toContain('Page 0 · Octet 104');
  bouton('/musique/abîmé.flac').click(); await attendre();
  expect(requetes.some(r => r.url.includes('/library/tracks/1/all-tags') && r.method === 'GET')).toBe(true);
  expect(requetes.some(r => r.method === 'POST')).toBe(false);
  expect(requetes.some(r => /play|stream/.test(r.url))).toBe(false);
});
