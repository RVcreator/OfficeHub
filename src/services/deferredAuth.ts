/** Run profile queries after the auth callback releases Supabase's auth lock. */
export function createDeferredAuthHandler<Event, Session>(
  apply: (event: Event, session: Session, isCurrent: () => boolean) => Promise<void>,
  onError: () => void,
  key?: (event: Event, session: Session) => string,
) {
  let revision = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingKey: string | undefined;
  return {
    handle(event: Event, session: Session): void {
      if(disposed)return;
      const nextKey=key?.(event,session);
      if(nextKey!==undefined&&nextKey===pendingKey)return;
      pendingKey=nextKey;
      const current = ++revision;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (disposed || current !== revision) return;
        void apply(event, session, () => !disposed && current === revision).catch(() => {
          if (!disposed && current === revision) onError();
        }).finally(()=>{
          if(current===revision)pendingKey=undefined;
        });
      }, 0);
    },
    cancel(): void {
      revision++;clearTimeout(timer);pendingKey=undefined;
    },
    dispose(): void {
      disposed = true;
      revision++;
      clearTimeout(timer);
    },
  };
}
