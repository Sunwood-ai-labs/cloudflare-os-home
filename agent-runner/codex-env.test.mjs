import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { buildCodexEnv, buildCodexShellEnvArgs } from './codex-env.mjs'

const bridge = { endpoint: 'http://127.0.0.1:4100/mcp/fixture', token: 'fixture-bridge-token' }
const canary = 'CFOS_AMBIENT_SECRET_CANARY'
const secrets = Object.fromEntries([
  'LITELLM_MASTER_KEY', 'AGENT_RUNNER_TOKEN', 'ZAI_API_KEY', 'NVIDIA_API_KEY',
  'GEMINI_API_KEY', 'OPENAI_API_KEY', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'INNOCENT_NAME', 'litellm_master_key', 'OpenAi_Api_Key', 'CFOS_MCP_TOKEN',
  'CFOS_MCP_ENDPOINT', 'CODEX_HOME', 'NODE_OPTIONS', 'BASH_ENV', 'ENV',
  'LD_PRELOAD', 'PYTHONPATH', 'CODEX_CONFIG', 'PATH_SECRET',
].map(name => [name, canary]))
const source = { ...secrets, PATH: '/usr/bin:/bin', HOME: '/fixture/home', LANG: 'C.UTF-8',
  HTTPS_PROXY: 'http://proxy.example:8080', NO_PROXY: 'localhost,127.0.0.1',
  SSL_CERT_FILE: '/fixture/ca.pem' }

test('Codex process gets an explicit allowlist, fixed login home and only its current bridge', () => {
  const result = buildCodexEnv(source, bridge)
  assert.deepEqual(result, { PATH: source.PATH, HOME: source.HOME, LANG: source.LANG,
    HTTPS_PROXY: source.HTTPS_PROXY, NO_PROXY: source.NO_PROXY, SSL_CERT_FILE: source.SSL_CERT_FILE,
    CODEX_HOME: '/agents/codex', CFOS_MCP_ENDPOINT: bridge.endpoint, CFOS_MCP_TOKEN: bridge.token })
  assert(!JSON.stringify(result).includes(canary))
  assert.equal(source.CFOS_MCP_TOKEN, canary, 'the runner environment is unchanged')
})

test('no bridge cannot reuse ambient transport credentials or provider API login', () => {
  const result = buildCodexEnv(source)
  for (const name of Object.keys(secrets)) if (name !== 'CODEX_HOME') assert.equal(result[name], undefined)
  assert.equal(result.CODEX_HOME, '/agents/codex')
})

test('Windows runtime names survive without admitting case-variant secrets', () => {
  assert.deepEqual(buildCodexEnv({ Path: 'C:\\tools', SystemRoot: 'C:\\Windows',
    UserProfile: 'C:\\Users\\fixture', AppData: 'C:\\Users\\fixture\\AppData',
    CfOs_McP_ToKeN: canary, LITELLM_master_KEY: canary }, undefined, 'C:\\codex'), {
    PATH: 'C:\\tools', SYSTEMROOT: 'C:\\Windows', USERPROFILE: 'C:\\Users\\fixture',
    APPDATA: 'C:\\Users\\fixture\\AppData', CODEX_HOME: 'C:\\codex',
  })
})

test('a real subprocess receives no ambient secrets or startup injection', () => {
  const result = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], {
    env: buildCodexEnv(source, bridge), encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), buildCodexEnv(source, bridge))
  assert(!result.stdout.includes(canary))
})

test('tool shell policy excludes transport credentials and resets unsafe defaults', () => {
  const args = buildCodexShellEnvArgs(buildCodexEnv(source, bridge))
  const overrides = Object.fromEntries(args.filter((_, i) => i % 2).map(value => {
    const at = value.indexOf('=')
    return [value.slice(0, at), value.slice(at + 1)]
  }))
  assert.equal(overrides['shell_environment_policy.inherit'], '"none"')
  assert.equal(overrides['shell_environment_policy.ignore_default_excludes'], 'false')
  assert.equal(overrides['shell_environment_policy.experimental_use_profile'], 'false')
  assert.deepEqual(JSON.parse(overrides['shell_environment_policy.include_only']), ['PATH', 'HOME', 'LANG'])
  assert(!args.join(' ').includes(canary))
  assert(!args.join(' ').includes(bridge.token))
  assert(!args.join(' ').includes(source.HTTPS_PROXY))
  assert(!args.join(' ').includes('CODEX_HOME'))
})

test('empty runtime input still has a non-empty final shell allowlist', () => {
  assert(buildCodexShellEnvArgs({}).includes('shell_environment_policy.include_only=["PATH"]'))
})

test('runtime values are TOML-quoted, not interpolated as configuration', () => {
  const value = '/tmp/quoted"\\path\nCFOS_MCP_TOKEN="injected"'
  const args = buildCodexShellEnvArgs({ HOME: value })
  assert(args.includes(`shell_environment_policy.set={"HOME"=${JSON.stringify(value)},"PATH"="/usr/local/bin:/usr/bin:/bin"}`))
  assert.equal(args.length, 12)
})
