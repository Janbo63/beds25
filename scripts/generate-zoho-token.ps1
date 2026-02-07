# Zoho CRM Refresh Token Generator
# This script helps you generate a refresh token for Zoho CRM API access

# STEP 1: Get your Client ID from .env file
$clientId = (Get-Content .env | Select-String "ZOHO_CLIENT_ID").ToString().Split('"')[1]
$clientSecret = (Get-Content .env | Select-String "ZOHO_CLIENT_SECRET").ToString().Split('"')[1]
$accountsUrl = (Get-Content .env | Select-String "ZOHO_ACCOUNTS_URL").ToString().Split('"')[1]

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Zoho CRM Refresh Token Generator" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

if ($clientId -eq "your_client_id_here" -or $clientSecret -eq "your_client_secret_here") {
    Write-Host "ERROR: Please update your .env file with real ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET first!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To get these values:" -ForegroundColor Yellow
    Write-Host "1. Go to https://api-console.zoho.com/" -ForegroundColor Yellow
    Write-Host "2. Find your existing application or create a new Server-based Application" -ForegroundColor Yellow
    Write-Host "3. Copy the Client ID and Client Secret to your .env file" -ForegroundColor Yellow
    exit
}

# STEP 2: Generate authorization URL
$scope = "ZohoCRM.modules.ALL,ZohoCRM.settings.ALL"
$redirectUri = "https://www.zoho.com"
$authUrl = "$accountsUrl/oauth/v2/auth?scope=$scope&client_id=$clientId&response_type=code&access_type=offline&redirect_uri=$redirectUri"

Write-Host "STEP 1: Get Authorization Code" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Opening this URL in your browser:" -ForegroundColor Yellow
Write-Host $authUrl -ForegroundColor Cyan
Write-Host ""
Write-Host "Please:" -ForegroundColor Yellow
Write-Host "1. Click 'Accept' to authorize the application" -ForegroundColor Yellow
Write-Host "2. Copy the 'code' parameter from the redirected URL" -ForegroundColor Yellow
Write-Host "   (Example: https://www.zoho.com/?code=XXXXXXXXXX)" -ForegroundColor Yellow
Write-Host ""

# Open browser
Start-Process $authUrl

Write-Host ""
Write-Host "Waiting for you to authorize..." -ForegroundColor Cyan
$code = Read-Host "Paste the authorization code here"

Write-Host ""
Write-Host "STEP 2: Exchange Code for Refresh Token" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

# STEP 3: Exchange code for refresh token
$tokenUrl = "$accountsUrl/oauth/v2/token"
$body = @{
    code = $code
    client_id = $clientId
    client_secret = $clientSecret
    redirect_uri = $redirectUri
    grant_type = "authorization_code"
}

try {
    $response = Invoke-RestMethod -Uri $tokenUrl -Method POST -Body $body
    
    Write-Host "SUCCESS! Token generated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your Refresh Token:" -ForegroundColor Yellow
    Write-Host $response.refresh_token -ForegroundColor Cyan
    Write-Host ""
    Write-Host "STEP 3: Update .env file" -ForegroundColor Green
    Write-Host "=========================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Updating your .env file automatically..." -ForegroundColor Yellow
    
    # Update .env file
    $envContent = Get-Content .env
    $envContent = $envContent -replace 'ZOHO_REFRESH_TOKEN=".*"', "ZOHO_REFRESH_TOKEN=`"$($response.refresh_token)`""
    $envContent | Set-Content .env
    
    Write-Host "✅ .env file updated!" -ForegroundColor Green
    Write-Host ""
    Write-Host "STEP 4: Restart your dev server" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Run: npm run dev" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Then test by going to Settings → Zoho CRM → Sync All" -ForegroundColor Yellow
    
} catch {
    Write-Host "ERROR: Failed to get refresh token" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check:" -ForegroundColor Yellow
    Write-Host "- The authorization code is correct" -ForegroundColor Yellow
    Write-Host "- Your Client ID and Client Secret are correct in .env" -ForegroundColor Yellow
    Write-Host "- The code hasn't expired (codes expire after 60 seconds)" -ForegroundColor Yellow
}
