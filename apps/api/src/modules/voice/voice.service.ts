import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { writeFileSync, unlinkSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import axios from 'axios'
import FormData from 'form-data'

const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech'
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const TTS_MODEL = 'canopylabs/orpheus-v1-english'
const TTS_VOICE = 'daniel'
const MAX_CHARS = 800

@Injectable()
export class VoiceService {
  constructor(private config: ConfigService) {}

  async synthesize(text: string): Promise<Buffer> {
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

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'wav'
    const tmpPath = join(tmpdir(), `stt_${randomUUID()}.${ext}`)
    writeFileSync(tmpPath, audioBuffer)

    try {
      const form = new FormData()
      form.append('file', readFileSync(tmpPath), { filename: `audio.${ext}`, contentType: mimeType })
      form.append('model', 'whisper-large-v3-turbo')
      form.append('language', 'pt')
      form.append('response_format', 'json')

      const res = await axios.post(GROQ_STT_URL, form, {
        headers: {
          Authorization: `Bearer ${this.config.get('GROQ_API_KEY')}`,
          ...form.getHeaders(),
        },
      })

      return (res.data as { text: string }).text.trim()
    } finally {
      unlinkSync(tmpPath)
    }
  }
}
