# End-to-End Workflows — Rayzen AI

## 1. Memory Indexing

**Trigger:** User uploads a file or submits a URL in the Command Center.

```
User
  │  POST /memory/file  (multipart)
  ▼
MemoryController
  │  extract text → chunkText(content, 500 chars)
  ▼
MemoryService.indexDocument()
  │  1. compute SHA-256 checksum
  │  2. prisma.document.findFirst({ checksum }) → skip if identical
  │  3. POST https://api.jina.ai/v1/embeddings (model: jina-embeddings-v3)
  │     → embedding vector(1024)
  │  4. prisma.$executeRaw  INSERT ... embedding <-> '[...]'
  ▼
Response: { status: 'created' | 'updated', id, chunks }
```

**Key invariants:**
- Duplicate content detected by checksum — no redundant embeddings
- Chunks < 50 chars are discarded (noise filter in `chunkText()`)
- Each chunk stored as an independent document row for granular retrieval

---

## 2. Conversational Routing (OrchestratorService)

**Trigger:** User sends a chat message.

```
User
  │  POST /chat/message  { prompt, sessionId }
  ▼
OrchestratorService.handleMessage()
  │
  ├─ 1. ValidationService.assertValidPrompt(prompt)
  │     → BadRequestException (HTTP 400) if high-severity issue
  │
  ├─ 2. classify(prompt)
  │     → LLM call (gpt-4o-mini, temp=0, response_format: json_object)
  │     → { module: 'brain'|'jarvis'|'doc'|'content'|'system', action, confidence }
  │     → ValidationService.validateClassification(result)
  │
  ├─ 3. Load conversation history (last 20 messages from prisma)
  │
  ├─ 4. Route by module:
  │     ├─ brain    → MemoryService.searchAndSynthesize(prompt, sessionId)
  │     ├─ jarvis   → ExecutionService.dispatch(action, payload)
  │     ├─ doc      → DocumentProcessingService.generatePDF(prompt)
  │     ├─ content  → ContentEngineService.generate(prompt)
  │     └─ system   → direct LLM chat (gpt-4o, temp=0.7, with history)
  │
  ├─ 5. Save [user_message, assistant_message] to prisma (with tokensUsed)
  │
  └─ 6. extractAndIndex(prompt, reply)  ← async background indexing
         → learns from the conversation itself

Response: { reply, module, action, tokensUsed }
```

---

## 3. PC Agent Task Execution

**Trigger:** OrchestratorService routes to `jarvis` module.

```
OrchestratorService
  │  ExecutionService.dispatch('open_app', { app: 'chrome' })
  ▼
ExecutionService
  │  1. queue.add('execute', { id, module:'jarvis', action, payload, status:'pending' },
  │               { jobId: id, attempts: 3, backoff: 5000, removeOnComplete: false })
  │  2. waitForResult(jobId, timeout=30s)
  │     → polls queue.getJobs(['completed','failed']) every 2s
  ▼
Redis BullMQ queue
  │  PC Agent polls every 3s
  ▼
PC Agent (local Windows machine)
  │  1. whitelist.ts.has(action) → reject if not allowed
  │  2. executor.ts  switch(action) → specific action handler
  │  3. Update job data: { status: 'done', result: { ... } }
  ▼
ExecutionService.waitForResult() resolves
  │
OrchestratorService
  │  LLM call (gpt-4o) to narrate result in natural language
  ▼
User: "Chrome foi aberto com sucesso."
```

**Error path:** If job status = `'failed'`, `waitForResult()` rejects with the error message. After 30s with no status change, rejects with timeout error.

---

## 4. Voice Interaction

**TTS flow:**
```
User clicks speak button
  │  POST /voice/synthesize  { text }
  ▼
VoiceService.synthesize(text)
  │  1. Strip markdown (**, *, `, #, etc.)
  │  2. Truncate to 800 chars
  │  3. POST https://api.groq.com/openai/v1/audio/speech
  │     { model: playai-tts, voice: Celeste-PlayAI, input: cleanText }
  ▼
Response: audio/mpeg buffer → browser plays via Audio API
```

**STT flow:**
```
User holds microphone button → browser records audio (webm/opus)
  │  POST /voice/transcribe  (multipart audio file)
  ▼
VoiceService.transcribe(buffer, mimeType)
  │  1. Write buffer to temp file
  │  2. axios.post Groq Whisper API (model: whisper-large-v3-turbo)
  │  3. delete temp file (finally block — always runs)
  ▼
Response: { text: "transcrição do áudio" }
  → auto-submitted as chat message
```

---

## 5. Document Generation

**Trigger:** OrchestratorService routes to `doc` module (action = `generate_pdf` or `generate_docx`).

```
OrchestratorService
  │  DocumentProcessingService.generatePDF(prompt)
  ▼
DocumentProcessingService
  │  1. LLM call (gpt-4o-mini, temp=0.2) → structured HTML content
  │  2. Puppeteer.launch() → page.setContent(html)
  │  3. page.pdf({ format: 'A4', printBackground: true })
  ▼
Response: PDF buffer → sent as application/pdf download
```

For DOCX:
```
  │  1. LLM call → JSON data object matching template variables
  │  2. pizzip + docxtemplater → fill .docx template
  ▼
Response: DOCX buffer → sent as application/vnd.openxmlformats download
```
