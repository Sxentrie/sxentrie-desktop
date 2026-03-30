import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    secureApi: {
      fetchVectorTables: (storageUri: string) => Promise<string[]>
      geminiChat: (messages: Array<{ role: string; parts: Array<{ text: string }> }>) => void
      onGeminiChunk: (callback: (chunk: string) => void) => () => void
      onGeminiEnd: (callback: () => void) => () => void
      onGeminiError: (callback: (error: string) => void) => () => void
    }
  }
}
