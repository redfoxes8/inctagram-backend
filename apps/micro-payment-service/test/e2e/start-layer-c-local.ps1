$ErrorActionPreference = 'Stop'

if ($env:PAYMENT_TEST_STRIPE_E2E -ne 'true') {
  Write-Output 'Layer C Stripe E2E: SKIPPED (set PAYMENT_TEST_STRIPE_E2E=true to enable)'
  exit 0
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) 'inctagram-layer-c'
[System.IO.Directory]::CreateDirectory($temporaryDirectory) | Out-Null

$keyLine = Get-Content (Join-Path $repositoryRoot 'apps/micro-payment-service/.env.development') |
  Where-Object { $_ -match '^STRIPE_SECRET_KEY=' } |
  Select-Object -Last 1
$stripeApiKey = (($keyLine -split '=', 2)[1]).Trim()
if ($stripeApiKey -notmatch '^sk_test_') { throw 'Local Stripe test key is unavailable' }
$env:STRIPE_API_KEY = $stripeApiKey

$webhookSecret = (& stripe listen --print-secret 2>$null).Trim()
if ($webhookSecret -notmatch '^whsec_[A-Za-z0-9]+$') { throw 'Stripe listener secret unavailable' }
$stripeProcess = Start-Process stripe -ArgumentList 'listen','--events','checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,invoice.payment_succeeded,invoice.payment_failed,invoice.paid,customer.subscription.created,customer.subscription.deleted','--forward-to','http://127.0.0.1:4278/api/v1/payments/webhook/stripe' -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru
Write-Output 'STRIPE_LISTENER_READY'

$env:NODE_ENV = 'development'
$env:ENV_FILE_PATH = 'apps/micro-payment-service/.env.development'
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5434/payment_lifecycle_test'
$env:PRISMA_DB_URL = $env:DATABASE_URL
$env:RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:5672'
$env:STRIPE_WEBHOOK_SECRET = $webhookSecret
$env:PAYMENT_OUTBOX_RELAY_ENABLED = 'true'
$env:PAYMENT_OUTBOX_RELAY_CRON = '* * * * * *'
$env:GRPC_HOST = '127.0.0.1'
$env:GRPC_PORT = '50053'
$paymentLog = Join-Path $temporaryDirectory 'payment.log'
$paymentErrorLog = Join-Path $temporaryDirectory 'payment-error.log'
Write-Output 'STARTING_PAYMENT'
$payment = Start-Process pnpm.cmd -ArgumentList 'run','start:micro-payment-service' -WorkingDirectory $repositoryRoot -WindowStyle Hidden -RedirectStandardOutput $paymentLog -RedirectStandardError $paymentErrorLog -PassThru
Write-Output "PAYMENT_PID=$($payment.Id)"

$env:ENV_FILE_PATH = 'apps/main-gateway-service/.env.development'
$env:PRISMA_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5434/gateway_payment_lifecycle_test'
$env:RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:5672'
$env:PAYMENT_SERVICE_GRPC_URL = '127.0.0.1:50053'
$env:PAYMENT_ACCOUNT_QUEUE_NAME = 'gateway-payment-lifecycle-test'
$env:PORT = '4278'
$gatewayLog = Join-Path $temporaryDirectory 'gateway.log'
$gatewayErrorLog = Join-Path $temporaryDirectory 'gateway-error.log'
Write-Output 'STARTING_GATEWAY'
$gateway = Start-Process pnpm.cmd -ArgumentList 'run','start:main-gateway-service' -WorkingDirectory $repositoryRoot -WindowStyle Hidden -RedirectStandardOutput $gatewayLog -RedirectStandardError $gatewayErrorLog -PassThru
Write-Output "GATEWAY_PID=$($gateway.Id)"

Write-Output "LAYER_C_PROCESSES_STARTED stripe=$($stripeProcess.Id) payment=$($payment.Id) gateway=$($gateway.Id)"
while (-not $stripeProcess.HasExited -and -not $payment.HasExited -and -not $gateway.HasExited) {
  Start-Sleep -Seconds 5
}
throw "Layer C process exited: stripe=$($stripeProcess.ExitCode) payment=$($payment.ExitCode) gateway=$($gateway.ExitCode)"
