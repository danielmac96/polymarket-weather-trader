import WebSocket from 'ws';
import { createLogger } from '@pwa/shared';
import { ClobEvent, type PriceHandler } from './handler.js';

const log = createLogger('ws');

const CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const SUBSCRIPTION_BATCH_SIZE = 500;
const PING_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 60_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

export interface ClobClientDeps {
  handler: PriceHandler;
  getActiveTokenIds: () => Promise<string[]>;
}

export class ClobWebSocketClient {
  private ws: WebSocket | null = null;
  private subscribedTokens = new Set<string>();
  private reconnectDelay = RECONNECT_MIN_MS;
  private stopping = false;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;

  constructor(private deps: ClobClientDeps) {}

  async start(): Promise<void> {
    this.stopping = false;
    await this.connect();
  }

  stop(): void {
    this.stopping = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  /** Add a token to the subscription set. If connected, sends subscribe now. */
  addToken(tokenId: string): void {
    if (this.subscribedTokens.has(tokenId)) return;
    this.subscribedTokens.add(tokenId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe([tokenId]);
    }
  }

  setTokens(tokenIds: string[]): void {
    this.subscribedTokens = new Set(tokenIds);
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;
    log.info({ url: CLOB_WS_URL }, 'connecting');
    const ws = new WebSocket(CLOB_WS_URL);
    this.ws = ws;

    ws.on('open', () => {
      log.info('connected');
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.lastMessageAt = Date.now();
      // Reload tokens from DB on every (re)connect, then subscribe.
      this.deps
        .getActiveTokenIds()
        .then((tokens) => {
          this.subscribedTokens = new Set(tokens);
          this.subscribeAll();
        })
        .catch((err: unknown) => {
          log.error({ err: String(err) }, 'failed to load active tokens after open');
        });
      this.startTimers();
    });

    ws.on('message', (data) => {
      this.lastMessageAt = Date.now();
      const text = data.toString();
      if (text === 'PONG' || text === 'pong') {
        this.clearPongTimer();
        return;
      }
      this.handleMessage(text).catch((err: unknown) => {
        log.warn({ err: String(err) }, 'handle error');
      });
    });

    ws.on('close', (code, reason) => {
      log.warn({ code, reason: reason.toString() }, 'closed');
      this.cleanupAndReconnect();
    });

    ws.on('error', (err) => {
      log.warn({ err: String(err) }, 'error');
      // The 'close' event will follow.
    });
  }

  private async handleMessage(text: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      log.debug({ preview: text.slice(0, 200) }, 'non-json message');
      return;
    }
    // Polymarket can send arrays or single events; normalize.
    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const raw of events) {
      const result = ClobEvent.safeParse(raw);
      if (!result.success) {
        log.debug({ issues: result.error.issues, raw }, 'event failed schema');
        continue;
      }
      await this.deps.handler.handle(result.data);
    }
  }

  private subscribeAll(): void {
    const tokens = Array.from(this.subscribedTokens);
    if (tokens.length === 0) {
      log.info('no tokens to subscribe to');
      return;
    }
    for (let i = 0; i < tokens.length; i += SUBSCRIPTION_BATCH_SIZE) {
      const batch = tokens.slice(i, i + SUBSCRIPTION_BATCH_SIZE);
      this.sendSubscribe(batch);
    }
    log.info({ count: tokens.length }, 'subscribed to tokens');
  }

  private sendSubscribe(tokenIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { type: 'MARKET', assets_ids: tokenIds };
    this.ws.send(JSON.stringify(payload));
  }

  private startTimers(): void {
    this.clearTimers();
    this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
    this.healthTimer = setInterval(() => this.checkHealth(), HEALTH_CHECK_INTERVAL_MS / 2);
  }

  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send('PING');
      this.clearPongTimer();
      this.pongTimer = setTimeout(() => {
        log.warn('pong timeout — forcing reconnect');
        this.forceClose();
      }, PONG_TIMEOUT_MS);
    } catch (err) {
      log.warn({ err: String(err) }, 'ping send failed');
    }
  }

  private checkHealth(): void {
    const silenceMs = Date.now() - this.lastMessageAt;
    if (silenceMs > HEALTH_CHECK_INTERVAL_MS) {
      log.warn({ silenceMs }, 'silence exceeded health threshold — forcing reconnect');
      this.forceClose();
    }
  }

  private forceClose(): void {
    if (!this.ws) return;
    try {
      this.ws.terminate();
    } catch {
      // ignore
    }
  }

  private cleanupAndReconnect(): void {
    this.clearTimers();
    this.ws = null;
    if (this.stopping) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    log.info({ delayMs: delay }, 'reconnecting');
    setTimeout(() => {
      this.connect().catch((err: unknown) => {
        log.error({ err: String(err) }, 'reconnect failed');
      });
    }, delay);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.clearPongTimer();
    this.pingTimer = null;
    this.healthTimer = null;
  }

  private clearPongTimer(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }
}
