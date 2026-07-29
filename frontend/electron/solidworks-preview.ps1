param(
  [Parameter(Mandatory=$true)][string]$FilePath,
  [Parameter(Mandatory=$true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"

$ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
$docType = switch ($ext) {
  ".sldprt" { 1 }
  ".sldasm" { 2 }
  ".slddrw" { 3 }
  default { throw "Extension non prise en charge : $ext" }
}

# swOpenDocOptions_Silent (1) + swOpenDocOptions_ReadOnly (4)
$openOptions = 5

# New-Object -ComObject attaches to an already-running SolidWorks instance
# if the user has one open (COM Running Object Table behavior), rather than
# always starting a new one. That's important: we must NEVER call ExitApp,
# since that would force-close their entire session, including any of
# their own unsaved work in other documents. We only close the one document
# we opened, via CloseDoc, and leave the application itself exactly as we
# found it (running or not).
$sw = New-Object -ComObject SldWorks.Application

$openErrors = 0
$openWarnings = 0
$model = $sw.OpenDoc6($FilePath, $docType, $openOptions, "", [ref]$openErrors, [ref]$openWarnings)

if ($null -eq $model) {
  throw "SolidWorks n'a pas pu ouvrir le fichier (erreurs=$openErrors avertissements=$openWarnings)"
}

try {
  $saveErrors = 0
  $saveWarnings = 0
  $ok = $model.Extension.SaveAs($OutputPath, 0, 0, $null, [ref]$saveErrors, [ref]$saveWarnings)

  if (-not $ok) {
    throw "Échec de l'export (erreurs=$saveErrors avertissements=$saveWarnings)"
  }

  Write-Output "OK"
} finally {
  $sw.CloseDoc($model.GetTitle())
}
