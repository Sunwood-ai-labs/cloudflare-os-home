import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { username, password } from './test-config.mjs'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const litellmKey = process.env.LITELLM_KEY
const modelId = 'glm-4.7'
const modelName = 'LiteLLM · glm-4.7'
if (!litellmKey) throw new Error('Set LITELLM_KEY for the browser flow.')

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
  await page.goto(`${baseUrl}/providers`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.getByText('AI providers', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.getByRole('button', { name: /Add provider|Add your first provider/ }).click()
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Other OpenAI...', exact: true }).click()
  await page.getByRole('textbox', { name: 'Model ID', exact: true }).fill(modelId)
  await page.getByRole('textbox', { name: 'Display Name', exact: true }).fill(modelName)
  await page.getByRole('textbox', { name: 'API Token', exact: true }).fill(litellmKey)
  await page.getByText('Advanced Settings', { exact: true }).click()
  await page.getByRole('textbox', { name: 'API URL', exact: true }).fill('http://litellm:4000/v1')
  await page.screenshot({ path: resolve(screenshotDir, '10-network-model-form.png'), fullPage: true })
  await page.getByRole('button', { name: 'Add Model', exact: true }).click()
  await page.getByText('AI model added successfully', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: resolve(screenshotDir, '11-network-model-configured.png'), fullPage: true })
  console.log('UPDATED_NETWORK_MODEL')
} finally {
  await browser.close()
}
