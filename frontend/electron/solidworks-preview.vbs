' Generates a preview PNG (and, for parts/assemblies, an STL for the
' in-browser interactive 3D viewer) from a native SolidWorks file by
' driving a locally-installed, locally-licensed SolidWorks over COM.
'
' VBScript, not PowerShell: PowerShell's .NET COM interop has a confirmed
' bug on this setup where property access on the SldWorks.Application
' object works but ANY method call (OpenDoc6, RevisionNumber, GetProcessID
' — all of them) fails with TYPE_E_ELEMENTNOTFOUND. VBScript's classic OLE
' Automation binder does not have this problem and was verified working
' end-to-end against real part/assembly files.
'
' Also uses the simplest legacy call shapes (OpenDoc with 2 args, SaveAs
' with 1 arg) rather than the newer OpenDoc6/SaveAs3 — those newer, more
' configurable overloads consistently threw "Type incompatible" here
' regardless of argument typing; the plain legacy forms worked immediately.
'
' Closes the SolidWorks instance at the end ONLY if this script is the one
' that started it (checked via WMI before CreateObject). If the user
' already had SolidWorks open, we attach to that session and leave it
' running untouched — never risking their real unsaved work. But an
' instance we spawned ourselves gets closed every time, because leaving it
' running headless was confirmed to be the actual root cause of repeated
' "crashes with zero error output": a leftover automation-only SLDWORKS.exe
' left running overnight degraded into a broken COM state (GetDocuments
' failing with "Object required" while simple property reads still
' worked), and every subsequent preview attempt kept re-attaching to that
' same broken zombie instead of a fresh one.
'
' Large assemblies have been observed to fail with NO stderr output at
' all — which "On Error Resume Next" should never allow, since every
' failure path below writes to StdErr before quitting. That shape means
' the cscript.exe host itself is dying (e.g. a native crash inside the
' SolidWorks COM automation while handling a big assembly), not a normal
' VBScript error. So every step also logs to a plain text file next to
' the PNG output — written and closed immediately after each step so it
' survives a hard crash on the next line, giving a real trail to inspect
' even when stderr comes back empty.

On Error Resume Next

Set fso = CreateObject("Scripting.FileSystemObject")
Set sw = Nothing
startedByUs = False

Sub LogStep(path, msg)
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(path, 8, True) ' 8 = ForAppending, create if missing
  f.WriteLine Now & "  " & msg
  f.Close
End Sub

' Closes the SolidWorks instance we started (if any), then quits.
Sub Finish(code)
  If startedByUs And Not (sw Is Nothing) Then
    On Error Resume Next
    LogStep logPath, "Fermeture de l'instance SolidWorks demarree par ce script..."
    sw.ExitApp()
    LogStep logPath, "SolidWorks ferme."
  End If
  WScript.Quit code
End Sub

Sub Fail(msg, logMsg)
  WScript.StdErr.WriteLine msg
  LogStep logPath, "ECHEC : " & logMsg
  Finish 1
End Sub

If WScript.Arguments.Count < 2 Then
  WScript.StdErr.WriteLine "Usage: cscript solidworks-preview.vbs <FilePath> <OutputPngPath> [OutputStlPath]"
  WScript.Quit 1
End If

filePath = WScript.Arguments(0)
outputPngPath = WScript.Arguments(1)
outputStlPath = ""
If WScript.Arguments.Count > 2 Then
  outputStlPath = WScript.Arguments(2)
End If

logPath = outputPngPath & ".log"
LogStep logPath, "Demarrage. Fichier : " & filePath

dotPos = InStrRev(filePath, ".")
ext = LCase(Mid(filePath, dotPos))

docType = 0
Select Case ext
  Case ".sldprt"
    docType = 1
  Case ".sldasm"
    docType = 2
  Case ".slddrw"
    docType = 3
  Case Else
    Fail "Type de fichier non pris en charge : " & ext, "type de fichier non pris en charge : " & ext
End Select

LogStep logPath, "Type detecte : " & ext & " (docType=" & docType & ")"

' STL is a 3D solid format — meaningless for a 2D drawing (.slddrw).
canExportStl = (docType = 1 Or docType = 2)

' Was SolidWorks already running before we touch it? If not, we started
' it, and we're responsible for closing it when we're done.
runningBefore = 0
Set wmi = GetObject("winmgmts:")
Set existingProcs = wmi.ExecQuery("Select * from Win32_Process Where Name='SLDWORKS.EXE'")
If Err.Number = 0 Then runningBefore = existingProcs.Count
Err.Clear
startedByUs = (runningBefore = 0)
LogStep logPath, "Instances SLDWORKS.EXE deja actives avant demarrage : " & runningBefore & " (startedByUs=" & startedByUs & ")"

Set sw = CreateObject("SldWorks.Application")
If Err.Number <> 0 Then
  Fail "Impossible de demarrer SolidWorks : " & Err.Description, "CreateObject SldWorks.Application : " & Err.Description
End If
LogStep logPath, "SolidWorks attache."

LogStep logPath, "Ouverture du fichier..."
Set model = sw.OpenDoc(filePath, docType)
If Err.Number <> 0 Or model Is Nothing Then
  Fail "Impossible d'ouvrir le fichier : " & Err.Description, "OpenDoc : " & Err.Description & " (model Is Nothing: " & (model Is Nothing) & ")"
End If
LogStep logPath, "Fichier ouvert."

model.ViewZoomtofit2()
LogStep logPath, "Zoom to fit effectue."

LogStep logPath, "Export PNG vers " & outputPngPath & "..."
ok = model.SaveAs(outputPngPath)
If Err.Number <> 0 Or Not ok Then
  Dim errDesc
  errDesc = Err.Description
  sw.CloseDoc(model.GetTitle())
  Fail "Echec de l'export de l'apercu : " & errDesc, "export PNG : " & errDesc
End If
LogStep logPath, "PNG exporte."

If canExportStl And outputStlPath <> "" Then
  ' swSTLComponentsIntoOneFile (value 72 in swUserPreferenceToggle_e, read
  ' directly off this machine's SolidWorks.Interop.swconst.dll via .NET
  ' reflection to be sure of the exact number). Confirmed live: this was
  ' OFF by default here, which is why an assembly's STL "succeeded" with
  ' no error but silently wrote one separate STL per component (named
  ' "<name> - <component>-N.STL") instead of the single combined file we
  ' asked for — every downstream check (Err.Number, the return value)
  ' looked fine, so this was invisible without actually looking at disk.
  ' Saved and restored around the export so we don't permanently change
  ' the user's own SolidWorks settings.
  swSTLComponentsIntoOneFile = 72
  originalStlToggle = sw.GetUserPreferenceToggle(swSTLComponentsIntoOneFile)
  sw.SetUserPreferenceToggle swSTLComponentsIntoOneFile, True

  LogStep logPath, "Export STL vers " & outputStlPath & "..."
  okStl = model.SaveAs(outputStlPath)
  stlErrDesc = Err.Description
  stlFailed = (Err.Number <> 0 Or Not okStl)
  Err.Clear

  sw.SetUserPreferenceToggle swSTLComponentsIntoOneFile, originalStlToggle

  If stlFailed Then
    ' Not fatal — the PNG already succeeded, but this is surfaced to the
    ' user (not just logged) since the 3D view matters, not a silent bonus.
    WScript.StdErr.WriteLine "STL_WARN: " & stlErrDesc
    LogStep logPath, "AVERTISSEMENT export STL (non bloquant) : " & stlErrDesc
  Else
    LogStep logPath, "STL exporte."
  End If
End If

sw.CloseDoc(model.GetTitle())
LogStep logPath, "Document ferme. Termine avec succes."

WScript.Echo "OK"
Finish 0
