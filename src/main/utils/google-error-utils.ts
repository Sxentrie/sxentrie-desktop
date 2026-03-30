// GaxiosError removed to fix lint warning

// --- Types Mirroring Google's Structured Errors ---

export interface ErrorInfo {
  '@type': 'type.googleapis.com/google.rpc.ErrorInfo'
  reason: string
  domain?: string
  metadata?: { [key: string]: string }
}

export interface RetryInfo {
  '@type': 'type.googleapis.com/google.rpc.RetryInfo'
  retryDelay: string // e.g. "51820.638305887s"
}

export interface QuotaFailure {
  '@type': 'type.googleapis.com/google.rpc.QuotaFailure'
  violations: Array<{
    quotaId?: string
    description?: string
  }>
}

export interface GoogleApiError {
  code: number
  message: string
  details: any[]
}

export class TerminalQuotaError extends Error {
  constructor(message: string, public readonly cause: any) {
    super(message)
    this.name = 'TerminalQuotaError'
  }
}

export class RetryableQuotaError extends Error {
  constructor(message: string, public readonly cause: any, public readonly retryDelayMs?: number) {
    super(message)
    this.name = 'RetryableQuotaError'
  }
}

// --- Official Google API Error Parsing Logic ---

function sanitizeJsonString(jsonStr: string): string {
  let prev: string
  do {
    prev = jsonStr
    jsonStr = jsonStr.replace(/,(\s*),/g, ',$1')
  } while (jsonStr !== prev)
  return jsonStr
}

export function parseGoogleApiError(error: unknown): GoogleApiError | null {
  if (!error) return null

  let errorObj: any = error
  if (typeof errorObj === 'string') {
    try {
      errorObj = JSON.parse(sanitizeJsonString(errorObj))
    } catch (_) { return null }
  }

  if (Array.isArray(errorObj) && errorObj.length > 0) {
    errorObj = errorObj[0]
  }

  // Follow the CLI's "drill down" recursive parsing
  let currentError = (errorObj as any).response?.data?.error || (errorObj as any).error || errorObj

  let depth = 0
  const maxDepth = 10
  while (currentError && typeof currentError.message === 'string' && depth < maxDepth) {
    try {
      const sanitized = sanitizeJsonString(currentError.message.replace(/\u00A0/g, '').replace(/\n/g, ' '))
      const parsed = JSON.parse(sanitized)
      if (parsed.error) {
        currentError = parsed.error
        depth++
      } else break
    } catch (_) { break }
  }

  if (currentError && currentError.code && currentError.message) {
    return {
      code: currentError.code,
      message: currentError.message,
      details: Array.isArray(currentError.details) ? currentError.details : []
    }
  }

  return null
}

function parseDurationInSeconds(duration: string): number | null {
  if (duration.endsWith('ms')) {
    const ms = parseFloat(duration.slice(0, -2))
    return isNaN(ms) ? null : ms / 1000
  }
  if (duration.endsWith('s')) {
    const s = parseFloat(duration.slice(0, -1))
    return isNaN(s) ? null : s
  }
  return null
}

export function classifyGoogleError(error: unknown): unknown {
  const googleApiError = parseGoogleApiError(error)
  const status = googleApiError?.code || (error as any).status || (error as any).response?.status

  if (!googleApiError || (status !== 429 && status !== 499 && status !== 403)) {
    // Fallback: search for "Please retry in X" in plain text
    const msg = googleApiError?.message || (error instanceof Error ? error.message : String(error))
    const match = msg.match(/(?:reset after|retry in|Please retry in) ([0-9.]+(?:ms|s))/i)
    if (match?.[1]) {
      const delaySec = parseDurationInSeconds(match[1])
      if (delaySec !== null) {
        console.warn(
          `[GoogleError] Detected retryable error from message match: "${msg}". Waiting ${delaySec}s.`
        )
        return new RetryableQuotaError(msg, error, delaySec * 1000)
      }
    }
    console.error(`[GoogleError] Unclassified non-retryable error:`, error)
    return error
  }

  // Handle 403 "Service Not Used" or "Permission Denied"
  if (status === 403) {
    const isServiceNotEnabled = 
      googleApiError.message.includes('has not been used') || 
      googleApiError.message.includes('disabled') ||
      googleApiError.details.some(d => d.reason === 'SERVICE_DISABLED')

    if (isServiceNotEnabled) {
      console.warn(`[GoogleError] 403: Service not enabled for project. This usually triggers the onboarding flow.`)
      // Return a retryable error with a fixed 30s delay to allow onboarding to settle
      return new RetryableQuotaError(`Service setup required: ${googleApiError.message}`, error, 30000)
    }

    console.error(`[GoogleError] TERMINAL 403: ${googleApiError.message}`)
    return new TerminalQuotaError(googleApiError.message, error)
  }

  const retryInfo = googleApiError.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo')
  const quotaFailure = googleApiError.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure')
  const errorInfo = googleApiError.details.find(
    (d) => d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo'
  )

  // Check for daily limits (terminal)
  if (quotaFailure) {
    for (const v of quotaFailure.violations) {
      if (v.quotaId?.includes('PerDay') || v.quotaId?.includes('Daily')) {
        console.error(`[GoogleError] TERMINAL: Daily quota exhausted for project.`)
        return new TerminalQuotaError(`Daily quota exhausted: ${googleApiError.message}`, error)
      }
    }
  }

  if (errorInfo?.reason === 'QUOTA_EXHAUSTED') {
    console.error(`[GoogleError] TERMINAL: Quota Exhausted (RATE_LIMIT_EXCEEDED).`)
    return new TerminalQuotaError(googleApiError.message, error)
  }

  // Per-minute limits (retryable)
  let delayMs = 5000
  if (retryInfo?.retryDelay) {
    const parsed = parseDurationInSeconds(retryInfo.retryDelay)
    if (parsed) delayMs = parsed * 1000
  }

  return new RetryableQuotaError(googleApiError.message, error, delayMs)
}

// --- Official CLI Jitter & Backoff Implementation ---

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, delayMs: number, error: any) => void
): Promise<T> {
  const maxAttempts = 10
  const initialDelayMs = 5000
  const maxDelayMs = 30000
  
  let attempt = 0
  let currentDelay = initialDelayMs

  while (attempt < maxAttempts) {
    attempt++
    try {
      return await fn()
    } catch (error) {
      const classified = classifyGoogleError(error)
      const status = (error as any).status || (error as any).response?.status || 0

      // Only retry on 429, 499, and 5xx (official CLI list) + 403 if flagged as retryable
      const isRetryable = (status === 429 || status === 499 || status === 403 || (status >= 500 && status < 600))
      
      if (!isRetryable || attempt >= maxAttempts || classified instanceof TerminalQuotaError) {
        throw classified instanceof Error ? classified : error
      }

      let waitMs = currentDelay
      if (classified instanceof RetryableQuotaError && classified.retryDelayMs) {
        waitMs = Math.max(waitMs, classified.retryDelayMs)
        // official 20% jitter for quota
        waitMs += (waitMs * 0.2 * Math.random())
      } else {
        // official 30% bidirectional jitter for others
        const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1)
        waitMs = Math.max(0, currentDelay + jitter)
      }

      if (onRetry) onRetry(attempt, waitMs, classified)

      console.warn(
        `[Retry] Attempt ${attempt} failed. Retrying in ${Math.round(waitMs)}ms... (Status: ${status})`
      )

      await new Promise((resolve) => setTimeout(resolve, waitMs))
      currentDelay = Math.min(maxDelayMs, currentDelay * 2)
    }
  }
  console.error(
    '[Retry] CRITICAL: All 10 retry attempts exhausted. The request failed permanently.'
  )
  throw new Error('Retry attempts exhausted')
}
