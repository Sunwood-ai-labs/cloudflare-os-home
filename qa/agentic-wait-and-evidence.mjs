import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { username, password } from './test-config.mjs'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const workspaceUrl = process.env.WORKSPACE_URL
if (!workspaceUrl) throw new Error('Set WORKSPACE_URL to the agent workspace URL before running this script.')
const screenshotDir = resolve(process.cwd(), '..', 'artifacts', 'screenshots')
await mkdir(screenshotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', message => console.log(`[browser:${message.type()}] ${message.text()}`))
page.on('pageerror', error => console.log(`[browser:pageerror] ${error.message}`))

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const signIn = page.getByRole('button', { name: 'Sign in' })
  await signIn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  if (await signIn.isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
    await signIn.click()
  }
  await page.waitForTimeout(2500)
  await page.goto(workspaceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const waiting = page.getByText('Waiting for agent...', { exact: true })
  if (await waiting.isVisible().catch(() => false)) {
    console.log('AGENT_WAS_STILL_RUNNING=1')
    await waiting.waitFor({ state: 'hidden', timeout: 300000 })
  }
  await page.waitForTimeout(2500)
  await page.screenshot({ path: resolve(screenshotDir, '17-agent-gadget-complete.png'), fullPage: true })
  const body = await page.locator('body').innerText()
  const markers = ['Running code', 'Writing', 'Creating', 'Agent Proof', '2 + 2 = 4', 'No gadget UI yet', 'Waiting for agent...']
  console.log('AGENT_COMPLETE_URL:', page.url())
  console.log('AGENT_MARKERS:', markers.filter(marker => body.includes(marker)).join('|'))
  console.log(body.slice(-9000))
} finally {
  await browser.close()
}
