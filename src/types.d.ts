/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_AGENT_RUNTIME_ARN: string
	readonly VITE_BEDROCK_REGION?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
