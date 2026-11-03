/** A missing INITIAL_SESSION event or stalled SDK lock must not leave an endless spinner. */
export function createAuthStartupDeadline(onTimeout: () => void, timeoutMs=20_000) {
  let finished=false;
  const timer=setTimeout(()=>{if(!finished){finished=true;onTimeout();}},timeoutMs);
  return { complete(){finished=true;clearTimeout(timer);}, dispose(){finished=true;clearTimeout(timer);} };
}
