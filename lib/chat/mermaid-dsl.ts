/** True when a fenced block is Mermaid diagram syntax rather than prose. */
export function isMermaidDsl(body: string): boolean {
    const t = body.trim()
    if (!t || t.startsWith("{")) return false
    return /^(?:graph\s+(?:TD|TB|BT|LR|RL)|flowchart\s+(?:TD|TB|BT|LR|RL)|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|journey|gantt|pie\s+|gitGraph|mindmap|timeline|quadrantChart|C4Context|sankey-beta)/im.test(
        t,
    )
}
