import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { username, password } from './test-config.mjs'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const prompt = [
  'Act as a coding agent, not a chat-only assistant.',
  'Create a minimal Gadget named "Agent Proof" with a page that displays "2 + 2 = 4".',
  'Use your available coding tools to create the files and execute a test.',
  'Do not merely explain how; perform the tool work first, then summarize the files and test result.',
].join(' ')
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

  await page.waitForTimeout(3500)
  const composer = page.locator('textarea').first()
  await composer.waitFor({ state: 'visible', timeout: 30000 })
  await composer.fill(prompt)
  await page.screenshot({ path: resolve(screenshotDir, '15-agent-request-sent.png'), fullPage: true })
  await page.getByRole('button', { name: 'Send message' }).click()

  const thinking = page.getByText('Thinking', { exact: true })
  await thinking.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await thinking.waitFor({ state: 'hidden', timeout: 240000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: resolve(screenshotDir, '16-agent-gadget-result.png'), fullPage: true })

  const body = await page.locator('body').innerText()
  const markers = ['Running code', 'Writing', 'Creating', 'Agent Proof', '2 + 2 = 4', 'Gadget']
  console.log('AGENT_URL:', page.url())
  console.log('AGENT_MARKERS:', markers.filter(marker => body.includes(marker)).join('|'))
  console.log(body.slice(-7000))
} finally {
  await browser.close()
}
