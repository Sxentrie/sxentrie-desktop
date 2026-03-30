/// <reference types="vite/client" />

// Extend the global Window interface with the specific API contract
interface Window {
  secureApi: {
    fetchVectorTables: (storageUri: string) => Promise<string[]>
  }
}
