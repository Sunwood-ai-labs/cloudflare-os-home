import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { username, password } from './test-config.mjs'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const screenshotDir = resolve(process.cwd(), '..', 'artifacts', 'screenshots')
const smokeText = 'LITELLM_OK'
await mkdir(screenshotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', message => console.log(`[browser:${message.type()}] ${message.text()}`))
page.on('pageerror', error => console.log(`[browser:pageerror] ${error.message}`))
page.on('requestfailed', request => console.log(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`))

async function signInIfNeeded() {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)
  const signInButton = page.getByRole('button', { name: 'Sign in' })
  if (await signInButton.isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
    await signInButton.click()
    await page.getByText('What are we working on?', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  }
}

try {
  await signInIfNeeded()
  await page.getByText('What are we working on?', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.getByText('LiteLLM · glm-4.7', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(screenshotDir, '06-home.png'), fullPage: true })

  const composer = page.locator('textarea[placeholder="Start a new conversation…"]')
  await composer.fill(`Reply with exactly: ${smokeText}`)
  await page.getByRole('button', { name: 'Send message' }).click()
  const response = page.getByText(smokeText, { exact: true })
  await response.waitFor({ state: 'visible', timeout: 120000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(screenshotDir, '07-chat-response.png'), fullPage: true })
  console.log('RESPONSE_URL:', page.url())
  console.log((await page.locator('body').innerText()).slice(-1600))

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await response.waitFor({ state: 'visible', timeout: 30000 })
  await page.screenshot({ path: resolve(screenshotDir, '08-reload.png'), fullPage: true })
  console.log('RELOAD_OK')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByText('What are we working on?', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.screenshot({ path: resolve(screenshotDir, '09-mobile-home.png'), fullPage: true })
  console.log('MOBILE_OK')
} finally {
  await browser.close()
}
