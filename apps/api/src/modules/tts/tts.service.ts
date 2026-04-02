import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech'
const TTS_MODEL = 'canopylabs/orpheus-v1-english'
const TTS_VOICE = 'daniel'
const MAX_CHARS = 800

@Injectable()
export class TtsService {
  constructor(private config: ConfigService) {}

  async synthesize(text: string): Promise<Buffer> {
    // Remove markdown e limita tamanho
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/#+\s/g, '')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .slice(0, MAX_CHARS)

    const res = await fetch(GROQ_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.get('GROQ_API_KEY')}`,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: clean,
        voice: TTS_VOICE,
        response_format: 'wav',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`TTS falhou: ${err}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}
