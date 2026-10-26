import type {
  SuperadminPostPublishedInput,
  SuperadminPostPublishedView,
} from '../../../../../../libs/common/types/superadmin-posts';

export abstract class SuperadminPostPublishedReader {
  // D6b implements this with GetSuperadminPostsPage(first=1), not a new health endpoint.
  abstract checkProjectionReady(input: {
    searchUsername: string | null;
    signal: AbortSignal;
  }): Promise<void>;
  abstract readPublishedView(
    input: SuperadminPostPublishedInput & { signal: AbortSignal },
  ): Promise<SuperadminPostPublishedView>;
}

export type PostSubscriptionAccess = {
  assertAuthorized: () => Promise<unknown>;
  unavailable: () => void;
  onClose: (cleanup: () => void) => () => void;
};
