import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('secureApi', {
      fetchVectorTables: (storageUri: string) => {
        return ipcRenderer.invoke('database:connect', storageUri)
      },
      geminiChat: (messages: any[]) => ipcRenderer.send('gemini:chat', messages),
      onGeminiChunk: (callback: (chunk: string) => void) => {
        const listener = (_event, chunk: string) => callback(chunk)
        ipcRenderer.on('gemini:chunk', listener)
        return () => ipcRenderer.removeListener('gemini:chunk', listener)
      },
      onGeminiEnd: (callback: () => void) => {
        const listener = () => callback()
        ipcRenderer.on('gemini:end', listener)
        return () => ipcRenderer.removeListener('gemini:end', listener)
      },
      onGeminiError: (callback: (error: string) => void) => {
        const listener = (_event, error: string) => callback(error)
        ipcRenderer.on('gemini:error', listener)
        return () => ipcRenderer.removeListener('gemini:error', listener)
      }
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.secureApi = {
    fetchVectorTables: (storageUri: string) => {
      return ipcRenderer.invoke('database:connect', storageUri)
    },
    geminiChat: (prompt: string) => ipcRenderer.send('gemini:chat', prompt),
    onGeminiChunk: (callback: (chunk: string) => void) => {
      const listener = (_event, chunk: string) => callback(chunk)
      ipcRenderer.on('gemini:chunk', listener)
      return () => ipcRenderer.removeListener('gemini:chunk', listener)
    },
    onGeminiEnd: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('gemini:end', listener)
      return () => ipcRenderer.removeListener('gemini:end', listener)
    },
    onGeminiError: (callback: (error: string) => void) => {
      const listener = (_event, error: string) => callback(error)
      ipcRenderer.on('gemini:error', listener)
      return () => ipcRenderer.removeListener('gemini:error', listener)
    }
  }
}
