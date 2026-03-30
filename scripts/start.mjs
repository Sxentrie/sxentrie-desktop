import { execSync, spawn } from 'child_process'
import { existsSync, createWriteStream, mkdirSync } from 'fs'
import { arch, cpus, platform } from 'os'
import pc from 'picocolors'

const isWin = platform() === 'win32'
const LOG_DIR = '.logs'
const LOG_FILE = `${LOG_DIR}/preview.log`

// Prevents both the signal handler and the child exit handler from racing
// each other to call process.exit() when a SIGINT arrives during a non-zero exit.
let isExiting = false

const capture = (cmd) => {
  try {
    return execSync(cmd, { stdio: 'pipe' }).toString().trim()
  } catch {
    return null
  }
}

const fmtMB = (n) => `${(n / 1_048_576).toFixed(1)} MB`

const kv = (key, val) => console.log(`  ${pc.gray(key.padEnd(10))} ${val}`)

const preflight = () => {
  if (!existsSync('node_modules')) {
    console.log(pc.red('\n  ✗ node_modules not found — run pnpm install first\n'))
    process.exit(1)
  }
  if (!existsSync('out')) {
    console.log(pc.red('\n  ✗ out/ not found — run pnpm build first before starting preview\n'))
    process.exit(1)
  }
  if (!existsSync(LOG_DIR)) {
    try {
      mkdirSync(LOG_DIR, { recursive: true })
    } catch (err) {
      console.error(pc.red(`\n  ✗ Could not create log directory "${LOG_DIR}": ${err.message}\n`))
      process.exit(1)
    }
  }
}

const fingerprint = () => {
  const branch = capture('git rev-parse --abbrev-ref HEAD')
  const sha = capture('git rev-parse --short HEAD')

  const dirtyOutput = capture('git status --porcelain')
  let cleanBadge
  if (dirtyOutput === null) {
    cleanBadge = pc.gray(' ? unknown')
  } else if (dirtyOutput === '') {
    cleanBadge = pc.green(' ✓ clean')
  } else {
    cleanBadge = pc.yellow(' ✎ dirty')
  }

  const gitStr =
    branch && sha ? `${branch} ${pc.gray('@')} ${sha}${cleanBadge}` : pc.gray('not a git repo')

  const cpu = cpus()
  const cpuModel =
    cpu.length > 0 && cpu[0].model ? cpu[0].model.split(' ').slice(0, 3).join(' ') : null
  const cpuStr = cpuModel ? `${cpuModel} × ${cpu.length}` : pc.gray('unknown')

  return {
    gitStr,
    cpuStr,
    pnpmVer: capture('pnpm --version')
  }
}

const noisePatterns = ['Autofill.enable', 'Autofill.setAddresses', 'Autofill version found']

const filterAndLog = (data, logStream) => {
  const lines = data.toString().split(/\r?\n/)
  for (const line of lines) {
    if (line.trim() === '') continue

    logStream.write(`${new Date().toISOString()} | ${line}\n`)

    const isNoise = noisePatterns.some((p) => line.includes(p))
    if (!isNoise) {
      process.stdout.write(`${line}\n`)
    }
  }
}

preflight()

const { gitStr, cpuStr, pnpmVer } = fingerprint()
const mem = process.memoryUsage()
const sessionStart = Date.now()
const logStream = createWriteStream(LOG_FILE, { flags: 'a' })

logStream.on('error', (err) => {
  process.stderr.write(pc.yellow(`\n  ⚠ Log stream error — logging suspended: ${err.message}\n\n`))
})

console.log()
console.log(pc.cyan('── PREVIEW ────────────────────────────────────────'))
kv('node', process.version)
kv('pnpm', pnpmVer ? `v${pnpmVer}` : pc.gray('unknown'))
kv('platform', `${platform()} ${arch()}`)
kv('cpu', cpuStr)
kv('git', gitStr)
kv('heap', `${fmtMB(mem.heapUsed)} / ${fmtMB(mem.heapTotal)}`)
kv('started', new Date().toLocaleTimeString())
kv('raw log', pc.gray(LOG_FILE))
console.log()
console.log(pc.cyan('── OUTPUT ─────────────────────────────────────────'))
console.log()

const child = spawn('pnpm exec electron-vite preview', {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true
})

child.on('error', (err) => {
  console.log()
  console.error(pc.red(`  ✗ Failed to start electron-vite: ${err.message}`))
  console.log()
  process.exit(1)
})

child.stdout.on('data', (data) => filterAndLog(data, logStream))
child.stderr.on('data', (data) => filterAndLog(data, logStream))

const exit = (signal) => {
  if (isExiting) return
  isExiting = true

  if (isWin && child.pid) {
    spawn('taskkill', ['/F', '/T', '/PID', child.pid], { stdio: 'ignore' })
  } else {
    child.kill(signal)
  }

  const duration = Math.floor((Date.now() - sessionStart) / 1000)
  const mins = Math.floor(duration / 60)
  const secs = duration % 60
  const elapsed = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  console.log()
  console.log(pc.cyan('── SESSION ENDED ──────────────────────────────────'))
  kv('duration', elapsed)
  console.log()
  process.exit(0)
}

process.on('SIGINT', () => exit('SIGINT'))
process.on('SIGTERM', () => exit('SIGTERM'))

child.on('exit', (code) => {
  if (isExiting) return
  if (code !== 0 && code !== null) {
    isExiting = true
    console.log()
    console.error(pc.red(`  ✗ electron-vite exited with code ${code}`))
    console.log()
    process.exit(code)
  }
})
