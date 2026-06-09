# Apply SQL migrations in order (Windows).
# Usage: .\scripts\run-migrations.ps1

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Migrations = @(
    "add_staking_tables.sql",
    "add_leverage_tables.sql",
    "add_platform_features.sql",
    "add_user_lockout.sql",
    "add_p2p_messages.sql"
)

$DbUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql://crypto4pro:crypto4pro_password@localhost:5432/crypto4pro_exchange" }

foreach ($file in $Migrations) {
    $path = Join-Path $Root "backend\migrations\$file"
    if (Test-Path $path) {
        Write-Host "Applying $file ..."
        try {
            psql $DbUrl -f $path
        } catch {
            Write-Host "  (skipped or already applied: $file)"
        }
    } else {
        Write-Host "Missing migration: $file"
    }
}

Write-Host "Done."
