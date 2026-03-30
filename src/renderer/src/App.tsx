import { ChatContainer } from './components/Chat/ChatContainer'

function App(): React.JSX.Element {
  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-900">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center px-6 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center shadow-lg shadow-blue-200">
            <span className="text-white font-bold text-lg leading-none">S</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Sxentrie</h1>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider ml-1">Alpha</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        <ChatContainer />
      </main>
    </div>
  )
}

export default App
