import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = process.cwd();
const inputPath = path.join(root, 'docs', 'Project-Tech-Stack-and-Features.md');
const outputPath = path.join(root, 'Project-Tech-Stack-and-Features.pdf');

function wrapLine(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

const md = await fs.readFile(inputPath, 'utf8');
const rawLines = md.replace(/\r\n/g, '\n').split('\n');

const pdfDoc = await PDFDocument.create();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

const PAGE_W = 595.28; // A4 width
const PAGE_H = 841.89; // A4 height
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAX_CHARS = 100;

let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
let y = PAGE_H - MARGIN;

function ensureSpace(heightNeeded) {
  if (y - heightNeeded < MARGIN) {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }
}

function drawTextLine(text, opts = {}) {
  const {
    size = 11,
    bold = false,
    indent = 0,
    color = rgb(0.1, 0.1, 0.1),
    spacingAfter = 4,
  } = opts;
  ensureSpace(size + spacingAfter + 2);
  page.drawText(text, {
    x: MARGIN + indent,
    y: y - size,
    size,
    font: bold ? fontBold : font,
    color,
    maxWidth: CONTENT_W - indent,
  });
  y -= size + spacingAfter;
}

for (const line of rawLines) {
  if (!line.trim()) {
    y -= 6;
    continue;
  }

  if (line.startsWith('# ')) {
    drawTextLine(line.replace(/^#\s+/, ''), { size: 20, bold: true, spacingAfter: 8, color: rgb(0.05, 0.2, 0.45) });
    continue;
  }

  if (line.startsWith('## ')) {
    y -= 2;
    drawTextLine(line.replace(/^##\s+/, ''), { size: 14, bold: true, spacingAfter: 6, color: rgb(0.1, 0.3, 0.55) });
    continue;
  }

  if (line.startsWith('### ')) {
    drawTextLine(line.replace(/^###\s+/, ''), { size: 12, bold: true, spacingAfter: 4 });
    continue;
  }

  const isBullet = /^-\s+/.test(line.trim());
  const cleaned = line.replace(/^\s*-\s+/, '');
  const wrapped = wrapLine(cleaned, isBullet ? MAX_CHARS - 6 : MAX_CHARS);

  wrapped.forEach((chunk, idx) => {
    if (isBullet) {
      const prefix = idx === 0 ? '• ' : '  ';
      drawTextLine(`${prefix}${chunk}`, { size: 11, indent: 10, spacingAfter: 3 });
    } else {
      drawTextLine(chunk, { size: 11, spacingAfter: 3 });
    }
  });
}

const bytes = await pdfDoc.save();
await fs.writeFile(outputPath, bytes);

console.log(`PDF generated: ${outputPath}`);
