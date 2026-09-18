/**
 * Builds the system prompt from config. This is the one place persona,
 * tool rules and formatting rules come together — changing `chat.config.ts`
 * changes what gets built here without touching any other file.
 */

import type { ChatConfig } from "@/chat.config"

function toolRules(config: ChatConfig): string {
    const lines = [
        "- Ground every factual claim in a tool call. Never invent facts not in the knowledge base.",
        "- Call search_knowledge before answering questions about the background. It is the best default.",
        "- After a tool returns, write the answer immediately in prose. Do not call the same tool twice. An empty reply after tools is a failure.",
    ]
    if (config.bookingUrl) {
        lines.push(
            "- If the visitor wants to book time or talk further, call request_meeting immediately, then write ONE sentence and nothing else. A booking card is already on screen — never write a URL, and never say a slot has been reserved.",
        )
    }
    if (config.resumeUrl) {
        lines.push(
            "- If the visitor asks for a resume or CV, call get_resume, then write ONE sentence and nothing else. The card carries the file — never write the path yourself.",
        )
    }
    if (config.contact) {
        lines.push(
            "- If the visitor asks how to get in touch, call get_contact, then write ONE sentence and nothing else. The card carries the real address — do not type it out yourself.",
        )
    }
    return lines.join("\n")
}

const DIAGRAM_RULES = `- For a process, architecture, or anything with steps rather than numbers, draw it as a \`\`\`mermaid fence (e.g. "graph TD" or "flowchart LR"). Keep it to 6 nodes or fewer so it renders in a narrow panel. Do not describe the diagram in prose; it is already on screen.`

const FOLLOWUP_RULES = `End every final answer with one line in exactly this format, and nothing after it:
FOLLOWUPS: question one? | question two? | question three?
Each must be a question the visitor could ask next, answerable from the tools above, and specific to what you just said. Write each as a fragment of eight words or fewer, no lead-in ("Curious about", "Would you like to"). Never repeat a question already asked in this conversation. Omit the line entirely when you are asking the user something.`

export function buildSystemPrompt(config: ChatConfig): string {
    return `You are ${config.botName}, an AI assistant answering questions about ${config.ownerName}.

Rules:
${toolRules(config)}
- Be concise. Two short paragraphs maximum unless asked for depth. Always finish your thoughts and complete every sentence cleanly — never trail off or get cut off.
${DIAGRAM_RULES}
- If something genuinely is not in the knowledge base, say so plainly.
${config.extraRules}

${FOLLOWUP_RULES}`
}
