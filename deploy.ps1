# Solicitar el mensaje de commit al usuario
$mensaje = Read-Host -Prompt "Ingresa tu mensaje de actualizacion"

# Validar que el mensaje no esté vacío
if ([string]::IsNullOrWhiteSpace($mensaje)) {
    Write-Host "Error: El mensaje de actualizacion no puede estar vacio." -ForegroundColor Red
    exit
}

Write-Host "`n[1/4] Agregando archivos al staging (git add)..." -ForegroundColor Cyan
git add .
if ($LASTEXITCODE -eq 0) {
    Write-Host "-> Exito: Archivos agregados correctamente." -ForegroundColor Green
} else {
    Write-Host "-> Error al ejecutar 'git add'." -ForegroundColor Red
    exit
}

Write-Host "`n[2/4] Creando commit (git commit)..." -ForegroundColor Cyan
git commit -m "$mensaje"
if ($LASTEXITCODE -eq 0) {
    Write-Host "-> Exito: Commit creado correctamente." -ForegroundColor Green
} else {
    Write-Host "-> Error al ejecutar 'git commit'." -ForegroundColor Red
    exit
}

Write-Host "`n[3/4] Subiendo cambios a repositorio remoto (git push)..." -ForegroundColor Cyan
git push
if ($LASTEXITCODE -eq 0) {
    Write-Host "-> Exito: Cambios subidos correctamente." -ForegroundColor Green
} else {
    Write-Host "-> Error al ejecutar 'git push'." -ForegroundColor Red
    exit
}

Write-Host "`n[4/4] Ejecutando despliegue (npm run deploy)..." -ForegroundColor Cyan
npm run deploy
if ($LASTEXITCODE -eq 0) {
    Write-Host "-> Exito: Despliegue completado correctamente." -ForegroundColor Green
} else {
    Write-Host "-> Error al ejecutar 'npm run deploy'." -ForegroundColor Red
    exit
}

Write-Host "`n¡Proceso completado con exito!" -ForegroundColor Yellow