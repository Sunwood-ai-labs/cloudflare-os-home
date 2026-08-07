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

async function signIn() {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForTimeout(4000)
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: resolve(screenshotDir, '01-login.png'), fullPage: true })

  const createLink = page.getByRole('link', { name: 'Create one' })
  if (await createLink.count()) {
    await createLink.click()
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
    await page.getByRole('textbox', { name: 'Confirm Password', exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForTimeout(4000)
  }

  const bodyText = await page.locator('body').innerText()
  if (bodyText.includes('Sign in to your account')) {
    await signIn()
  }

  await page.waitForTimeout(2500)
  await page.screenshot({ path: resolve(screenshotDir, '02-home.png'), fullPage: true })
  console.log(`URL: ${page.url()}`)
  console.log((await page.locator('body').innerText()).slice(0, 5000))
} finally {
  await browser.close()
}
