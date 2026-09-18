/**
 * ─── Tool step display ────────────────────────────────────────────────
 *
 * What a visitor is shown while the bot works. Kept out of the widget
 * component so the collapsing rule below is testable without a DOM.
 */

export const TOOL_LABELS: Record<string, string> = {
    search_knowledge: "Searching the knowledge base",
    get_entry: "Reading an entry",
    get_contact: "Looking up contact details",
    get_resume: "Fetching the resume",
    request_meeting: "Opening the calendar",
}

export interface ToolStep {
    name: string
    done: boolean
}

/** Merges runs of steps that render the same label into one row, so two
 *  different lookups that happen to share a label do not read as a stutter. */
export function collapseToolSteps(steps: ToolStep[]): ToolStep[] {
    const out: ToolStep[] = []
    for (const step of steps) {
        const prev = out[out.length - 1]
        const sameLabel = prev && (TOOL_LABELS[prev.name] ?? prev.name) === (TOOL_LABELS[step.name] ?? step.name)
        if (sameLabel) out[out.length - 1] = { ...prev, done: prev.done && step.done }
        else out.push({ ...step })
    }
    return out
}
