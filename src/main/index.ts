import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import * as lancedb from '@lancedb/lancedb'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { geminiService } from './services/gemini.service'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })



  // Establish an asynchronous handler for database queries
  ipcMain.handle('database:connect', async (_, storageUri: string) => {
    try {
      const database = await lancedb.connect(storageUri)
      const tableNames = await database.tableNames()
      // Return exclusively plain JavaScript arrays or objects to satisfy serialization constraints
      return tableNames
    } catch (error) {
      console.error('Vector Database Connection Failure:', error)
      return
    }
  })

  // Gemini IPC
  ipcMain.on('gemini:chat', async (event, messages: any[]) => {
    try {
      console.log(`[Main] IPC gemini:chat received ${messages.length} messages.`)

      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Invalid message history received.')
      }

      await geminiService.generateContentStream(messages, (chunk) => {
        event.reply('gemini:chunk', chunk)
      })
      event.reply('gemini:end')
    } catch (error) {
      console.error('[Main] CRITICAL: Gemini IPC Error:', error)
      event.reply('gemini:error', error instanceof Error ? error.message : String(error))
    }
  })

  await geminiService.initialize().catch((err) => {
    console.error('Failed to initialize Gemini Service on startup:', err)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
