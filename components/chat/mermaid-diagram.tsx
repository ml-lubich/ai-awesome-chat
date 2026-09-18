"use client"

import { useEffect, useId, useRef, useState } from "react"

/** Renders Mermaid DSL (graph TD, flowchart LR, …) emitted inside a reply. */
export function MermaidDiagram({ source }: { source: string }) {
    const hostRef = useRef<HTMLDivElement>(null)
    const uid = useId().replace(/:/g, "")
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let cancelled = false
        const host = hostRef.current
        if (!host) return

        setFailed(false)
        host.replaceChildren()

        void renderInto(source, uid, (svg) => {
            if (cancelled || !hostRef.current) return
            hostRef.current.innerHTML = svg
        }).catch(() => {
            if (!cancelled) setFailed(true)
        })

        return () => {
            cancelled = true
        }
    }, [source, uid])

    if (failed) {
        return <pre className="cc-mermaid-fallback">{source.trim()}</pre>
    }

    return (
        <div className="cc-mermaid">
            <div ref={hostRef} />
        </div>
    )
}

async function renderInto(source: string, uid: string, onSvg: (svg: string) => void): Promise<void> {
    const mermaid = (await import("mermaid")).default
    mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
    })
    const { svg } = await mermaid.render(`cc-mermaid-${uid}-${Date.now()}`, source.trim())
    onSvg(svg)
}
