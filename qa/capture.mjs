import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const screenshotDir = resolve(process.cwd(), '..', 'artifacts', 'screenshots')
await mkdir(screenshotDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
page.on('console', message => console.log(`[browser:${message.type()}] ${message.text()}`))
page.on('pageerror', error => console.log(`[browser:pageerror] ${error.message}`))

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: resolve(screenshotDir, '01-login.png'), fullPage: true })
  console.log(`URL: ${page.url()}`)
  console.log(`TITLE: ${await page.title()}`)
  console.log((await page.locator('body').innerText()).slice(0, 3000))
} finally {
  await browser.close()
}
