/**
 * Whether the thread follows the newest message. It follows until the reader scrolls up past the threshold;
 * new content while they are away is "unseen" (the Jump to latest pill). A send or a jump follows again.
 */
export const FOLLOW_THRESHOLD = 96;

export type FollowState = { following: boolean; unseen: boolean };
export type FollowEvent = { type: "scroll"; distance: number } | { type: "content" } | { type: "send" } | { type: "jump" };

export const initialFollow: FollowState = { following: true, unseen: false };

export function followReducer(state: FollowState, event: FollowEvent): FollowState {
  switch (event.type) {
    case "scroll": {
      if (event.distance < FOLLOW_THRESHOLD) return state.following && !state.unseen ? state : initialFollow;
      return state.following ? { following: false, unseen: state.unseen } : state;
    }
    case "content":
      return state.following || state.unseen ? state : { following: false, unseen: true };
    case "send":
    case "jump":
      return state.following && !state.unseen ? state : initialFollow;
  }
}

/** Pixels between the bottom of the viewport and the end of the content. */
export function distanceFromBottom(el: { scrollHeight: number; scrollTop: number; clientHeight: number }): number {
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}
