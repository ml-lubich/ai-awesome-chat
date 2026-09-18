"use client"

import { useEffect, useState } from "react"
import { nextReveal } from "@/lib/chat/stream-reveal"

/** Returns the part of `target` revealed so far, advancing one word-aligned step
 *  per animation frame. With `animate` off (a turn that was already complete when
 *  it mounted) it returns `target` untouched. It keeps draining after the stream
 *  ends, so the last words still glide in. */
export function useSmoothText(target: string, animate: boolean): string {
    const [shown, setShown] = useState(animate ? 0 : target.length)

    useEffect(() => {
        if (!animate || shown >= target.length) return
        const raf = requestAnimationFrame(() => setShown(nextReveal(shown, target)))
        return () => cancelAnimationFrame(raf)
    }, [shown, target, animate])

    return animate ? target.slice(0, shown) : target
}
