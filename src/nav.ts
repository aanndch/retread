import { HASH_RIDE_PREFIX, HASH_LEG_PREFIX } from './constants';

/**
 * Pure predicate to determine whether in-app back navigation should pop browser
 * history via `history.back()`, or fall back to replacing with `logicalParent`.
 *
 * Rules:
 * 1. Must have an in-app predecessor starting with '#/'.
 * 2. Predecessor cannot be identical to current route.
 * 3. Predecessor can NEVER be an editor route ('#/edit') — transient edit forms
 *    must never be navigated backward into.
 * 4. A child leg route ('#/leg/') is never a valid predecessor for its parent ride ('#/ride/').
 */
export function shouldNavigateHistoryBack(
  current: string,
  prev: string | null
): boolean {
  if (!prev || !prev.startsWith('#/') || prev === current) {
    return false;
  }
  const isEditor = prev.startsWith('#/edit');
  if (isEditor) {
    return false;
  }
  const isChildLeg = current.startsWith(HASH_RIDE_PREFIX) && prev.startsWith(HASH_LEG_PREFIX);
  if (isChildLeg) {
    return false;
  }
  return true;
}
