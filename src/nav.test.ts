import { describe, it, expect } from 'vitest';
import { shouldNavigateHistoryBack } from './nav';

describe('shouldNavigateHistoryBack', () => {
  it('returns true when predecessor is a valid in-app parent or search/photo route', () => {
    // Navigating from Search into Ride
    expect(shouldNavigateHistoryBack('#/ride/1', '#/search?q=mumbai')).toBe(true);
    // Navigating from Home into Ride
    expect(shouldNavigateHistoryBack('#/ride/1', '#/')).toBe(true);
    // Navigating from Photos into Ride
    expect(shouldNavigateHistoryBack('#/ride/1', '#/photos')).toBe(true);
    // Navigating from Ride into Leg
    expect(shouldNavigateHistoryBack('#/leg/1', '#/ride/1')).toBe(true);
    // Navigating from Search into Leg
    expect(shouldNavigateHistoryBack('#/leg/1', '#/search?q=pune')).toBe(true);
  });

  it('returns false when predecessor is null (fresh deep link)', () => {
    expect(shouldNavigateHistoryBack('#/ride/1', null)).toBe(false);
    expect(shouldNavigateHistoryBack('#/leg/1', null)).toBe(false);
  });

  it('returns false on same-hash edges', () => {
    expect(shouldNavigateHistoryBack('#/ride/1', '#/ride/1')).toBe(false);
    expect(shouldNavigateHistoryBack('#/leg/1', '#/leg/1')).toBe(false);
  });

  it('returns false when predecessor is an editor route (never pop backward into an editor)', () => {
    expect(shouldNavigateHistoryBack('#/ride/1', '#/edit?mode=edit-ride&rideId=1')).toBe(false);
    expect(shouldNavigateHistoryBack('#/ride/1', '#/edit?mode=new-leg&rideId=1')).toBe(false);
    expect(shouldNavigateHistoryBack('#/ride/1', '#/edit?mode=new-ride')).toBe(false);
    expect(shouldNavigateHistoryBack('#/leg/1', '#/edit?mode=edit&legId=1')).toBe(false);
    expect(shouldNavigateHistoryBack('#/', '#/edit?mode=new-ride')).toBe(false);
  });

  it('returns false when current is a Ride and predecessor is a child Leg', () => {
    // Leaving a Leg returns to Ride; subsequent back on Ride must go to Home, not back to Leg
    expect(shouldNavigateHistoryBack('#/ride/1', '#/leg/1')).toBe(false);
    expect(shouldNavigateHistoryBack('#/ride/1', '#/leg/2?modal=map')).toBe(false);
  });

  it('allows editor internal cancel to pop back to host', () => {
    // When inside an editor, cancelling should pop back to the page it was opened from
    expect(shouldNavigateHistoryBack('#/edit?mode=edit-ride&rideId=1', '#/ride/1')).toBe(true);
    expect(shouldNavigateHistoryBack('#/edit?mode=new-leg&rideId=1', '#/ride/1')).toBe(true);
    expect(shouldNavigateHistoryBack('#/edit?mode=edit&legId=1', '#/leg/1')).toBe(true);
    expect(shouldNavigateHistoryBack('#/edit?mode=new-ride', '#/')).toBe(true);
  });
});
