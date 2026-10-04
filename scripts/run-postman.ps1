param(
  [string]$BaseUrl = 'http://localhost:5000/api',
  [string]$FrontendOrigin = 'http://localhost:5173'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$collectionPath = Join-Path $projectRoot 'postman\Valence.postman_collection.json'
$templatePath = Join-Path $projectRoot 'postman\Valence.postman_environment.json'
$adminEmail = Read-Host 'Your seeded ADMIN_EMAIL'
$securePassword = Read-Host 'Your seeded ADMIN_PASSWORD' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try { $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
$buyerEmail = 'acceptance-' + [Guid]::NewGuid().ToString('N') + '@example.test'
$buyerPassword = 'Test-' + [Guid]::NewGuid().ToString('N') + '-1!'
$environment = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8 | ConvertFrom-Json
$settings = @{baseUrl=$BaseUrl; frontendOrigin=$FrontendOrigin; adminEmail=$adminEmail; adminPassword=$adminPassword; buyerEmail=$buyerEmail; buyerPassword=$buyerPassword}
foreach ($entry in $environment.values) {
  if ($settings.ContainsKey($entry.key)) { $entry.value = $settings[$entry.key] }
}
$tempPath = Join-Path ([IO.Path]::GetTempPath()) ('valence-postman-' + [Guid]::NewGuid().ToString('N') + '.json')
try {
  $environment | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tempPath -Encoding UTF8
  $collection = Get-Content -LiteralPath $collectionPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $runnerArgs = @('--yes', 'newman@6.2.2', 'run', $collectionPath, '-e', $tempPath, '--bail', '--timeout-request', '20000')
  foreach ($folder in $collection.item) {
    if ($folder.name -match '^0[1-6] ') { $runnerArgs += @('--folder', [string]$folder.name) }
  }
  Write-Host 'Running core acceptance only. This creates one test buyer, RFQs, a sales enquiry and an unpaid quote order in YOUR database.'
  Write-Host 'No payment, file upload or email-provider request will run.'
  & npx.cmd @runnerArgs
  $runnerExit = $LASTEXITCODE
  if ($runnerExit -ne 0) { throw "Postman acceptance FAILED (exit $runnerExit). Share request names, HTTP status and messages with secrets removed." }
  Write-Host 'POSTMAN CORE: PASS (zero failed assertions). Temporary credentials file removed on exit.'
}
finally {
  if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath -Force }
  $adminPassword = $null; $buyerPassword = $null; $environment = $null; $settings = $null
  $securePassword.Dispose()
}
