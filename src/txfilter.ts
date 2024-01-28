
export class TxFilter {
  static exact(value: string) {
    return { exact: value };
  }

  static startsWith(value: string) {
    return { startsWith: value };
  }

  static endsWith(value: string) {
    return { endsWith: value };
  }

  static contains(value: string) {
    return { contains: value };
  }

  static glob(value: string) {
    return { glob: value };
  }
}
