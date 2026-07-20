import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import type { LoanAgreementMergeFields } from './loan-agreement-fields';

const DOCUMENT_XML = 'word/document.xml';
const DOCUMENT_RELS = 'word/_rels/document.xml.rels';
const CONTENT_TYPES = '[Content_Types].xml';

const SIGNATURE_FIELD_KEYS = [
  'borrower_signature',
  'guarantor_signature',
  'agent_signature',
] as const;

export type LoanAgreementSignatureFieldKey =
  (typeof SIGNATURE_FIELD_KEYS)[number];

export type LoanAgreementSignatureImages = Partial<
  Record<LoanAgreementSignatureFieldKey, Uint8Array | null | undefined>
>;

/** Max display size for signature images in the DOCX (EMU: 914400 = 1 inch). */
const SIG_MAX_WIDTH_EMU = 2_011_680; // ~2.2"
const SIG_MAX_HEIGHT_EMU = 685_800; // ~0.75"

/**
 * Resolves the Loan-agreement DOCX template path.
 * Prefers services/api/assets/loan-agreement.docx (WorkingDirectory), then repo asset.
 */
export function resolveLoanAgreementTemplatePath(): string {
  const fromEnv = process.env.LOAN_AGREEMENT_TEMPLATE_PATH?.trim();
  const candidates = [
    fromEnv,
    join(process.cwd(), 'assets', 'loan-agreement.docx'),
    join(process.cwd(), '..', '..', 'product-idea-assets', 'Loan-agreement .docx'),
    join(__dirname, '..', '..', '..', 'assets', 'loan-agreement.docx'),
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'product-idea-assets',
      'Loan-agreement .docx',
    ),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    'Loan agreement DOCX template not found. Expected services/api/assets/loan-agreement.docx or product-idea-assets/Loan-agreement .docx',
  );
}

/**
 * Fills <<merge fields>> in the DOCX template (document + headers + footers)
 * and optionally embeds signature PNGs inline at signature placeholders.
 */
export async function fillLoanAgreementDocx(
  fields: LoanAgreementMergeFields,
  templatePath = resolveLoanAgreementTemplatePath(),
  signatures?: LoanAgreementSignatureImages,
): Promise<Buffer> {
  const templateBytes = await readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBytes);
  const documentFile = zip.file(DOCUMENT_XML);
  if (!documentFile) {
    throw new Error(`DOCX missing ${DOCUMENT_XML}`);
  }

  const xmlParts = listMergeableXmlPaths(zip);
  for (const partPath of xmlParts) {
    const part = zip.file(partPath);
    if (!part) continue;
    let xml = await part.async('string');
    xml = coalesceSplitPlaceholders(xml);
    xml = replaceMergeFieldsInXml(xml, fields);
    if (partPath === DOCUMENT_XML) {
      if (signatures) {
        const embedded = await embedSignatureImagesInDocx(zip, xml, signatures);
        xml = embedded.xml;
      } else {
        xml = clearSignaturePlaceholders(xml);
      }
    } else {
      // Headers/footers never host signature images.
      xml = clearSignaturePlaceholders(xml);
    }
    zip.file(partPath, xml);
  }

  return Buffer.from(
    await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
    }),
  );
}

/** document.xml plus any header/footer parts that may contain <<placeholders>>. */
export function listMergeableXmlPaths(zip: JSZip): string[] {
  const paths = new Set<string>([DOCUMENT_XML]);
  for (const name of Object.keys(zip.files)) {
    if (/^word\/(header|footer)\d+\.xml$/i.test(name) && !zip.files[name]?.dir) {
      paths.add(name);
    }
  }
  return [...paths].sort();
}

/**
 * Word often splits `&lt;&lt;token&gt;&gt;` across adjacent w:t runs (spell-check).
 * Rebuild w:t values from the joined plain text when a token spans multiple runs.
 */
export function coalesceSplitPlaceholders(xml: string): string {
  const matches = [...xml.matchAll(/<w:t(\b[^>]*)>([^<]*)<\/w:t>/g)];
  if (matches.length === 0) return xml;

  const texts = matches.map((m) => m[2] ?? '');
  const joined = texts.join('');
  // Allow whitespace/newlines Word inserts inside a split token.
  const looseTokenRe = /&lt;&lt;\s*([A-Za-z0-9_]+)\s*&gt;&gt;/g;
  const needsFix = [...joined.matchAll(looseTokenRe)].some((m) => {
    const tight = `&lt;&lt;${m[1]}&gt;&gt;`;
    return !texts.some((t) => t.includes(tight));
  });
  if (!needsFix) return xml;

  // Character → owning w:t index
  const owner: number[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    for (let c = 0; c < texts[i]!.length; c += 1) owner.push(i);
  }

  const next = [...texts];
  for (const match of joined.matchAll(looseTokenRe)) {
    const key = match[1]!;
    const tight = `&lt;&lt;${key}&gt;&gt;`;
    if (next.some((t) => t.includes(tight))) continue;

    const start = match.index ?? 0;
    const end = start + match[0]!.length;
    const startNode = owner[start];
    const endNode = owner[end - 1];
    if (startNode == null || endNode == null) continue;

    let offsetInStart = 0;
    for (let i = 0; i < start; i += 1) {
      if (owner[i] === startNode) offsetInStart += 1;
    }
    let offsetInEnd = 0;
    for (let i = 0; i < end; i += 1) {
      if (owner[i] === endNode) offsetInEnd += 1;
    }

    const prefix = next[startNode]!.slice(0, offsetInStart);
    const suffix = next[endNode]!.slice(offsetInEnd);
    next[startNode] = `${prefix}${tight}`;
    for (let n = startNode + 1; n <= endNode; n += 1) {
      next[n] = n === endNode ? suffix : '';
    }
  }

  let i = 0;
  return xml.replace(/<w:t(\b[^>]*)>([^<]*)<\/w:t>/g, (_full, attrs: string) => {
    const value = next[i] ?? '';
    i += 1;
    return `<w:t${attrs}>${value}</w:t>`;
  });
}

/**
 * Replaces <<key>> placeholders. Values are XML-escaped.
 * Signature keys are skipped — they are handled by image embedding / clear.
 */
export function replaceMergeFieldsInXml(
  xml: string,
  fields: LoanAgreementMergeFields,
): string {
  let result = coalesceSplitPlaceholders(xml);
  for (const [key, value] of Object.entries(fields)) {
    if ((SIGNATURE_FIELD_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    const escaped = escapeXmlText(value);
    const patterns = [
      `&lt;&lt;${escapeRegex(key)}&gt;&gt;`,
      `&lt;&lt;${escapeRegex(key)}&gt;`,
      `&lt;${escapeRegex(key)}&gt;&gt;`,
    ];
    for (const pattern of patterns) {
      result = result.replace(new RegExp(pattern, 'g'), escaped);
    }
  }
  return result;
}

export function clearSignaturePlaceholders(xml: string): string {
  let result = coalesceSplitPlaceholders(xml);
  for (const key of SIGNATURE_FIELD_KEYS) {
    result = result.replace(
      new RegExp(`&lt;&lt;${escapeRegex(key)}&gt;&gt;`, 'g'),
      '',
    );
  }
  return result;
}

async function embedSignatureImagesInDocx(
  zip: JSZip,
  documentXml: string,
  signatures: LoanAgreementSignatureImages,
): Promise<{ xml: string }> {
  let xml = ensureDrawingNamespaces(documentXml);
  const relsFile = zip.file(DOCUMENT_RELS);
  let relsXml = relsFile
    ? await relsFile.async('string')
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  let nextRelId = nextRelationshipId(relsXml);
  let docPrId = 1;
  let contentTypes = await readContentTypes(zip);
  contentTypes = ensurePngContentType(contentTypes);

  for (const key of SIGNATURE_FIELD_KEYS) {
    const png = signatures[key];
    const token = `&lt;&lt;${key}&gt;&gt;`;
    if (!png || png.byteLength === 0) {
      xml = xml.replace(new RegExp(escapeRegex(token), 'g'), '');
      continue;
    }

    const mediaName = `signature_${key}.png`;
    const mediaPath = `word/media/${mediaName}`;
    zip.file(mediaPath, Buffer.from(png));

    const relId = `rId${nextRelId}`;
    nextRelId += 1;
    relsXml = addImageRelationship(relsXml, relId, `media/${mediaName}`);

    const { width, height } = readPngSize(png);
    const { cx, cy } = fitSignatureEmu(width, height);
    const drawingRun = buildInlineImageRun({
      relId,
      name: key,
      docPrId,
      cx,
      cy,
    });
    docPrId += 1;

    xml = replaceSignatureRunWithDrawing(xml, key, drawingRun);
  }

  zip.file(DOCUMENT_RELS, relsXml);
  zip.file(CONTENT_TYPES, contentTypes);
  return { xml };
}

function replaceSignatureRunWithDrawing(
  xml: string,
  key: string,
  drawingRun: string,
): string {
  const token = `&lt;&lt;${key}&gt;&gt;`;
  // Prefer replacing the whole w:r that contains the placeholder.
  const runPattern = new RegExp(
    `<w:r\\b[^>]*>[\\s\\S]*?${escapeRegex(token)}[\\s\\S]*?<\\/w:r>`,
  );
  if (runPattern.test(xml)) {
    return xml.replace(runPattern, drawingRun);
  }
  // Fallback: replace the token text only.
  return xml.replace(token, `</w:t></w:r>${drawingRun}<w:r><w:t>`);
}

function buildInlineImageRun(input: {
  relId: string;
  name: string;
  docPrId: number;
  cx: number;
  cy: number;
}): string {
  const { relId, name, docPrId, cx, cy } = input;
  return (
    `<w:r>` +
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${docPrId}" name="${escapeXmlText(name)}"/>` +
    `<wp:cNvGraphicFramePr>` +
    `<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>` +
    `</wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="0" name="${escapeXmlText(name)}.png"/>` +
    `<pic:cNvPicPr/>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip r:embed="${relId}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr>` +
    `<a:xfrm>` +
    `<a:off x="0" y="0"/>` +
    `<a:ext cx="${cx}" cy="${cy}"/>` +
    `</a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>` +
    `</w:r>`
  );
}

function ensureDrawingNamespaces(xml: string): string {
  let result = xml;
  if (!/xmlns:a=/.test(result)) {
    result = result.replace(
      /<w:document\b/,
      '<w:document xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    );
  }
  if (!/xmlns:pic=/.test(result)) {
    result = result.replace(
      /<w:document\b/,
      '<w:document xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
    );
  }
  return result;
}

function nextRelationshipId(relsXml: string): number {
  let max = 0;
  for (const match of relsXml.matchAll(/\bId="rId(\d+)"/g)) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function addImageRelationship(
  relsXml: string,
  relId: string,
  target: string,
): string {
  const relationship =
    `<Relationship Id="${relId}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
    `Target="${target}"/>`;
  if (relsXml.includes('</Relationships>')) {
    return relsXml.replace('</Relationships>', `${relationship}</Relationships>`);
  }
  return `${relsXml}${relationship}`;
}

async function readContentTypes(zip: JSZip): Promise<string> {
  const file = zip.file(CONTENT_TYPES);
  if (!file) {
    throw new Error(`DOCX missing ${CONTENT_TYPES}`);
  }
  return file.async('string');
}

function ensurePngContentType(contentTypesXml: string): string {
  if (/Extension="png"/i.test(contentTypesXml)) {
    return contentTypesXml;
  }
  const pngDefault =
    '<Default Extension="png" ContentType="image/png"/>';
  if (contentTypesXml.includes('</Types>')) {
    return contentTypesXml.replace('</Types>', `${pngDefault}</Types>`);
  }
  return `${contentTypesXml}${pngDefault}`;
}

/** Read PNG IHDR width/height; falls back to a reasonable signature aspect. */
export function readPngSize(png: Uint8Array): {
  width: number;
  height: number;
} {
  if (png.byteLength < 24) {
    return { width: 400, height: 150 };
  }
  const width =
    (png[16]! << 24) | (png[17]! << 16) | (png[18]! << 8) | png[19]!;
  const height =
    (png[20]! << 24) | (png[21]! << 16) | (png[22]! << 8) | png[23]!;
  if (width <= 0 || height <= 0) {
    return { width: 400, height: 150 };
  }
  return { width, height };
}

export function fitSignatureEmu(
  pixelWidth: number,
  pixelHeight: number,
): { cx: number; cy: number } {
  const aspect = pixelWidth / pixelHeight;
  let cx = SIG_MAX_WIDTH_EMU;
  let cy = Math.round(cx / aspect);
  if (cy > SIG_MAX_HEIGHT_EMU) {
    cy = SIG_MAX_HEIGHT_EMU;
    cx = Math.round(cy * aspect);
  }
  return { cx, cy };
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
