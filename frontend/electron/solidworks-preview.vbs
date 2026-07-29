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
' Never calls ExitApp or touches Visible: CreateObject attaches to the
' user's already-running SolidWorks session if they have one open, and
' forcing either would risk closing or hiding their real unsaved work.
' Only the specific document opened here gets closed.
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

Sub LogStep(path, msg)
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(path, 8, True) ' 8 = ForAppending, create if missing
  f.WriteLine Now & "  " & msg
  f.Close
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
    WScript.StdErr.WriteLine "Type de fichier non pris en charge : " & ext
    LogStep logPath, "ECHEC : type de fichier non pris en charge : " & ext
    WScript.Quit 1
End Select

LogStep logPath, "Type detecte : " & ext & " (docType=" & docType & ")"

' STL is a 3D solid format — meaningless for a 2D drawing (.slddrw).
canExportStl = (docType = 1 Or docType = 2)

Set sw = CreateObject("SldWorks.Application")
If Err.Number <> 0 Then
  WScript.StdErr.WriteLine "Impossible de demarrer SolidWorks : " & Err.Description
  LogStep logPath, "ECHEC CreateObject SldWorks.Application : " & Err.Description
  WScript.Quit 1
End If
LogStep logPath, "SolidWorks attache."

LogStep logPath, "Ouverture du fichier..."
Set model = sw.OpenDoc(filePath, docType)
If Err.Number <> 0 Or model Is Nothing Then
  WScript.StdErr.WriteLine "Impossible d'ouvrir le fichier : " & Err.Description
  LogStep logPath, "ECHEC OpenDoc : " & Err.Description & " (model Is Nothing: " & (model Is Nothing) & ")"
  WScript.Quit 1
End If
LogStep logPath, "Fichier ouvert."

model.ViewZoomtofit2()
LogStep logPath, "Zoom to fit effectue."

LogStep logPath, "Export PNG vers " & outputPngPath & "..."
ok = model.SaveAs(outputPngPath)
If Err.Number <> 0 Or Not ok Then
  WScript.StdErr.WriteLine "Echec de l'export de l'apercu : " & Err.Description
  LogStep logPath, "ECHEC export PNG : " & Err.Description
  sw.CloseDoc(model.GetTitle())
  WScript.Quit 1
End If
LogStep logPath, "PNG exporte."

If canExportStl And outputStlPath <> "" Then
  LogStep logPath, "Export STL vers " & outputStlPath & "..."
  okStl = model.SaveAs(outputStlPath)
  If Err.Number <> 0 Or Not okStl Then
    ' Not fatal — the PNG already succeeded, the 3D viewer is a bonus.
    WScript.StdErr.WriteLine "STL_WARN: " & Err.Description
    LogStep logPath, "AVERTISSEMENT export STL (non bloquant) : " & Err.Description
    Err.Clear
  Else
    LogStep logPath, "STL exporte."
  End If
End If

sw.CloseDoc(model.GetTitle())
LogStep logPath, "Document ferme. Termine avec succes."

WScript.Echo "OK"
