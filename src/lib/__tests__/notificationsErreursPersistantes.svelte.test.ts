// @vitest-environment jsdom
// Les erreurs restent jusqu'à leur fermeture ; info / succès gardent leur
// durée mais se suspendent au survol et au focus ; les doublons se regroupent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { notifications, MAX_ERREURS_VISIBLES } from '../stores/notifications';
import ToastContainer from '../../components/partages/ToastContainer.svelte';

function vider() {
  for (const n of get(notifications)) notifications.dismiss(n.id);
}

beforeEach(() => {
  vi.useFakeTimers();
  vider();
});
afterEach(() => {
  vider();
  vi.useRealTimers();
});

describe('notifications — erreurs persistantes', () => {
  it('une erreur reste affichée après 10 s', () => {
    notifications.error('Volume refusé');
    vi.advanceTimersByTime(10_000);
    expect(get(notifications).map((n) => n.message)).toEqual(['Volume refusé']);
  });

  it('une durée explicite est respectée', () => {
    notifications.error('Éphémère', 2000);
    vi.advanceTimersByTime(1999);
    expect(get(notifications)).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(get(notifications)).toHaveLength(0);
  });

  it('la fermeture retire l’erreur (bouton accessible)', () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(ToastContainer, { target: cible });
    notifications.error('Volume refusé');
    flushSync();
    const bouton = cible.querySelector('button.toast-dismiss') as HTMLButtonElement;
    expect(bouton.getAttribute('aria-label')).toBeTruthy();
    bouton.click();
    flushSync();
    expect(get(notifications)).toHaveLength(0);
    expect(cible.querySelector('.toast')).toBeNull();
    unmount(c);
    cible.remove();
  });

  it('info et succès gardent leur durée', () => {
    notifications.info('i');
    notifications.success('s');
    vi.advanceTimersByTime(4001);
    expect(get(notifications)).toHaveLength(0);
  });

  it('la pause au survol suspend la minuterie, la reprise la relance', () => {
    const id = notifications.info('survol', 3000);
    vi.advanceTimersByTime(2000);
    notifications.pause(id);
    vi.advanceTimersByTime(60_000);
    expect(get(notifications)).toHaveLength(1);
    notifications.resume(id);
    vi.advanceTimersByTime(999);
    expect(get(notifications)).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(get(notifications)).toHaveLength(0);
  });

  it('le survol et le focus du bandeau déclenchent la pause', () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(ToastContainer, { target: cible });
    notifications.success('ok', 3000);
    flushSync();
    const toast = cible.querySelector('.toast') as HTMLElement;
    toast.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(10_000);
    expect(get(notifications)).toHaveLength(1);
    toast.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(3001);
    expect(get(notifications)).toHaveLength(0);

    notifications.success('ok2', 3000);
    flushSync();
    const t2 = cible.querySelector('.toast') as HTMLElement;
    t2.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(10_000);
    expect(get(notifications)).toHaveLength(1);
    t2.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    vi.advanceTimersByTime(3001);
    expect(get(notifications)).toHaveLength(0);
    unmount(c);
    cible.remove();
  });

  it('des erreurs identiques coup sur coup se regroupent avec un compteur', () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(ToastContainer, { target: cible });
    const a = notifications.error('Volume refusé');
    const b = notifications.error('Volume refusé');
    notifications.error('Autre');
    flushSync();
    expect(b).toBe(a);
    const liste = get(notifications);
    expect(liste).toHaveLength(2);
    expect(liste[0].count).toBe(2);
    expect(cible.querySelector('.toast-count')?.textContent).toBe('×2');
    unmount(c);
    cible.remove();
  });

  it('au-delà de 5 erreurs, les plus anciennes se replient', () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(ToastContainer, { target: cible });
    for (let i = 0; i < MAX_ERREURS_VISIBLES + 2; i++) notifications.error(`Erreur ${i}`);
    flushSync();
    const rendus = [...cible.querySelectorAll('.toast:not(.toast-repli) .toast-msg')].map((e) => e.textContent!.trim());
    expect(rendus).toEqual(['Erreur 2', 'Erreur 3', 'Erreur 4', 'Erreur 5', 'Erreur 6']);
    expect(cible.querySelector('.toast-repli')).not.toBeNull();
    unmount(c);
    cible.remove();
  });
});
