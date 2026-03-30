import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    secureApi: {
      fetchVectorTables: (storageUri: string) => Promise<string[]>
      geminiChat: (prompt: string) => void
      onGeminiChunk: (callback: (chunk: string) => void) => () => void
      onGeminiEnd: (callback: () => void) => () => void
      onGeminiError: (callback: (error: string) => void) => () => void
    }
  }
}
