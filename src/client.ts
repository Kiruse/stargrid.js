import WebSocket from 'ws';
import { Event } from '@kiruse/typed-events';
import { Block, Tx } from './types';
import { TxFilter } from './txfilter';

export interface CloseFrame {
  code: number;
  reason?: string;
}

export default class StargridClient {
  #ws: WebSocket | undefined;

  readonly onConnect = Event();
  readonly onClose = Event<CloseFrame>();
  readonly onError = Event<any>();
  readonly onBlock = Event<Block>();
  readonly onTx = Event<Tx>();
  readonly #onMessageEvent = Event<any>();

  /** Connect to the Stargrid server. By default, attempts to connect to a local server. */
  connect(endpoint = 'ws://localhost:27043', timeout = 5000) {
    if (this.#ws) this.#ws.close();
    const ws = new WebSocket(endpoint);
    this.#ws = ws;

    ws.on('open', () => this.onConnect.emit());
    ws.on('message', this.#onMessage);
    ws.on('close', (code, reason) => this.onClose.emit({ code, reason }));
    ws.on('error', (err) => this.onError.emit(err));

    return new Promise<this>((resolve, reject) => {
      let connected = false;
      this.onConnect.once(() => {
        connected = true;
        resolve(this);
      });
      setTimeout(() => {
        if (!connected) reject(new Error('Connection timed out'));
      }, timeout);
    });
  }

  #onMessage = (data: WebSocket.Data) => {
    const msg = JSON.parse(data.toString());
    if ('block' in msg) {
      const json = msg.block;
      this.onBlock.emit({
        raw: json.raw,
        height: BigInt(json.height),
        hash: json.hash,
        chainId: json.chain_id,
        time: new Date(json.time),
        events: json.events,
      });
    } else if ('tx' in msg) {
      const json = msg.tx;
      this.onTx.emit({
        raw: json.raw,
        error: json.error,
        height: BigInt(json.height),
        tx: json.tx,
        txhash: json.txhash,
        events: json.events,
      });
    } else {
      this.#onMessageEvent.emit(msg);
    }
  }

  subscribeBlocks() {
    if (!this.#ws) throw new Error('Not connected');
    this.#ws.send(JSON.stringify({ subscribe: 'blocks' }));
    return this;
  }

  async subscribeTxs(id: number, filters: Record<string, TxFilter>) {
    if (!this.#ws) throw new Error('Not connected');
    this.#ws.send(JSON.stringify({
      subscribe: {
        txs: {
          id,
          filters,
        },
      },
    }));

    return new Promise<this>((resolve, reject) => {
      this.#onMessageEvent.oncePred(
        ({ args: msg }) => {
          if (msg.subscription.error) reject(msg.subscription.error);
          resolve(this);
        },
        ({ args: msg }) => 'subscription' in msg && msg.subscription.id === id,
      );
    });
  }

  sync = () => new Promise<CloseFrame>((resolve, reject) => {
    this.onClose.once(({ args: frame }) => resolve(frame));
    this.onError.once(({ args: err }) => reject(err));
  });
}
