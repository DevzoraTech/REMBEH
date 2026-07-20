import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let cachedSoffice: string | null | undefined;

async function findSoffice(): Promise<string | null> {
  if (cachedSoffice !== undefined) return cachedSoffice;

  const candidates = [
    process.env.LIBREOFFICE_PATH?.trim(),
    'soffice',
    'libreoffice',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ].filter((value): value is string => Boolean(value));

  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['--version'], { timeout: 15_000 });
      cachedSoffice = bin;
      return bin;
    } catch {
      // try next
    }
  }

  cachedSoffice = null;
  return null;
}

/**
 * Converts a filled DOCX buffer to PDF via LibreOffice headless.
 * Returns null when LibreOffice is not installed (caller should fall back).
 */
export async function convertDocxToPdfWithLibreOffice(
  docxBytes: Buffer,
): Promise<Buffer | null> {
  const soffice = await findSoffice();
  if (!soffice) return null;

  const workDir = await mkdtemp(join(tmpdir(), 'rembeh-loan-agr-'));
  const docxPath = join(workDir, 'agreement.docx');
  const pdfPath = join(workDir, 'agreement.pdf');

  try {
    await writeFile(docxPath, docxBytes);
    // writer_pdf_Export keeps Writer layout (fonts, inline images) closer to the DOCX.
    await execFileAsync(
      soffice,
      [
        '--headless',
        '--nologo',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        '--convert-to',
        'pdf:writer_pdf_Export',
        '--outdir',
        workDir,
        docxPath,
      ],
      {
        timeout: 90_000,
        env: {
          ...process.env,
          HOME: workDir,
        },
      },
    );
    return await readFile(pdfPath);
  } catch {
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function isLibreOfficeAvailable(): Promise<boolean> {
  return (await findSoffice()) != null;
}
