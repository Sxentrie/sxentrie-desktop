import { OAuth2Client, Credentials } from 'google-auth-library'
import type StoreType from 'electron-store'
import * as crypto from 'crypto'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { app } from 'electron'
import * as readline from 'readline'
import { retryWithBackoff } from '../utils/google-error-utils'

// OAuth configuration matches the official Gemini CLI
const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com'
const OAUTH_CLIENT_SECRET = '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'
const STORAGE_KEY = 'sxentrie_oauth'

export class GeminiService {
  private client: OAuth2Client
  private store: StoreType | undefined
  private cachedProjectId: string | null = null
  private userTier: string | null = null
  private sessionId: string = crypto.randomUUID()
  private installationId?: string

  constructor() {
    this.client = new OAuth2Client(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET)
  }

  /**
   * Resets the session ID to start a fresh context trajectory.
   */
  resetSession() {
    this.sessionId = crypto.randomUUID()
    console.log(`[GeminiService] Session reset. New ID: ${this.sessionId}`)
  }

  async initialize() {
    try {
      const StoreModule = await import('electron-store')
      const StoreClass =
        typeof StoreModule.default === 'function' ? StoreModule.default : (StoreModule as any)
      this.store = new StoreClass()

      // Auto-persist refreshed tokens
      this.client.on('tokens', (tokens: Credentials) => {
        if (!this.store) return
        const existing = this.store.get(STORAGE_KEY) as Credentials | undefined
        const updated = { ...existing, ...tokens }
        this.store.set(STORAGE_KEY, updated)
        console.log('[GeminiService] Tokens auto-persisted to store.')
      })

      // 1. Try to auto-import from ~/.gemini/oauth_creds.json first (source of truth)
      await this.autoImportCredentials()

      // 2. Fallback to store if import didn't happen
      const currentCreds = this.client.credentials
      if (!currentCreds.access_token && this.store) {
        const stored = this.store.get(STORAGE_KEY) as Credentials | undefined
        if (stored) {
          this.client.setCredentials(stored)
          console.log('[GeminiService] Initialized from local store.')
        }
      }

      // Persistence for Installation ID mirroring the CLI's logic
      if (this.store) {
        this.installationId = this.store.get('installationId') as string
        if (!this.installationId) {
          this.installationId = crypto.randomUUID()
          this.store.set('installationId', this.installationId)
        }
      }
    } catch (error) {
      console.error('[GeminiService] Initialization failed:', error)
    }
  }

  /**
   * Robustly sync credentials from the official Gemini CLI's output file.
   */
  private async autoImportCredentials() {
    const credPath = join(app.getPath('home'), '.gemini', 'oauth_creds.json')
    if (!existsSync(credPath)) return

    try {
      const fileContent = readFileSync(credPath, 'utf8')
      const fileCreds = JSON.parse(fileContent) as Credentials

      if (!fileCreds.access_token || !fileCreds.refresh_token) return

      if (!this.store) return
      const stored = this.store.get(STORAGE_KEY) as Credentials | undefined
      let shouldImport = !stored

      if (stored) {
        // Import if the file has a different refresh token or is newer
        if (stored.refresh_token !== fileCreds.refresh_token) {
          shouldImport = true
        } else if ((fileCreds.expiry_date || 0) > (stored.expiry_date || 0)) {
          shouldImport = true
        }
      }

      if (shouldImport) {
        console.log('[GeminiService] Importing fresh credentials from oauth_creds.json')
        this.client.setCredentials(fileCreds)
        this.store?.set(STORAGE_KEY, fileCreds)
      }
    } catch (e) {
      console.warn('[GeminiService] autoImportCredentials failed:', e)
    }
  }

  async getProjectId() {
    if (this.cachedProjectId) return this.cachedProjectId

    console.log('[GeminiService] Loading Cloud Code Assist configuration...')
    const res = await this.client.request<{
      cloudaicompanionProject?: string
      currentTier?: { id?: string; hasOnboardedPreviously?: boolean }
      paidTier?: { id?: string }
      allowedTiers?: Array<{ id: string }>
    }>({
      url: 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: {
          ideType: 'IDE_UNSPECIFIED',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI'
        }
      }),
      responseType: 'json'
    })

    let projectId = res.data.cloudaicompanionProject
    const currentTier = res.data.currentTier
    this.userTier = res.data.paidTier?.id || res.data.currentTier?.id || 'free-tier'

    // If no project assigned or hasn't onboarded previously, we must onboard
    if (!projectId || (currentTier && !currentTier.hasOnboardedPreviously)) {
      console.log('[GeminiService] Onboarding required. Starting setup...')
      const tierId = res.data.allowedTiers?.[0]?.id || 'free-tier'

      let lro = await this.onboardUser(tierId, projectId || undefined)

      if (lro.name && !lro.done) {
        console.log(`[GeminiService] Operation ${lro.name} pending. Polling...`)
        while (!lro.done) {
          await new Promise((resolve) => setTimeout(resolve, 5000))
          lro = await this.getOperation(lro.name)
        }
      }

      projectId = lro.response?.cloudaicompanionProject?.id || projectId
      console.log('[GeminiService] Onboarding complete.')
    }

    if (!projectId) {
      throw new Error('Project ID not found even after onboarding.')
    }

    this.cachedProjectId = projectId
    return this.cachedProjectId
  }

  private async onboardUser(tierId: string, projectId?: string) {
    const res = await this.client.request<any>({
      url: 'https://cloudcode-pa.googleapis.com/v1internal:onboardUser',
      method: 'POST',
      body: JSON.stringify({
        tierId,
        cloudaicompanionProject: projectId,
        metadata: {
          ideType: 'IDE_UNSPECIFIED',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
          duetProject: projectId
        }
      })
    })
    return res.data
  }

  private async getOperation(name: string) {
    const res = await this.client.request<any>({
      url: `https://cloudcode-pa.googleapis.com/v1internal/${name}`,
      method: 'GET'
    })
    return res.data
  }

  async generateContentStream(
    messages: Array<{ role: string; parts: { text: string }[] }>,
    onChunk: (chunk: string) => void
  ) {
    const projectId = await this.getProjectId()
    const url = 'https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent'

    // Official IDE User-Agent and Platform Headers mirror the "Fast Lane" routing
    const version = '0.36.0'
    const osType =
      process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'
    const userAgent = `Gemini-CLI/${version} (aidev_client; os_type=${osType}; os_version=${process.version}; arch=${process.arch}; proxy_client=geminicli) google-api-nodejs-client/10.6.2`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
      'x-goog-api-client': 'gemini-cli', // Matching official CLI for Pro quota access
      // NO x-goog-user-project for managed projects!
      'x-gemini-api-privileged-user-id': this.installationId || ''
    }

    const userPromptId = crypto.randomUUID()
    const requestBody = {
      model: 'gemini-3-flash-preview',
      project: projectId,
      request: {
        contents: messages.map((m) => ({
          ...m,
          role: m.role === 'assistant' ? 'model' : m.role
        })),
        session_id: this.sessionId, // Stable Trajectory ID for Context Caching
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          topK: 64
        }
      }
    }

    // Automatically enable Google One AI credits if user has a Pro/Paid tier
    if (this.userTier && this.userTier !== 'free-tier') {
      ;(requestBody as any).enabled_credit_types = ['GOOGLE_ONE_AI']
    }

    console.log(
      `[GeminiService] Starting request sequence. Prompt ID: ${userPromptId} (Session: ${this.sessionId}, Tier: ${this.userTier})`
    )

    // Use the official-grade retryWithBackoff wrapper
    await retryWithBackoff(
      async () => {
        console.log(`[GeminiService] Connecting to Cloud Code API... (${userPromptId})`)
        const res = await this.client.request<NodeJS.ReadableStream>({
          url,
          method: 'POST',
          params: { alt: 'sse' },
          headers,
          body: JSON.stringify({ ...requestBody, user_prompt_id: userPromptId }),
          responseType: 'stream'
        })

        console.log(
          `[GeminiService] Connection established for ${userPromptId}. Consuming stream...`
        )

        const rl = readline.createInterface({
          input: res.data,
          terminal: false
        })

        for await (const line of rl) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (jsonStr === '[DONE]' || jsonStr === '') continue

            try {
              if (!jsonStr.startsWith('{')) continue
              const json = JSON.parse(jsonStr)
              const parts =
                json.response?.candidates?.[0]?.content?.parts ||
                json.candidates?.[0]?.content?.parts ||
                []

              for (const part of parts) {
                if (part.text) {
                  onChunk(part.text)
                }
              }
            } catch (e) {
              console.error(`[GeminiService] Failed to parse stream chunk:`, e)
            }
          }
        }
      },
      (attempt, delayMs, error) => {
        // Surface retry status to the UI exactly like the CLI handles it
        const waitSecs = Math.round(delayMs / 1000)
        console.warn(
          `[GeminiService] RETRY REQUIRED (${attempt}/10). Status: ${error.status || 'unknown'}. Waiting ${waitSecs}s. Error: ${error.message}`
        )
        onChunk(
          `\n\n> ⏳ **Rate Limit (${error.status || 429}):** AI capacity exhausted. Auto-retrying in ${waitSecs}s (Attempt ${attempt}/10)...\n\n`
        )
      }
    )
  }
}

export const geminiService = new GeminiService()
