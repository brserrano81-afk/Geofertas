# Deployment script for production branch
# Merges main into production and pushes to origin/production

$ErrorActionPreference = "Stop"

function Log($msg) {
    Write-Host "[Deploy] $msg" -ForegroundColor Cyan
}

try {
    # 1. Verify current branch
    $branch = git rev-parse --abbrev-ref HEAD
    Log "Current branch: $branch"
    
    if ($branch -ne "main") {
        Log "Switching to main..."
        git checkout main
    }
    
    # 2. Pull latest main
    Log "Pulling latest main..."
    git pull origin main
    
    # 3. Switch to production
    Log "Switching to production..."
    git checkout production
    
    # 4. Merge main
    Log "Merging main into production..."
    git merge main --no-edit
    
    # 5. Push to production
    Log "Pushing to origin/production..."
    git push origin production
    
    # 6. Switch back to main
    Log "Switching back to main..."
    git checkout main
    
    Log "SUCCESS: Deployment to production completed and pushed to Railway."
} catch {
    Log "ERROR: Deployment failed."
    Write-Error $_
}
