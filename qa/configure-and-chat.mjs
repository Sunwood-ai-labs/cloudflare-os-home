import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { username, password } from './test-config.mjs'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8877'
const litellmKey = process.env.LITELLM_KEY
const modelId = process.env.LITELLM_MODEL ?? 'glm-4.7'
const modelName = `LiteLLM · ${modelId}`
if (!litellmKey) throw new Error('Set LITELLM_KEY for the browser flow.')

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
  await page.waitForTimeout(3500)
}

async function waitForBodyText(text, timeout = 30000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
}

try {
  await signIn()
  if ((await page.locator('body').innerText()).includes("Let's set you up")) {
    // Step 0: profile -> Step 1: model selection.
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(800)

    // Add a custom OpenAI-compatible model backed by the existing LiteLLM service.
    await page.getByRole('button', { name: 'Add new model...' }).click()
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Other OpenAI...', exact: true }).click()

    await page.getByRole('textbox', { name: 'Model ID', exact: true }).fill(modelId)
    await page.getByRole('textbox', { name: 'Display Name', exact: true }).fill(modelName)
    await page.getByRole('textbox', { name: 'API Token', exact: true }).fill(litellmKey)
    await page.getByText('Advanced Settings', { exact: true }).click()
    await page.getByRole('textbox', { name: 'API URL', exact: true }).fill('http://host.docker.internal:4000/v1')
    await page.screenshot({ path: resolve(screenshotDir, '04-model-form.png'), fullPage: true })

    await page.getByRole('button', { name: 'Add Model', exact: true }).click()
    await waitForBodyText(modelName, 30000)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: resolve(screenshotDir, '05-model-configured.png'), fullPage: true })

    // Select the new model as the onboarding default and finish the wizard.
    await page.getByRole('button', { name: new RegExp(modelName) }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: "Let's build" }).click()
    await waitForBodyText('What are we working on?', 30000)
  } else {
    // If this flow is rerun after onboarding, confirm the provider still exists.
    await page.goto(`${baseUrl}/providers`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForBodyText('AI providers', 30000)
  }

  await page.waitForTimeout(1500)
  await page.screenshot({ path: resolve(screenshotDir, '06-home.png'), fullPage: true })

  // Send one short smoke-test prompt through Cloudflare OS -> LiteLLM -> glm-4.7.
  const composer = page.locator('textarea[placeholder="Start a new conversation…"]')
  await composer.fill('In one short sentence, what is Cloudflare OS?')
  await page.getByRole('button', { name: 'Send message' }).click()

  const deadline = Date.now() + 120000
  let text = ''
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000)
    text = await page.locator('body').innerText()
    if (text.includes('Cloudflare OS') && !text.includes('Start a new conversation…')) break
  }
  await page.screenshot({ path: resolve(screenshotDir, '07-chat-response.png'), fullPage: true })
  console.log(`CHAT_URL: ${page.url()}`)
  console.log(text.slice(-5000))
  if (!text.includes('Cloudflare OS')) throw new Error('Expected chat response text was not found.')

  // Reload check: the authenticated UI and model-backed conversation should remain usable.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await waitForBodyText('Cloudflare OS', 30000)
  await page.screenshot({ path: resolve(screenshotDir, '08-reload.png'), fullPage: true })

  // Mobile visual pass.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: resolve(screenshotDir, '09-mobile-home.png'), fullPage: true })
  console.log('MOBILE_URL:', page.url())
} finally {
  await browser.close()
}
