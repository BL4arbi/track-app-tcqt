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
  const tmpLog = `${tmpPng}.log`;
  const wantsStl = SOLID_EXTENSIONS.has(ext);
  const tmpStl = wantsStl ? path.join(os.tmpdir(), `sw-preview-${id}.stl`) : null;

  // The script logs each step to this file, flushed immediately after every
  // write — so even if cscript.exe crashes outright (observed on some large
  // assemblies, with zero stderr output despite every failure path writing
  // to it) we still have a trail of exactly how far it got.
  async function readStepLog() {
    try {
      const content = await readFile(tmpLog, 'utf8');
      return content.trim();
    } catch {
      return '';
    }
  }

  try {
    const args = ['//nologo', scriptPath, nativeFilePath, tmpPng];
    if (tmpStl) args.push(tmpStl);

    // Large assemblies opened from a network drive can take several minutes
    // (SolidWorks has to resolve and load every referenced part over the
    // network). 10 minutes gives real large-assembly opens room to finish
    // without leaving a hung SolidWorks process running indefinitely.
    const timeoutMs = 10 * 60_000;
    await execFileAsync('cscript.exe', args, { timeout: timeoutMs });

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
    const stepLog = await readStepLog();
    const logSuffix = stepLog ? `\n\nDétail des étapes :\n${stepLog}` : '';

    // A timeout kill leaves stderr empty (cscript never got to write to it)
    // — that blank-error shape usually means SolidWorks popped a dialog
    // (e.g. asking to resolve/locate a missing referenced part) and is
    // sitting there waiting for a click nobody can give it headlessly.
    if (e.killed && e.signal) {
      return {
        success: false,
        error: `L'ouverture a dépassé le délai de ${Math.round(timeoutMs / 60_000)} min et a été interrompue. ` +
          "Le fichier est peut-être très volumineux, ou SolidWorks attend une réponse à une boîte de dialogue " +
          "(référence introuvable, etc.) — ouvrez le fichier manuellement dans SolidWorks pour vérifier." + logSuffix,
      };
    }
    // Otherwise execFile errors include stderr, which carries the
    // VBScript/COM exception message — surface that, it's the actionable part.
    // If stderr is also empty, cscript.exe likely crashed outright — the
    // step log is then the only real diagnostic available.
    const detail = e.stderr?.toString().trim() || e.message;
    return { success: false, error: detail + logSuffix };
  } finally {
    try {
      await unlink(tmpPng);
    } catch {
      // temp file may not have been created if export failed
    }
    try {
      await unlink(tmpLog);
    } catch {
      // log file may not exist if the script crashed before writing anything
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
