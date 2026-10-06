type Handler = (...args: any[]) => void;

/** Phaser 없이 쓰는 최소 이벤트 이미터 (순수 로직 모듈용) */
export class Emitter {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, fn: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((fn) => fn(...args));
  }

  clear(): void {
    this.handlers.clear();
  }
}
