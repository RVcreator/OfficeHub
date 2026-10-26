/** Run profile queries after the auth callback releases Supabase's auth lock. */
export function createDeferredAuthHandler<Event, Session>(
  apply: (event: Event, session: Session, isCurrent: () => boolean) => Promise<void>,
  onError: () => void,
) {
  let revision = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    handle(event: Event, session: Session): void {
      const current = ++revision;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (disposed || current !== revision) return;
        void apply(event, session, () => !disposed && current === revision).catch(() => {
          if (!disposed && current === revision) onError();
        });
      }, 0);
    },
    dispose(): void {
      disposed = true;
      revision++;
      clearTimeout(timer);
    },
  };
}
