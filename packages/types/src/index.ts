// Task types (shared entre API e Agent)
export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed'
export type TaskModule = 'jarvis' | 'content' | 'doc' | 'brain' | 'system'

export interface Task {
  id: string
  module: TaskModule
  action: string
  payload: Record<string, unknown>
  status: TaskStatus
  result?: unknown
  error?: string
  createdAt: string
  updatedAt: string
}

export interface TaskCreateDto {
  module: TaskModule
  action: string
  payload: Record<string, unknown>
}

// Agent types
export interface AgentCapability {
  action: string
  description: string
  requiresConfirmation: boolean
  allowedPaths?: string[]
}

// Brain types
export interface Document {
  id: string
  sourcePath: string
  content: string
  metadata: Record<string, unknown>
  checksum: string
  createdAt: string
  updatedAt: string
}

export interface SearchResult {
  document: Document
  score: number
  excerpt: string
}

// LLM types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  stream?: boolean
}
