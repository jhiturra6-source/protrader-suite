$mensaje = Read-Host -Prompt "Ingresa tu mensaje de actualizacion"
if (![string]::IsNullOrWhiteSpace($mensaje)) {
    Write-Host "`n[1/4] Agregando archivos al staging (git add)..." -ForegroundColor Cyan
    git add .

    Write-Host "`n[2/4] Creando commit (git commit)..." -ForegroundColor Cyan
    git commit -m "$mensaje"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "-> Aviso: Es posible que no hubiera cambios nuevos para hacer commit. Continuando de todos modos..." -ForegroundColor Yellow
    }

    Write-Host "`n[3/4] Subiendo cambios a repositorio remoto (git push)..." -ForegroundColor Cyan
    git push
    if ($LASTEXITCODE -eq 0) {
        Write-Host "-> Exito: Cambios subidos correctamente." -ForegroundColor Green
    } else {
        Write-Host "-> Error o sin cambios que subir en 'git push'." -ForegroundColor Yellow
    }

    Write-Host "`n[4/4] Ejecutando despliegue (npm run deploy)..." -ForegroundColor Cyan
    npm run deploy
    if ($LASTEXITCODE -eq 0) {
        Write-Host "-> Exito: Despliegue completado correctamente." -ForegroundColor Green
    } else {
        Write-Host "-> Error al ejecutar 'npm run deploy'." -ForegroundColor Red
    }

    Write-Host "`n¡Proceso de flujo completado!" -ForegroundColor Yellow
} else {
    Write-Host "El mensaje no puede estar vacio." -ForegroundColor Red
}