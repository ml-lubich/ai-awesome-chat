import type { Metadata } from "next"
import { chatConfig } from "@/chat.config"
import { ChatWidget } from "@/components/chat/chat-widget"
import "./globals.css"

export const metadata: Metadata = {
    title: `${chatConfig.botName} — cascade-chat`,
    description: `Ask ${chatConfig.botName} about ${chatConfig.ownerName}'s work.`,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                {children}
                <ChatWidget />
            </body>
        </html>
    )
}
