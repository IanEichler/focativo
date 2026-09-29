import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const WORD_EXPORT_SCRIPT = `
param([string]$InputPath, [string]$OutputPath)
$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($InputPath, $false, $true)
  $document.ExportAsFixedFormat($OutputPath, 17)
} finally {
  if ($document -ne $null) {
    $document.Close(0)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document)
  }
  if ($word -ne $null) {
    $word.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
}
`;

/** Converte o DOCX final com Word no Windows ou LibreOffice headless na VPS. */
export async function convertDocxToPdf(docx: Buffer): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "estoque-ia-doc-"));
  const inputPath = path.join(directory, "contrato.docx");
  const outputPath = path.join(directory, "contrato.pdf");

  try {
    await writeFile(inputPath, docx);
    if (process.platform === "win32" && !process.env.LIBREOFFICE_BIN) {
      const scriptPath = path.join(directory, "convert.ps1");
      await writeFile(scriptPath, WORD_EXPORT_SCRIPT, "utf8");
      await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-File", scriptPath, inputPath, outputPath],
        {
          timeout: 90000,
          windowsHide: true,
        },
      );
    } else {
      await execFileAsync(
        process.env.LIBREOFFICE_BIN || "soffice",
        ["--headless", "--convert-to", "pdf:writer_pdf_Export", "--outdir", directory, inputPath],
        { timeout: 90000, windowsHide: true },
      );
    }
    const pdf = await readFile(outputPath);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("invalid_pdf_output");
    return pdf;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
