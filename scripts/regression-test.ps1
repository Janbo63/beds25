
# scripts/regression-test.ps1

param (
    [switch]$Full  # If set, runs all tests including E2E. Default (without this) runs only Smoke tests.
)

$TestType = if ($Full) { "Full Suite (Smoke + E2E)" } else { "Smoke Tests Only" }
$TestPath = if ($Full) { "tests/" } else { "tests/smoke/" }

Write-Host "🚀 Starting $TestType..." -ForegroundColor Green

# Step 1: Build the application for production
Write-Host "Building the application (npm run build)..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Aborting tests." -ForegroundColor Red
    exit 1
}

# Step 2: Run Playwright tests
Write-Host "Running Playwright tests in $TestPath..." -ForegroundColor Yellow
# We pass the path to playwright to restrict which tests run
npx playwright test $TestPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "Tests FAILED." -ForegroundColor Red
    Write-Host "Check the report via: npx playwright show-report" -ForegroundColor Yellow
    exit 1
}

Write-Host "Tests PASSED successfully!" -ForegroundColor Green
exit 0
