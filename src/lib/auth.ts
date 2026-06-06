// Auth token management for Tune web client

const TOKEN_KEY = 'tune_jwt_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  // Redirect to login view
  window.location.hash = '#login';
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}
