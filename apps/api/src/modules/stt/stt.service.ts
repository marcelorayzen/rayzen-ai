import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { writeFileSync, unlinkSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import axios from 'axios'
import FormData from 'form-data'

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

@Injectable()
export class SttService {
  constructor(private config: ConfigService) {}

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
