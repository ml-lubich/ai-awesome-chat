"use client"

/**
 * Hand-off cards: contact, resume, meeting. Same shape for all three — a
 * header strip, a line of context, and the real action — so the model
 * never has to paste a link or an address itself.
 */

import { CalendarPlus, Clock, ExternalLink, FileDown, Github, Linkedin, Mail } from "lucide-react"
import type { ContactResult, MeetingResult, ResumeResult } from "@/lib/chat/tools"

export function ResumeCard({ resume }: { resume: ResumeResult }) {
    return (
        <figure className="cc-card">
            <div className="cc-card-head">
                <FileDown size={14} aria-hidden />
                <span>Resume</span>
            </div>
            <div className="cc-card-body">
                <p className="cc-card-summary">{resume.summary}</p>
                <div className="cc-card-actions">
                    <a href={resume.url} download={resume.filename} className="cc-card-btn-primary">
                        Download PDF <FileDown size={12} aria-hidden />
                    </a>
                    <a href={resume.url} target="_blank" rel="noopener noreferrer" className="cc-card-btn-secondary">
                        Open in a tab
                    </a>
                </div>
            </div>
        </figure>
    )
}

export function ContactCard({ contact }: { contact: ContactResult }) {
    return (
        <figure className="cc-card">
            <div className="cc-card-head">
                <Mail size={14} aria-hidden />
                <span>Get in touch</span>
            </div>
            <div className="cc-card-body">
                <p className="cc-card-title">{contact.email}</p>
                <p className="cc-card-summary">{contact.summary}</p>
                <div className="cc-card-actions">
                    <a href={contact.mailto} className="cc-card-btn-primary">
                        Email <Mail size={12} aria-hidden />
                    </a>
                    {contact.linkedin && (
                        <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="cc-card-btn-secondary">
                            <Linkedin size={12} aria-hidden /> LinkedIn
                        </a>
                    )}
                    {contact.github && (
                        <a href={contact.github} target="_blank" rel="noopener noreferrer" className="cc-card-btn-secondary">
                            <Github size={12} aria-hidden /> GitHub
                        </a>
                    )}
                </div>
            </div>
        </figure>
    )
}

export function MeetingCard({ meeting }: { meeting: MeetingResult }) {
    return (
        <figure className="cc-card">
            <div className="cc-card-head">
                <CalendarPlus size={14} aria-hidden />
                <span>Book time</span>
            </div>
            <div className="cc-card-body">
                <p className="cc-card-title">{meeting.topic}</p>
                <p className="cc-card-summary">{meeting.summary}</p>
                <p className="cc-card-summary">
                    <Clock size={12} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> {meeting.durationMin} min ·
                    you pick the slot
                </p>
                <div className="cc-card-actions">
                    <a href={meeting.url} target="_blank" rel="noopener noreferrer" className="cc-card-btn-primary">
                        Choose a time <ExternalLink size={12} aria-hidden />
                    </a>
                </div>
            </div>
        </figure>
    )
}
