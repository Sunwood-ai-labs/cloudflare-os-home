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
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForTimeout(3500)

  if ((await page.locator('body').innerText()).includes("Let's set you up")) {
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Add new model...' }).click()
    await page.waitForTimeout(500)
  }

  await page.screenshot({ path: resolve(screenshotDir, '03-model-modal.png'), fullPage: true })
  console.log(`URL: ${page.url()}`)
  console.log((await page.locator('body').innerText()).slice(0, 6000))
  console.log('COMBOBOXES:', await page.getByRole('combobox').count())
  console.log('BUTTONS:', await page.getByRole('button').allTextContents())
  await page.getByRole('combobox').click()
  await page.waitForTimeout(300)
  console.log('OPTIONS:', await page.getByRole('option').allTextContents())
  console.log('MENU TEXT:', (await page.locator('body').innerText()).slice(-3000))
} finally {
  await browser.close()
}
