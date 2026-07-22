// Live `navigate()` handles for each open tab, keyed by tab id. A ref table (not
// React state) shared between the tabs store and the tab host: the store uses it
// to route an already-open module tab to a sibling sub-page, and the host's
// Back/Forward handler uses it to restore the right tab's route.
export const navMap = new Map<string, (to: string) => void>();
