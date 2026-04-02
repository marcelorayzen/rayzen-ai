import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { createHash } from 'crypto'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

export interface IndexResult {
  id: string
  status: 'created' | 'updated'
}

export interface SearchResult {
  id: string
  content: string
  sourcePath: string | null
  metadata: Record<string, unknown>
  score: number
}

export interface SearchSynthesis {
  answer: string
  sources: SearchResult[]
  tokensUsed: number
}

@Injectable()
export class BrainService {
  private prisma: PrismaClient

  constructor(private config: ConfigService) {
    this.prisma = new PrismaClient()
  }

  private async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.get('JINA_API_KEY')}`,
      },
      body: JSON.stringify({ model: 'jina-embeddings-v3', input: [text], dimensions: 1024 }),
    })
    const data = await res.json() as { data: Array<{ embedding: number[] }> }
    return data.data[0].embedding
  }

  async indexDocument(content: string, sourcePath?: string, metadata?: Record<string, unknown>): Promise<IndexResult> {
    const checksum = createHash('sha256').update(content).digest('hex')

    // Gera embedding via Jina
    const vector = await this.embed(content)

    // Verifica se já existe pelo checksum
    const existing = await this.prisma.document.findFirst({ where: { checksum } })

    if (existing) {
      await this.prisma.$executeRaw`
        UPDATE documents
        SET embedding = ${JSON.stringify(vector)}::vector,
            updated_at = NOW()
        WHERE id = ${existing.id}
      `
      return { id: existing.id, status: 'updated' }
    }

    // Insere novo documento com embedding via raw query (pgvector)
    const id = crypto.randomUUID()
    await this.prisma.$executeRaw`
      INSERT INTO documents (id, source_path, content, embedding, metadata, checksum, created_at, updated_at)
      VALUES (
        ${id},
        ${sourcePath ?? null},
        ${content},
        ${JSON.stringify(vector)}::vector,
        ${JSON.stringify(metadata ?? {})}::jsonb,
        ${checksum},
        NOW(),
        NOW()
      )
    `
    return { id, status: 'created' }
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    // Gera embedding da query via Jina
    const vector = await this.embed(query)

    // Busca por similaridade com pgvector
    const results = await this.prisma.$queryRaw<Array<{
      id: string
      content: string
      source_path: string | null
      metadata: Record<string, unknown>
      score: number
    }>>`
      SELECT id, content, source_path, metadata,
             1 - (embedding <=> ${JSON.stringify(vector)}::vector) AS score
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(vector)}::vector
      LIMIT ${limit}
    `

    return results.map((r) => ({
      id: r.id,
      content: r.content,
      sourcePath: r.source_path,
      metadata: r.metadata as Record<string, unknown>,
      score: Number(r.score),
    }))
  }

  async searchAndSynthesize(query: string, sessionId: string): Promise<SearchSynthesis> {
    const sources = await this.search(query)

    if (sources.length === 0) {
      return {
        answer: 'Não encontrei documentos relevantes na sua base de conhecimento. Você pode indexar novos documentos enviando o conteúdo.',
        sources: [],
        tokensUsed: 0,
      }
    }

    const context = sources
      .map((s, i) => `[${i + 1}] ${s.sourcePath ? `(${s.sourcePath}) ` : ''}${s.content.slice(0, 500)}`)
      .join('\n\n')

    const llm = new OpenAI({
      baseURL: this.config.get('LITELLM_BASE_URL', 'http://localhost:4000/v1'),
      apiKey: this.config.get('LITELLM_MASTER_KEY'),
    })

    const res = await llm.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é Rayzen, um assistente com acesso à base de conhecimento pessoal do usuário.
Com base nos documentos encontrados, responda a pergunta de forma clara e direta.
Se a informação não estiver nos documentos, diga isso honestamente.
Língua: português brasileiro.`,
        },
        {
          role: 'user',
          content: `Pergunta: ${query}\n\nDocumentos encontrados:\n${context}`,
        },
      ],
      temperature: 0.3,
    })

    const answer = res.choices[0].message.content ?? ''
    const tokensUsed = res.usage?.total_tokens ?? 0

    // Salva no histórico
    await this.prisma.conversationMessage.createMany({
      data: [
        { sessionId, module: 'brain', role: 'user', content: query },
        { sessionId, module: 'brain', role: 'assistant', content: answer, tokensUsed },
      ],
    })

    return { answer, sources, tokensUsed }
  }

  async listDocuments() {
    return this.prisma.document.findMany({
      select: { id: true, sourcePath: true, checksum: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async deleteDocument(id: string) {
    await this.prisma.document.delete({ where: { id } })
    return { deleted: true }
  }

  private chunkText(text: string, maxChars = 800): string[] {
    const chunks: string[] = []
    const paragraphs = text.split(/\n\n+/)
    let current = ''
    for (const para of paragraphs) {
      if (current.length + para.length > maxChars && current) {
        chunks.push(current.trim())
        current = para
      } else {
        current += (current ? '\n\n' : '') + para
      }
    }
    if (current.trim()) chunks.push(current.trim())
    return chunks.filter((c) => c.length > 50)
  }

  async indexGithub(username: string, token?: string): Promise<{ indexed: number; repos: number }> {
    const headers: Record<string, string> = { 'User-Agent': 'rayzen-ai' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const reposRes = await fetch(
      `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`,
      { headers },
    )
    const repos = await reposRes.json() as Array<{
      name: string
      description: string | null
      full_name: string
    }>

    let indexed = 0
    for (const repo of repos) {
      // Indexa descrição do repo
      const desc = `Repositório GitHub: ${repo.name}${repo.description ? ` — ${repo.description}` : ''}`
      await this.indexDocument(desc, `github/${repo.full_name}`, { type: 'repo' })

      // Indexa README em chunks
      try {
        const readmeRes = await fetch(
          `https://api.github.com/repos/${repo.full_name}/readme`,
          { headers },
        )
        if (readmeRes.ok) {
          const readmeData = await readmeRes.json() as { content: string }
          const text = Buffer.from(readmeData.content, 'base64').toString('utf-8')
          const chunks = this.chunkText(text)
          for (const chunk of chunks) {
            await this.indexDocument(chunk, `github/${repo.full_name}/README`, { type: 'readme', repo: repo.full_name })
            indexed++
          }
        }
      } catch { /* sem README, ok */ }

      indexed++
    }

    return { indexed, repos: repos.length }
  }

  async indexFile(buffer: Buffer, filename: string, sourcePath?: string): Promise<{ indexed: number }> {
    let text = ''

    if (filename.endsWith('.pdf')) {
      const parsed = await pdfParse(buffer)
      text = parsed.text
    } else {
      text = buffer.toString('utf-8')
    }

    const chunks = this.chunkText(text)
    const path = sourcePath ?? `file/${filename}`

    for (const chunk of chunks) {
      await this.indexDocument(chunk, path, { type: 'file', filename })
    }

    return { indexed: chunks.length }
  }

  async indexUrl(url: string): Promise<{ indexed: number }> {
    const res = await fetch(url, { headers: { 'User-Agent': 'rayzen-ai' } })
    const html = await res.text()

    // Remove tags HTML, scripts, styles
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, '\n')
      .trim()

    const chunks = this.chunkText(text)
    const domain = new URL(url).hostname

    for (const chunk of chunks) {
      await this.indexDocument(chunk, `url/${domain}`, { type: 'url', url })
    }

    return { indexed: chunks.length }
  }
}
