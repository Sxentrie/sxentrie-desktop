import { execSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { arch, cpus, platform } from 'os'
import pc from 'picocolors'

const OUT_DIR = 'out'

const STEPS = [
  { label: 'ESLint', cmd: 'pnpm run -s lint' },
  { label: 'TypeScript typecheck', cmd: 'pnpm run -s typecheck' },
  { label: 'electron-vite build', cmd: 'pnpm exec electron-vite build' }
]

const run = (cmd) => {
  try {
    execSync(cmd, { stdio: 'inherit' })
  } catch {
    throw new Error(`Failed: ${cmd}`)
  }
}

const capture = (cmd) => {
  try {
    return execSync(cmd, { stdio: 'pipe' }).toString().trim()
  } catch {
    return null
  }
}

const elapsed = (start) => {
  const d = Date.now() - start
  return d < 1000 ? `${d}ms` : `${(d / 1000).toFixed(2)}s`
}

const fmtBytes = (n) => {
  if (n < 1_024) return `${n} B`
  if (n < 1_048_576) return `${(n / 1_024).toFixed(1)} kB`
  return `${(n / 1_048_576).toFixed(2)} MB`
}

const fmtMB = (n) => `${(n / 1_048_576).toFixed(1)} MB`

const kv = (key, val) => console.log(`  ${pc.gray(key.padEnd(10))} ${val}`)

const preflight = () => {
  const checks = [
    ['node_modules', 'run pnpm install first'],
    ['tsconfig.json', 'tsconfig.json missing'],
    ['electron.vite.config.ts', 'electron.vite.config.ts missing']
  ]
  const failures = checks.filter(([p]) => !existsSync(p))
  if (failures.length) {
    console.log()
    console.log(pc.red('── PREFLIGHT FAILED ───────────────────────────────'))
    failures.forEach(([, msg]) => console.error(`  ${pc.red('✗')} ${msg}`))
    console.log()
    process.exit(1)
  }
}

const fingerprint = () => {
  const branch = capture('git rev-parse --abbrev-ref HEAD')
  const sha = capture('git rev-parse --short HEAD')
  const dirty = capture('git status --porcelain')
  const gitStr =
    branch && sha
      ? `${branch} ${pc.gray('@')} ${sha}${dirty ? pc.yellow(' ✎ dirty') : pc.green(' ✓ clean')}`
      : pc.gray('not a git repo')
  const cpu = cpus()
  return {
    gitStr,
    cpuStr: `${cpu[0].model.split(' ').slice(0, 3).join(' ')} × ${cpu.length}`,
    pnpmVer: capture('pnpm --version')
  }
}

const reportArtifacts = () => {
  if (!existsSync(OUT_DIR)) {
    console.log(pc.gray(`  ${OUT_DIR}/ not found`))
    return
  }
  const files = []
  const recurse = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      entry.isDirectory()
        ? recurse(full)
        : files.push({ rel: relative(OUT_DIR, full), size: statSync(full).size })
    }
  }
  recurse(OUT_DIR)
  if (!files.length) {
    console.log(pc.gray('  no output files'))
    return
  }

  const groups = {}
  for (const f of files) {
    const top = f.rel.includes('/') ? f.rel.split('/')[0] : '.'
    ;(groups[top] ??= []).push(f)
  }

  let grandTotal = 0
  for (const [group, items] of Object.entries(groups)) {
    grandTotal += items.reduce((a, f) => a + f.size, 0)
    for (const f of items) {
      const name = f.rel.includes('/') ? f.rel.split('/').slice(1).join('/') : f.rel
      const sizeStr = fmtBytes(f.size).padStart(9)
      const colored =
        f.size > 5_000_000
          ? pc.red(sizeStr)
          : f.size > 1_000_000
            ? pc.yellow(sizeStr)
            : pc.gray(sizeStr)
      console.log(`  ${colored}  ${pc.gray(group + '/')}${name}`)
    }
  }
  console.log(`  ${pc.gray('─'.repeat(28))}`)
  console.log(`  ${fmtBytes(grandTotal).padStart(9)}  total`)
}

async function build() {
  preflight()

  const buildStart = Date.now()
  const memBefore = process.memoryUsage()
  const { gitStr, cpuStr, pnpmVer } = fingerprint()

  console.log()
  console.log(pc.cyan('── BUILD ──────────────────────────────────────────'))
  kv('node', process.version)
  kv('pnpm', pnpmVer ? `v${pnpmVer}` : pc.gray('unknown'))
  kv('platform', `${platform()} ${arch()}`)
  kv('cpu', cpuStr)
  kv('git', gitStr)
  kv('heap', `${fmtMB(memBefore.heapUsed)} / ${fmtMB(memBefore.heapTotal)}`)
  kv('started', new Date().toLocaleTimeString())

  try {
    console.log()
    console.log(pc.cyan('── STEPS ──────────────────────────────────────────'))
    for (let i = 0; i < STEPS.length; i++) {
      const { label, cmd } = STEPS[i]
      const stepStart = Date.now()
      console.log()
      console.log(`  ${pc.gray(`[${i + 1}/${STEPS.length}]`)} ${pc.white(label)}`)
      run(cmd)
      console.log(`  ${pc.green('✓')} ${pc.gray(`done in ${elapsed(stepStart)}`)}`)
    }

    const memAfter = process.memoryUsage()
    const heapDelta = memAfter.heapUsed - memBefore.heapUsed

    console.log()
    console.log(pc.cyan('── ARTIFACTS ──────────────────────────────────────'))
    reportArtifacts()

    console.log()
    console.log(pc.cyan('── SUMMARY ────────────────────────────────────────'))
    kv('duration', pc.white(elapsed(buildStart)))
    kv('heap Δ', `${heapDelta >= 0 ? '+' : ''}${fmtMB(heapDelta)}`)
    kv('heap now', `${fmtMB(memAfter.heapUsed)} / ${fmtMB(memAfter.heapTotal)}`)
    console.log()
    console.log(pc.green('  ✓ Build complete'))
    console.log()
  } catch (err) {
    console.log()
    console.log(pc.red('── FAILED ─────────────────────────────────────────'))
    console.error(`  ${pc.red('✗')} ${err.message}`)
    console.log()
    process.exit(1)
  }
}

build()
