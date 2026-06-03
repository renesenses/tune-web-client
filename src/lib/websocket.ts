// WebSocket client for real-time events from tune-server
// Falls back to HTTP polling after repeated WS failures

import type { WSEvent } from './types';
import { apiFetch } from './api';

type EventHandler = (event: WSEvent) => void;

const POLLING_THRESHOLD = 5;
const POLLING_INTERVAL_MS = 2000;

class TuneWebSocket {
  private ws: WebSocket | null = null;
  private handlers: EventHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private _connected = false;
  private _reconnecting = false;
  private _attemptCount = 0;
  private _polling = false;
  private _pollingTimer: ReturnType<typeof setInterval> | null = null;
  private _stableTimer: ReturnType<typeof setTimeout> | null = null;
  private _currentZoneId: number | null = null;

  get connected() {
    return this._connected;
  }

  get reconnecting() {
    return this._reconnecting;
  }

  get attemptCount() {
    return this._attemptCount;
  }

  get isPolling() {
    return this._polling;
  }

  /** Called by App.svelte to keep polling aware of the active zone */
  setCurrentZoneId(zoneId: number | null) {
    this._currentZoneId = zoneId;
  }

  connect() {
    // If we're in polling mode, still attempt a WS connection in the background
    // to see if WS has become available (e.g. after server restart)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        const wasPolling = this._polling;
        this._connected = true;
        this._reconnecting = false;
        this.reconnectDelay = 1000;
        // Only reset attemptCount after connection stays stable for 5s —
        // prevents flapping WS from resetting the counter every brief connect.
        if (this._stableTimer) clearTimeout(this._stableTimer);
        this._stableTimer = setTimeout(() => { this._attemptCount = 0; }, 5000);

        // Exit polling mode — WS is now working
        if (wasPolling) {
          console.log('WebSocket recovered, exiting polling mode');
          this.stopPolling();
        }

        // Subscribe to all event patterns
        this.send({
          action: 'subscribe',
          patterns: ['playback.*', 'zone.*', 'playlist.*', 'library.*', 'device.*', 'system.*'],
        });
        this.handlers.forEach((h) => h({ type: '_connected', data: null }));
      };

      this.ws.onmessage = (event) => {
        try {
          // Handle ping from server
          if (event.data === '{"type":"ping"}') {
            this.ws?.send('pong');
            return;
          }
          const data = JSON.parse(event.data) as WSEvent;
          this.handlers.forEach((handler) => handler(data));
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onclose = () => {
        this._connected = false;
        this._reconnecting = true;
        if (this._stableTimer) { clearTimeout(this._stableTimer); this._stableTimer = null; }
        this._attemptCount++;

        if (!this._polling && this._attemptCount >= POLLING_THRESHOLD) {
          console.log(`WebSocket failed ${this._attemptCount} times, switching to HTTP polling`);
          this.startPolling();
          return;
        }

        if (this._polling) {
          // Already in polling mode — schedule a background WS retry with longer delay
          console.log('WebSocket still unavailable, continuing polling');
          this.scheduleReconnect(30000);
          return;
        }

        console.log('WebSocket disconnected, reconnecting...');
        this.handlers.forEach((h) => h({ type: '_disconnected', data: { attemptCount: this._attemptCount } }));
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (e) {
      console.error('WebSocket connection failed:', e);
      this._attemptCount++;

      if (!this._polling && this._attemptCount >= POLLING_THRESHOLD) {
        console.log(`WebSocket failed ${this._attemptCount} times, switching to HTTP polling`);
        this.startPolling();
        return;
      }

      this.scheduleReconnect();
    }
  }

  private startPolling() {
    if (this._pollingTimer) return;
    this._polling = true;
    this._connected = true;
    this._reconnecting = false;

    // Emit connected event so the app initializes
    this.handlers.forEach((h) => h({ type: '_connected', data: null }));
    // Also emit a polling event so the UI can react
    this.handlers.forEach((h) => h({ type: '_polling_started', data: null }));

    this._pollingTimer = setInterval(() => this.poll(), POLLING_INTERVAL_MS);
    // Run first poll immediately
    this.poll();

    // Schedule a background WS reconnect attempt with a long delay
    this.scheduleReconnect(30000);
  }

  private stopPolling() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
    this._polling = false;
    this.handlers.forEach((h) => h({ type: '_polling_stopped', data: null }));
  }

  private async poll() {
    try {
      const zones = await apiFetch('/zones');
      this.handlers.forEach((h) => h({ type: 'zone.updated', data: { zones } }));

      if (this._currentZoneId !== null) {
        try {
          const queue = await apiFetch(`/zones/${this._currentZoneId}/queue`);
          this.handlers.forEach((h) => h({ type: 'playback.queue_changed', data: { zone_id: this._currentZoneId, ...queue } }));
        } catch {
          // Queue fetch can fail if zone has no queue — ignore
        }
      }
    } catch (e) {
      console.warn('Polling fetch failed:', e);
      // Don't disconnect — server may be temporarily unreachable
    }
  }

  private scheduleReconnect(overrideDelay?: number) {
    if (this.reconnectTimer) return;
    const delay = overrideDelay ?? this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!overrideDelay) {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      }
      this.connect();
    }, delay);
  }

  onEvent(handler: EventHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPolling();
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }
}

export const tuneWS = new TuneWebSocket();
