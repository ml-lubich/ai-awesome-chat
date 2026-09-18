import { chatConfig } from "@/chat.config"

export default function Home() {
    return (
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "4rem 1.5rem" }}>
            <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>ai-awesome-chat</h1>
            <p style={{ lineHeight: 1.6, opacity: 0.8 }}>
                A config-driven streaming chat widget, powered by an OpenRouter free-model cascade. This demo
                answers questions about a fictional persona, {chatConfig.ownerName} — edit{" "}
                <code>chat.config.ts</code> to make it your own.
            </p>
            <p style={{ lineHeight: 1.6, opacity: 0.6, marginTop: "1.5rem" }}>
                Open the chat bubble in the bottom-right corner to try it.
            </p>
        </main>
    )
}
