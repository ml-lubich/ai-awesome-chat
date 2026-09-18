/**
 * ─── The single config file ────────────────────────────────────────────
 *
 * Everything site-specific lives here: who the bot is, what it knows, and
 * how it behaves. Clone the repo, edit this file, set OPENROUTER_API_KEY,
 * deploy. No other file needs to change for a new persona.
 */

export interface KnowledgeEntry {
    id: string
    title: string
    tags: string[]
    body: string
}

export interface ChatContact {
    email: string
    linkedin?: string
    github?: string
}

export interface ChatLimits {
    /** Longest a single user message may be, in characters. */
    maxMessageChars: number
    /** How many prior turns are sent back to the model as context. */
    maxHistory: number
    /** How many tool-call rounds the agent loop may run before giving up. */
    maxToolRounds: number
    /** Per-request token ceiling passed to the model. */
    maxTokens: number
}

export interface ChatRateLimit {
    /** Per-browser (signed cookie) quota. */
    cookieMax: number
    cookieWindowMs: number
    /** Per-IP floor — what cookie-clearing falls back to. */
    ipMax: number
    ipWindowMs: number
    /** Short burst guard. */
    burstMax: number
    burstWindowMs: number
    /** Whole-deployment ceiling across all visitors. */
    globalMax: number
    globalWindowMs: number
    /** Simultaneous in-flight streams allowed per IP. */
    concurrent: number
}

export interface ChatConfig {
    botName: string
    ownerName: string
    greeting: string
    starters: string[]
    knowledge: KnowledgeEntry[]
    contact?: ChatContact
    resumeUrl?: string
    bookingUrl?: string
    /** Cascade order — first model wins; a non-2xx walks to the next. */
    models: string[]
    limits: ChatLimits
    rateLimit: ChatRateLimit
    /** Free-form text appended to the generated system prompt. */
    extraRules: string
}

/** Free tiers only, walked in order until one answers. Comment shows how to
 *  add a paid backstop for durability once a free slug gets retired:
 *  models: [...FREE_MODELS, "mistralai/mistral-nemo", "openai/gpt-oss-20b"] */
const FREE_MODELS = [
    "inclusionai/ling-3.0-flash-vl:free",
    "cohere/north-mini-code:free",
    "nex-agi/nex-n2.5-mini:free",
] as const

/** Fictional default persona so a fresh clone runs and demos immediately. */
export const chatConfig: ChatConfig = {
    botName: "Ada",
    ownerName: "Ada Example",
    greeting: "I can look through Ada's roles, projects and skills — ask me anything.",
    starters: [
        "What has Ada built with distributed systems?",
        "Where has she worked?",
        "What does she know about Kubernetes?",
        "How do I get in touch?",
    ],
    knowledge: [
        {
            id: "role-nimbus",
            title: "Senior Backend Engineer, Nimbus Cloud",
            tags: ["backend", "distributed systems", "go", "kubernetes"],
            body:
                "2022–present. Leads the platform team building Nimbus Cloud's multi-region " +
                "job scheduler in Go, running on Kubernetes across three regions. Cut p99 " +
                "scheduling latency from 4s to 300ms by replacing polling with an " +
                "etcd watch-based queue.",
        },
        {
            id: "role-fernlight",
            title: "Software Engineer, Fernlight Analytics",
            tags: ["python", "data pipelines", "airflow"],
            body:
                "2019–2022. Built the ingestion pipelines that fed Fernlight's analytics " +
                "product — Airflow DAGs processing 40M events/day from Kafka into a " +
                "columnar warehouse. Owned on-call for the data platform.",
        },
        {
            id: "project-throughline",
            title: "Throughline — open-source workflow engine",
            tags: ["open source", "go", "workflow", "distributed systems"],
            body:
                "A small durable-execution engine in Go, inspired by Temporal but built for " +
                "single-binary deployments. 1.2k GitHub stars. Handles retries, timers and " +
                "compensation without an external database.",
        },
        {
            id: "project-lintling",
            title: "Lintling — a linter for config-as-code",
            tags: ["open source", "typescript", "developer tools"],
            body:
                "A CLI that lints YAML/TOML/JSON config files against a schema and flags " +
                "hardcoded values that should be config keys. Built as a side project after " +
                "one too many production incidents caused by a magic number in code.",
        },
        {
            id: "skills",
            title: "Skills",
            tags: ["skills", "go", "python", "typescript", "kubernetes", "distributed systems"],
            body:
                "Go, Python, TypeScript. Kubernetes, Terraform, PostgreSQL. Distributed " +
                "systems: consensus, durable execution, queueing. Comfortable across the " +
                "stack but happiest in the backend and infra layers.",
        },
        {
            id: "publications",
            title: "Talks and writing",
            tags: ["publications", "talks", "distributed systems"],
            body:
                "Spoke at KubeCon 2024 on 'Durable Execution Without a Database'. Writes " +
                "occasionally about distributed systems failure modes on a personal blog.",
        },
    ],
    contact: {
        email: "ada@example.com",
        linkedin: "https://www.linkedin.com/in/ada-example/",
        github: "https://github.com/ada-example",
    },
    resumeUrl: "/resume.pdf",
    bookingUrl: "https://calendar.app.google/example",
    models: [...FREE_MODELS],
    limits: {
        maxMessageChars: 1000,
        maxHistory: 12,
        maxToolRounds: 4,
        maxTokens: 1200,
    },
    rateLimit: {
        cookieMax: 12,
        cookieWindowMs: 60 * 60 * 1000,
        ipMax: 15,
        ipWindowMs: 60 * 60 * 1000,
        burstMax: 5,
        burstWindowMs: 20 * 1000,
        globalMax: 100,
        globalWindowMs: 24 * 60 * 60 * 1000,
        concurrent: 2,
    },
    extraRules: "Stay on topic: you are here to talk about Ada's work, not to be a general-purpose assistant.",
}
