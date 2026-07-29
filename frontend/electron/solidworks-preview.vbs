' Generates a preview PNG from a native SolidWorks file by driving a
' locally-installed, locally-licensed SolidWorks over COM.
'
' VBScript, not PowerShell: PowerShell's .NET COM interop has a confirmed
' bug on this setup where property access on the SldWorks.Application
' object works but ANY method call (OpenDoc6, RevisionNumber, GetProcessID
' — all of them) fails with TYPE_E_ELEMENTNOTFOUND. VBScript's classic OLE
' Automation binder does not have this problem and was verified working
' end-to-end against a real part file.
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

On Error Resume Next

If WScript.Arguments.Count < 2 Then
  WScript.StdErr.WriteLine "Usage: cscript solidworks-preview.vbs <FilePath> <OutputPath>"
  WScript.Quit 1
End If

filePath = WScript.Arguments(0)
outputPath = WScript.Arguments(1)

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
    WScript.Quit 1
End Select

Set sw = CreateObject("SldWorks.Application")
If Err.Number <> 0 Then
  WScript.StdErr.WriteLine "Impossible de demarrer SolidWorks : " & Err.Description
  WScript.Quit 1
End If

Set model = sw.OpenDoc(filePath, docType)
If Err.Number <> 0 Or model Is Nothing Then
  WScript.StdErr.WriteLine "Impossible d'ouvrir le fichier : " & Err.Description
  WScript.Quit 1
End If

model.ViewZoomtofit2()

ok = model.SaveAs(outputPath)
If Err.Number <> 0 Or Not ok Then
  WScript.StdErr.WriteLine "Echec de l'export de l'apercu : " & Err.Description
  sw.CloseDoc(model.GetTitle())
  WScript.Quit 1
End If

sw.CloseDoc(model.GetTitle())

WScript.Echo "OK"
