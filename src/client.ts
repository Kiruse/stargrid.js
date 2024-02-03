import { Event, EventHandler } from '@kiruse/typed-events';
import { WebSocket } from 'ws';
import { StargridSubscriptionError } from './errors';
import { Block, EventFilter, Tx } from './types';

interface RawAttributes {
  [key: string]: {
    value: string;
    indexed: boolean;
  };
}

export interface CloseFrame {
  code: number;
  reason?: string;
}

export default class StargridClient {
  #ws: WebSocket | undefined;
  #nextSubId = 1;
  #connected = false;

  readonly #onConnect = Event();
  readonly onClose = Event<CloseFrame>();
  readonly onError = Event<any>();
  readonly onSubscribe = Event<{ id: number, filters: Record<string, any> }>();
  readonly #onBlock = Event<Block>();
  readonly #onTx = Event<Tx>();
  readonly #onMessageEvent = Event<any>();

  constructor() {
    this.#onConnect(() => {
      this.#connected = true;
    });
    this.onClose(() => {
      this.#connected = false;
    });
  }

  /** Connect to the Stargrid server. By default, attempts to connect to a local server. */
  connect(endpoint = 'ws://localhost:5566', timeout = 5000) {
    if (this.#ws) this.#ws.close();
    const ws = new WebSocket(endpoint);
    this.#ws = ws;

    ws.on('open', () => this.#onConnect.emit());
    ws.on('message', this.#onMessage);
    ws.on('close', (code: number, reason: string) => this.onClose.emit({ code, reason }));
    ws.on('error', (err: any) => this.onError.emit(err));

    return new Promise<this>((resolve, reject) => {
      let connected = false;
      this.#onConnect.once(() => {
        connected = true;
        resolve(this);
      });
      setTimeout(() => {
        if (!connected) reject(new Error('Connection timed out'));
      }, timeout);
    });
  }

  #onMessage = (data: any) => {
    const msg = JSON.parse(data.toString());
    if ('block' in msg) {
      const json = msg.block;
      this.#onBlock.emit({
        raw: json.raw,
        height: BigInt(json.height),
        hash: json.hash,
        chainId: json.chain_id,
        time: new Date(json.time),
        events: json.events,
      });
    } else if ('tx' in msg) {
      const { id, tx: json } = msg.tx;
      this.#onTx.emit({
        id,
        raw: json.raw,
        error: json.error,
        height: BigInt(json.height),
        tx: json.tx,
        txhash: json.txhash,
        events: json.events.map((e: any) => ({
          type: e.name,
          name: e.name,
          attributes: Object.fromEntries(
            Object.entries(e.attributes as RawAttributes)
              .map(([key, attr]) => [key, attr.value])
          ),
          indexes: Object.entries(e.attributes as RawAttributes)
            .filter(([, attr]) => attr.indexed)
            .map(([key]) => key),
        })),
      });
    } else {
      this.#onMessageEvent.emit(msg);
    }
  }

  onConnect = async (handler: () => Promise<void> | void) => {
    if (this.connected) {
      try {
        await handler();
      } catch (err) {
        this.onError.emit(err);
      }
    } else {
      this.#onConnect.once(async () => {
        try {
          await handler();
        } catch (err) {
          this.onError.emit(err);
        }
      });
    }
  }

  onBlock = (handler: EventHandler<Block, void>) => {
    if (!this.#ws) throw new Error('Not connected');
    this.#ws.send(JSON.stringify({ subscribe: 'blocks' }));
    return this.#onBlock(handler);
  }

  onTx = (filters: EventFilter[]) => {
    if (!this.#ws) throw new Error('Not connected');
    const id = this.#nextSubId++;
    this.#ws.send(JSON.stringify({
      subscribe: {
        txs: {
          id,
          filters: filters.map(filter => {
            const entries = Object.entries(filter);
            if (entries.length !== 1) throw new Error('Invalid filter. Should take the shape `{ [name]: { ...attribute_filters } }`');
            const [name, attributes] = entries[0];
            return {
              name,
              attributes,
            };
          }),
        },
      },
    }));

    this.#onMessageEvent.oncePred(
      ({ args: msg }) => {
        if (msg.subscription.error) {
          this.onError.emit(new StargridSubscriptionError(id, msg.subscription.error));
        } else {
          this.onSubscribe.emit({ id: msg.subscription.id, filters });
        }
      },
      ({ args: msg }) => 'subscription' in msg && msg.subscription.id === id,
    );

    const emitter = Event<Tx>();
    const unsub = this.#onTx(({ args: tx }) => {
      if (tx.id === id) emitter.emit(tx);
    });

    return Object.assign(emitter, {
      destroy: () => {
        unsub();
      },
    });
  }

  sync = () => new Promise<CloseFrame>((resolve, reject) => {
    this.onClose.once(({ args: frame }) => resolve(frame));
    this.onError.once(({ args: err }) => reject(err));
  });

  get connected() {
    return this.#connected;
  }
}
