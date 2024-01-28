
export interface Block {
  raw: string;
  height: bigint;
  hash: string;
  chainId: string;
  time: Date;
  events: Event[];
}

export interface Tx {
  raw: string;
  error?: TxError;
  height: bigint;
  /** Raw bytes of the transaction. */
  tx: string;
  /** Hash of the transaction. Can be used to retrieve the hash from a full node or to look up in a chain explorer. */
  txhash: string;
  events: Event[];
}

export interface Event {
  name: string;
  attributes: Record<string, Attribute>;
}

export interface Attribute {
  value: string;
  indexed: boolean;
}

export interface TxError {
  code: number;
  codespace: string;
  message: string;
}
