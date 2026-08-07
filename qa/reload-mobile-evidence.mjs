import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { username, password } from './test-config.mjs'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const workspaceUrl = process.env.WORKSPACE_URL
if (!workspaceUrl) throw new Error('Set WORKSPACE_URL to the workspace URL before running this script.')
const prompt = 'Reply with exactly one short sentence: what is Cloudflare OS?'
const screenshotDir = resolve(process.cwd(), '..', 'artifacts', 'screenshots')
await mkdir(screenshotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', message => console.log(`[browser:${message.type()}] ${message.text()}`))
page.on('pageerror', error => console.log(`[browser:pageerror] ${error.message}`))

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)
  const signInButton = page.getByRole('button', { name: 'Sign in' })
  if (await signInButton.isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
    await signInButton.click()
    await page.getByText('What are we working on?', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  }

  await page.goto(workspaceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByText(prompt, { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(screenshotDir, '08-reload.png'), fullPage: true })
  console.log('RELOAD_OK')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByText('What are we working on?', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(screenshotDir, '09-mobile-home.png'), fullPage: true })
  console.log('MOBILE_OK')
} finally {
  await browser.close()
}
