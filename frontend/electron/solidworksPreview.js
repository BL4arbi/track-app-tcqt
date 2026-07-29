// Automatic preview generation by driving a locally-installed, locally-
// licensed SolidWorks via its COM automation API, through VBScript (cscript,
// built into Windows). Runs only in the Electron main process, on Windows,
// and only works if SolidWorks is installed on this machine — it never
// touches the server (no license there).
//
// VBScript, not PowerShell: verified directly against this dev machine's
// real, licensed SolidWorks 2023 install. PowerShell's .NET COM interop
// has a confirmed bug here — property access on the SldWorks.Application
// object works, but every method call (OpenDoc6, RevisionNumber, anything)
// throws TYPE_E_ELEMENTNOTFOUND. VBScript's classic OLE Automation binder
// doesn't have that problem; the full open → zoom-to-fit → export pipeline
// was confirmed working end-to-end against a real uploaded part file.

import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPPORTED_EXTENSIONS = new Set(['.sldprt', '.sldasm', '.slddrw']);

export async function generateSolidWorksPreview(nativeFilePath) {
  if (process.platform !== 'win32') {
    return { success: false, error: "La génération automatique d'aperçu nécessite Windows." };
  }

  const ext = path.extname(nativeFilePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { success: false, error: `Type de fichier non pris en charge pour la génération auto : ${ext}` };
  }

  const scriptPath = path.join(__dirname, 'solidworks-preview.vbs');
  const tmpPng = path.join(os.tmpdir(), `sw-preview-${randomUUID()}.png`);

  try {
    await execFileAsync(
      'cscript.exe',
      ['//nologo', scriptPath, nativeFilePath, tmpPng],
      { timeout: 120_000 }
    );

    const buffer = await readFile(tmpPng);
    return { success: true, base64: buffer.toString('base64') };
  } catch (e) {
    // execFile errors include stderr, which carries the VBScript/COM
    // exception message — surface that, it's the actionable part.
    const detail = e.stderr?.toString().trim() || e.message;
    return { success: false, error: detail };
  } finally {
    try {
      await unlink(tmpPng);
    } catch {
      // temp file may not have been created if export failed
    }
  }
}
