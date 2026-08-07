import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { username, password } from './test-config.mjs'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const screenshotDir = resolve(process.cwd(), '..', 'artifacts', 'screenshots')
await mkdir(screenshotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', message => console.log(`[browser:${message.type()}] ${message.text()}`))
page.on('pageerror', error => console.log(`[browser:pageerror] ${error.message}`))

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  if (await page.getByRole('button', { name: 'Sign in' }).count()) {
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
  }
  await page.waitForTimeout(4000)
  console.log('BEFORE URL:', page.url())
  console.log((await page.locator('body').innerText()).slice(-2000))

  const composer = page.locator('textarea').first()
  await composer.waitFor({ state: 'visible', timeout: 30000 })
  await composer.fill('Reply with exactly one short sentence: what is Cloudflare OS?')
  await page.screenshot({ path: resolve(screenshotDir, '07-chat-sent.png'), fullPage: true })
  await page.getByRole('button', { name: 'Send message' }).click()

  const thinking = page.getByText('Thinking', { exact: true })
  await thinking.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await thinking.waitFor({ state: 'hidden', timeout: 120000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: resolve(screenshotDir, '07-chat-response-final.png'), fullPage: true })
  const body = await page.locator('body').innerText()
  console.log('AFTER URL:', page.url())
  console.log(body.slice(-4000))
} finally {
  await browser.close()
}
