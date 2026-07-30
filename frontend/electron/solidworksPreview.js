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

// cscript.exe is an external process — it has no idea what an .asar
// archive is, so it cannot open a script living inside app.asar (only
// Electron's own patched Node fs can see inside that virtual filesystem).
// In the packaged app __dirname resolves to a path like
// "...\resources\app.asar\electron", and every single "Command failed:
// cscript.exe ..." report ever seen (parts and assemblies alike) was
// this: cscript failing outright to even find the script file. The
// electron-builder config now unpacks *.vbs into a real app.asar.unpacked
// directory alongside app.asar with the identical relative structure, so
// swapping app.asar for app.asar.unpacked in the resolved path gives the
// real on-disk location. In dev, __dirname never contains "app.asar", so
// this is a no-op there.
function resolveExternallyReadablePath(p) {
  return p.replace('app.asar', 'app.asar.unpacked');
}

const SUPPORTED_EXTENSIONS = new Set(['.sldprt', '.sldasm', '.slddrw']);
const SOLID_EXTENSIONS = new Set(['.sldprt', '.sldasm']); // can export STL

// The .vbs script only closes the SolidWorks instance it started when it
// exits normally (its own Finish() sub runs on success or on a handled
// Fail()) — but a timeout kills cscript.exe from the OUTSIDE (SIGTERM),
// so that cleanup code never gets a chance to run at all. That left a
// real orphaned SLDWORKS.exe behind on every timeout, found running
// headlessly in Task Manager. Fixed by snapshotting SLDWORKS.exe PIDs
// from Node before starting, and on a timeout, killing only whichever
// PIDs are new since that snapshot — never touches a SolidWorks session
// the user already had open before we started.
async function listSldworksPids() {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "(Get-Process SLDWORKS -ErrorAction SilentlyContinue).Id -join ','",
    ]);
    return stdout.trim().split(',').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function killOrphanedSldworksProcesses(pidsBefore) {
  const pidsAfter = await listSldworksPids();
  const newPids = pidsAfter.filter((pid) => !pidsBefore.includes(pid));
  await Promise.all(
    newPids.map((pid) =>
      execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`,
      ]).catch(() => {
        // best-effort — nothing more we can do if this fails too
      })
    )
  );
  return newPids;
}

export async function generateSolidWorksPreview(nativeFilePath) {
  if (process.platform !== 'win32') {
    return { success: false, error: "La génération automatique d'aperçu nécessite Windows." };
  }

  const ext = path.extname(nativeFilePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    // Confirmed live against a real SolidWorks install: neutral exchange
    // formats (STEP/IGES/...) can't be driven the same way. OpenDoc just
    // returns Nothing for a .step file with no error at all, and OpenDoc6
    // (which has the Errors/Warnings output STEP import needs) fails with
    // "Type incompatible" on this VBScript/COM setup regardless of file
    // type — the same pre-existing bug documented for native files. Rather
    // than silently fail, tell the user the file can still be attached as
    // a plain document; they just don't get an auto-generated preview
    // unless it's converted to a native SolidWorks file first.
    return {
      success: false,
      error: `Génération auto non disponible pour ce type de fichier (${ext}) — seuls les fichiers natifs ` +
        "SolidWorks (.sldprt / .sldasm / .slddrw) le permettent. Vous pouvez quand même envoyer ce fichier " +
        "normalement (bouton Envoyer, sans générer d'aperçu), ou l'ouvrir dans SolidWorks et l'enregistrer " +
        "en .sldprt pour pouvoir générer un aperçu automatique.",
    };
  }

  const scriptPath = resolveExternallyReadablePath(path.join(__dirname, 'solidworks-preview.vbs'));
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

  const pidsBefore = await listSldworksPids();

  try {
    const args = ['//nologo', scriptPath, nativeFilePath, tmpPng];
    if (tmpStl) args.push(tmpStl);

    // Large assemblies opened from a network drive can take several minutes
    // (SolidWorks has to resolve and load every referenced part over the
    // network). 10 minutes gives real large-assembly opens room to finish
    // without leaving a hung SolidWorks process running indefinitely.
    const timeoutMs = 10 * 60_000;
    const { stderr } = await execFileAsync('cscript.exe', args, { timeout: timeoutMs });

    const pngBuffer = await readFile(tmpPng);
    const result = { success: true, base64: pngBuffer.toString('base64') };

    if (tmpStl) {
      try {
        const stlBuffer = await readFile(tmpStl);
        result.modelBase64 = stlBuffer.toString('base64');
      } catch {
        // A non-fatal STL failure doesn't make execFile throw (the script
        // still exits 0), so it wouldn't otherwise surface anywhere — but
        // the 3D view matters, so tell the user explicitly instead of
        // silently handing back a preview with no model.
        const stlWarnLine = stderr?.toString().split('\n').find((l) => l.includes('STL_WARN:'));
        result.warning = stlWarnLine
          ? `Aperçu généré, mais la vue 3D a échoué : ${stlWarnLine.replace('STL_WARN:', '').trim()}`
          : "Aperçu généré, mais la vue 3D (modèle STL) n'a pas pu être générée.";
      }
    }

    return result;
  } catch (e) {
    const stepLog = await readStepLog();
    const logSuffix = stepLog ? `\n\nDétail des étapes :\n${stepLog}` : '';

    // Any failure here (timeout kill, or cscript.exe crashing outright) is
    // an ABNORMAL exit — the .vbs script's own cleanup (which closes
    // SolidWorks only if it started it) only runs on a NORMAL exit, so it
    // never gets a chance to run in either case. Cleaning up here, on every
    // error path, is the only place that's guaranteed to run regardless of
    // why cscript.exe stopped.
    const killedPids = await killOrphanedSldworksProcesses(pidsBefore);
    const cleanupNote = killedPids.length
      ? ` (instance(s) SolidWorks orpheline(s) fermée(s) automatiquement : PID ${killedPids.join(', ')})`
      : '';

    // A timeout kill leaves stderr empty (cscript never got to write to it)
    // — that blank-error shape usually means SolidWorks popped a dialog
    // (e.g. asking to resolve/locate a missing referenced part) and is
    // sitting there waiting for a click nobody can give it headlessly.
    if (e.killed && e.signal) {
      return {
        success: false,
        error: `L'ouverture a dépassé le délai de ${Math.round(timeoutMs / 60_000)} min et a été interrompue. ` +
          "Le fichier est peut-être très volumineux, ou SolidWorks attend une réponse à une boîte de dialogue " +
          "(référence introuvable, etc.) — ouvrez le fichier manuellement dans SolidWorks pour vérifier." +
          cleanupNote + logSuffix,
      };
    }
    // Otherwise execFile errors include stderr, which carries the
    // VBScript/COM exception message — surface that, it's the actionable part.
    // If stderr is also empty, cscript.exe likely crashed outright — the
    // step log is then the only real diagnostic available.
    const detail = e.stderr?.toString().trim() || e.message;
    return { success: false, error: detail + cleanupNote + logSuffix };
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
