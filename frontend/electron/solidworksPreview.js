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
// was confirmed working end-to-end against real uploaded part/assembly
// files, including the STL export used for the in-browser 3D viewer.

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
const SOLID_EXTENSIONS = new Set(['.sldprt', '.sldasm']); // can export STL

export async function generateSolidWorksPreview(nativeFilePath) {
  if (process.platform !== 'win32') {
    return { success: false, error: "La génération automatique d'aperçu nécessite Windows." };
  }

  const ext = path.extname(nativeFilePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { success: false, error: `Type de fichier non pris en charge pour la génération auto : ${ext}` };
  }

  const scriptPath = path.join(__dirname, 'solidworks-preview.vbs');
  const id = randomUUID();
  const tmpPng = path.join(os.tmpdir(), `sw-preview-${id}.png`);
  const wantsStl = SOLID_EXTENSIONS.has(ext);
  const tmpStl = wantsStl ? path.join(os.tmpdir(), `sw-preview-${id}.stl`) : null;

  try {
    const args = ['//nologo', scriptPath, nativeFilePath, tmpPng];
    if (tmpStl) args.push(tmpStl);

    await execFileAsync('cscript.exe', args, { timeout: 120_000 });

    const pngBuffer = await readFile(tmpPng);
    const result = { success: true, base64: pngBuffer.toString('base64') };

    if (tmpStl) {
      try {
        const stlBuffer = await readFile(tmpStl);
        result.modelBase64 = stlBuffer.toString('base64');
      } catch {
        // STL export is best-effort — the PNG preview still succeeded.
      }
    }

    return result;
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
    if (tmpStl) {
      try {
        await unlink(tmpStl);
      } catch {
        // may not exist if STL export failed/was skipped
      }
    }
  }
}
