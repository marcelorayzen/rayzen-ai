import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from '@notionhq/client'
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
  DatabaseObjectResponse,
  PartialDatabaseObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints'

export interface NotionPage {
  id: string
  title: string
  url: string
  lastEdited: string
  properties: Record<string, unknown>
}

export interface NotionSearchResult {
  pages: NotionPage[]
  total: number
}

export interface CreatePageResult {
  id: string
  url: string
  title: string
}

type SearchResultItem = PageObjectResponse | PartialPageObjectResponse | DatabaseObjectResponse | PartialDatabaseObjectResponse | Record<string, unknown>

function extractTitle(item: SearchResultItem): string {
  if (typeof item !== 'object' || item === null || !('properties' in item)) return 'Sem título'
  const props = (item as { properties: Record<string, unknown> }).properties
  const titleProp = props['title'] ?? props['Name'] ?? Object.values(props).find((p) => (p as { type?: string })?.type === 'title')
  if (!titleProp) return 'Sem título'
  const tp = titleProp as { type?: string; title?: RichTextItemResponse[] }
  if (tp.type === 'title' && Array.isArray(tp.title)) {
    return tp.title.map((t: RichTextItemResponse) => t.plain_text).join('')
  }
  return 'Sem título'
}

function toNotionPage(item: SearchResultItem): NotionPage {
  const page = item as PageObjectResponse
  return {
    id: page.id,
    title: extractTitle(item),
    url: page.url ?? '',
    lastEdited: page.last_edited_time ?? '',
    properties: 'properties' in page ? page.properties : {},
  }
}

function markdownToNotionBlocks(markdown: string): unknown[] {
  const blocks: unknown[] = []
  for (const line of markdown.split('\n')) {
    if (!line.trim()) continue

    if (line.startsWith('## ')) {
      blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] } })
    } else if (line.startsWith('# ')) {
      blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } })
    } else if (line.startsWith('### ')) {
      blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: line.slice(4) } }] } })
    } else if (line.startsWith('- ')) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } })
    } else if (/^\d+\.\s/.test(line)) {
      blocks.push({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ type: 'text', text: { content: line.replace(/^\d+\.\s/, '') } }] } })
    } else if (line.startsWith('> ')) {
      blocks.push({ object: 'block', type: 'quote', quote: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] } })
    } else {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: line } }] } })
    }
  }
  return blocks
}

@Injectable()
export class NotionService {
  private client: Client
  private defaultDatabaseId: string

  constructor(private config: ConfigService) {
    this.client = new Client({
      auth: this.config.get<string>('NOTION_API_KEY', ''),
    })
    this.defaultDatabaseId = this.config.get<string>('NOTION_DATABASE_ID', '')
  }

  async search(query: string, limit = 10): Promise<NotionSearchResult> {
    const res = await this.client.search({
      query,
      filter: { property: 'object', value: 'page' },
      page_size: limit,
    })
    const pages = (res.results as SearchResultItem[]).map(toNotionPage)
    return { pages, total: pages.length }
  }

  async getPage(pageId: string): Promise<{ page: NotionPage; content: string }> {
    const page = await this.client.pages.retrieve({ page_id: pageId }) as PageObjectResponse

    const blocksRes = await this.client.blocks.children.list({ block_id: pageId, page_size: 100 })
    const content = blocksRes.results
      .map((b) => {
        const block = b as BlockObjectResponse
        const richText = (block as unknown as Record<string, { rich_text?: RichTextItemResponse[] }>)[block.type]?.rich_text
        if (Array.isArray(richText)) return richText.map((t: RichTextItemResponse) => t.plain_text).join('')
        return ''
      })
      .filter(Boolean)
      .join('\n')

    return { page: toNotionPage(page), content }
  }

  async createPage(opts: {
    title: string
    content: string
    parentPageId?: string
    parentDatabaseId?: string
    tags?: string[]
  }): Promise<CreatePageResult> {
    const parentId = opts.parentPageId ?? opts.parentDatabaseId ?? this.defaultDatabaseId

    if (!parentId) {
      throw new NotFoundException('parentPageId ou NOTION_DATABASE_ID necessário para criar página')
    }

    const parent = opts.parentDatabaseId || (!opts.parentPageId && this.defaultDatabaseId)
      ? { database_id: opts.parentDatabaseId ?? this.defaultDatabaseId }
      : { page_id: opts.parentPageId as string }

    const properties = {
      title: { title: [{ type: 'text' as const, text: { content: opts.title } }] },
      ...(opts.tags?.length && (opts.parentDatabaseId ?? this.defaultDatabaseId)
        ? { Tags: { multi_select: opts.tags.map((name) => ({ name })) } }
        : {}),
    }

    const blocks = markdownToNotionBlocks(opts.content)

    const res = await this.client.pages.create({
      parent,
      properties,
      children: blocks as Parameters<typeof this.client.pages.create>[0]['children'],
    }) as PageObjectResponse

    return { id: res.id, url: res.url, title: opts.title }
  }

  async appendToPage(pageId: string, content: string): Promise<{ id: string; blocksAdded: number }> {
    const blocks = markdownToNotionBlocks(content)
    await this.client.blocks.children.append({
      block_id: pageId,
      children: blocks as Parameters<typeof this.client.blocks.children.append>[0]['children'],
    })
    return { id: pageId, blocksAdded: blocks.length }
  }

  async updatePageTitle(pageId: string, title: string): Promise<{ id: string; title: string }> {
    await this.client.pages.update({
      page_id: pageId,
      properties: {
        title: { title: [{ text: { content: title } }] },
      },
    })
    return { id: pageId, title }
  }
}
