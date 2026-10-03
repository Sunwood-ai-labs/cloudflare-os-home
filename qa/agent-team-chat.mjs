// Browser QA for the `agent-team` model: registers it in Cloudflare OS (if missing), gives it a
// small coding task and saves screenshots while the stages stream in and once the team finishes.
//
//   CFOS_USERNAME=... CFOS_PASSWORD=... LITELLM_KEY=... node agent-team-chat.mjs
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { username, password } from './test-config.mjs'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const litellmKey = process.env.LITELLM_KEY
const litellmApiUrl = process.env.LITELLM_API_URL ?? 'http://litellm:4000/v1'
if (!litellmKey) throw new Error('Set LITELLM_KEY for the browser flow.')
const team = { id: 'agent-team', name: 'Agent Team' }
const task = process.env.TEAM_TASK ??
  'word_count.py を作ってください。引数で受け取ったテキストファイルの行数・単語数・文字数を表示する CLI で、ファイルが無いときはエラーメッセージを出して終了コード 1 にしてください。unittest のテスト test_word_count.py も付けてください。'

const screenshotDir = resolve(process.cwd(), '..', 'artifacts', 'screenshots', 'agent-team')
await mkdir(screenshotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('pageerror', error => console.log(`[browser:pageerror] ${error.message}`))
const bodyText = () => page.locator('body').innerText()
const shot = name => page.screenshot({ path: resolve(screenshotDir, `${name}.png`) })

async function signIn() {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  if (!(await bodyText()).includes('Sign in to your account')) return
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForTimeout(4000)
}

async function registerTeam() {
  await page.goto(`${baseUrl}/providers`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByText('AI providers', { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1500)
  if ((await bodyText()).includes(team.name)) return console.log('provider Agent Team: already registered')
  await page.getByRole('button', { name: 'Add provider' }).first().click()
  await page.waitForTimeout(800)
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'Other OpenAI...', exact: true }).click()
  await page.getByRole('textbox', { name: 'Model ID', exact: true }).fill(team.id)
  await page.getByRole('textbox', { name: 'Display Name', exact: true }).fill(team.name)
  await page.getByRole('textbox', { name: 'API Token', exact: true }).fill(litellmKey)
  await page.getByText('Advanced Settings', { exact: true }).click()
  await page.getByRole('textbox', { name: 'API URL', exact: true }).fill(litellmApiUrl)
  await page.getByRole('button', { name: /^Add (Model|provider)$/ }).last().click()
  await page.getByText(team.name, { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1000)
  await shot('00-providers')
  console.log('provider Agent Team: registered')
}

let ok = false
try {
  await signIn()
  await registerTeam()
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const composer = page.locator('textarea[placeholder="Start a new conversation…"]')
  await composer.waitFor({ state: 'visible', timeout: 30000 })
  await page.getByRole('button', { name: 'Select model' }).click()
  await page.getByRole('menuitem', { name: team.name, exact: true }).click()
  await page.waitForTimeout(500)
  await composer.fill(task)
  await shot('01-task')
  await page.getByRole('button', { name: 'Send message' }).click()

  // Each stage heading ("… — <agent>") appears when that agent starts; grab one screenshot per
  // stage while it is working, and one when the team log table closes the reply.
  const stages = [
    { id: 'plan', marker: '— Antigravity' }, { id: 'implement', marker: '— Claude Code (GLM)' },
    { id: 'review', marker: '— Codex' }, { id: 'summary', marker: '— Hermes Agent' },
  ]
  const seen = new Set()
  const deadline = Date.now() + 20 * 60_000
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000)
    const text = await bodyText()
    for (const [index, stage] of stages.entries()) {
      if (!seen.has(stage.id) && text.includes(stage.marker)) {
        seen.add(stage.id)
        await page.waitForTimeout(1000)
        await shot(`${String(index + 2).padStart(2, '0')}-${stage.id}`)
        console.log(`stage ${stage.id} started`)
      }
    }
    // The composer switches back from "Waiting for agent…" to the follow-up box when the turn ends.
    const idle = await page.locator('textarea[placeholder="Ask a follow-up…"]').count()
    if (seen.has('summary') && idle) { ok = /チームの記録|Team log/.test(text); break }
    // A turn that ends before the summary (proxy or runner error) will not recover.
    if (idle || /\[agent-runner\]/.test(text)) { console.log(text.slice(-1500)); break }
  }
  await page.waitForTimeout(3000)
  await shot('06-done')
  await page.screenshot({ path: resolve(screenshotDir, '07-done-full.png'), fullPage: true })
  console.log(`${ok ? 'PASS' : 'FAIL'} agent-team ${page.url()}`)
} finally {
  await browser.close()
}
if (!ok) process.exit(1)
