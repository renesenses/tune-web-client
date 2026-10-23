// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AuditIntegrite from '../../components/partages/AuditIntegrite.svelte';
import { locale } from '../i18n';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let etat: Record<string, unknown>;
let requetes: { url: string; method: string }[];
const response = (v: unknown) => new Response(JSON.stringify(v));
async function attendre() { for (let n = 0; n < 4; n++) { await new Promise(r => setTimeout(r, 0)); flushSync(); } }
function bouton(texte: string) { const b = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === texte); expect(b, `bouton ${texte} absent`).toBeTruthy(); return b!; }
beforeEach(() => {
  locale.set('fr');
  etat = { status: 'idle', total: 4, traites: 0, sains: 0, corrompus: 0, non_verifiables: 0, alertes_taille: 0 };
  requetes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    requetes.push({ url: String(url), method });
    if (String(url).includes('/integrity/pause')) etat.status = 'paused';
    else if (method === 'POST') etat.status = 'running';
    if (String(url).includes('/integrity/report?')) return response({ etat, lignes: etat.traites ? [
      { id: 1, chemin: '/musique/abîmé.flac', resultat: { verdict: 'corrompu', code: 'decodage', erreur: 'CRC invalide', position_trames: 4096 } },
      { id: 2, chemin: '/musique/sans-md5.flac', resultat: { verdict: 'non_verifiable', code: 'md5_nul', erreur: null, position_trames: null } },
    ] : [] });
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
