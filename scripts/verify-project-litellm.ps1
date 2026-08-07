$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
$envLines = Get-Content -LiteralPath $envPath
$keyLine = $envLines | Where-Object { $_ -like 'LITELLM_MASTER_KEY=*' } | Select-Object -First 1
if (-not $keyLine) {
  throw 'LITELLM_MASTER_KEY is missing from the project .env file.'
}

$apiKey = $keyLine.Substring('LITELLM_MASTER_KEY='.Length)
$portLine = $envLines | Where-Object { $_ -like 'LITELLM_HOST_PORT=*' } | Select-Object -First 1
$port = if ($portLine) { $portLine.Substring('LITELLM_HOST_PORT='.Length) } else { '4001' }
$headers = @{ Authorization = "Bearer $apiKey" }
$models = Invoke-RestMethod -Headers $headers -Uri "http://localhost:$port/v1/models" -TimeoutSec 30
$ids = @($models.data | ForEach-Object { $_.id })
Write-Output "PROJECT_LITELLM_MODEL_COUNT=$($ids.Count)"
$ids
