import type { PersonalApplication } from 'librechat-data-provider';

export const deliveryActive = (app: PersonalApplication) =>
  ['queued', 'preparing', 'building', 'deploying', 'changing'].includes(app.status);

export const deliveryReview = (app: PersonalApplication) =>
  !!app.error_code?.includes('requires_review');

export function canRepublish(app: PersonalApplication) {
  return (
    !deliveryActive(app) &&
    !deliveryReview(app) &&
    (app.status !== 'failed' || app.cleanup?.status === 'complete')
  );
}

/** An old URL is not evidence that a failed or uncertain rollout is serving traffic. */
export function deliveryAddress(app: PersonalApplication) {
  if (deliveryReview(app)) return null;
  let candidate = app.status === 'running' ? app.url : null;
  if (
    app.status === 'failed' &&
    app.cleanup?.status === 'complete' &&
    app.cleanup.runtime === 'previous_release'
  )
    candidate = app.previous_url ?? null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function deliveryState(app: PersonalApplication) {
  if (deliveryReview(app)) return 'com_codechat_delivery_review';
  if (app.status === 'running') return 'com_codechat_delivery_online';
  if (deliveryAddress(app)) return 'com_codechat_delivery_previous';
  if (app.status === 'stopped' || app.status === 'deleted') return 'com_codechat_delivery_offline';
  if (app.status === 'failed') return 'com_codechat_delivery_unpublished';
  return 'com_codechat_delivery_in_progress';
}
