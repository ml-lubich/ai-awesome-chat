/**
 * Streaming pins the transcript to the bottom — but only if the reader is
 * already there. Scrolling up to re-read an earlier answer while tokens
 * are still arriving must not yank the view back down.
 */

export interface ScrollState {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
}

/** Within `slack` px of the bottom counts as "following along". */
export function isPinnedToBottom({ scrollTop, scrollHeight, clientHeight }: ScrollState, slack = 80): boolean {
    return scrollHeight - (scrollTop + clientHeight) <= slack
}
