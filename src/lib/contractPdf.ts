import { jsPDF } from 'jspdf';
import type { Contract } from '../api/contracts.ts';
import { isHexColor, type VendorBrandSettings } from '../api/brand.ts';
import { applyArabicFont, PDF_FONT } from './pdf/arabicFont.ts';
import { fitInBox, loadPdfImage, type PdfImage } from './pdf/images.ts';
import { tafqeetSAR } from './pdf/tafqeet.ts';
import { CONTRACT_STATUS_LABEL, LEGACY_LABEL, deviceLabel, riyadhStampLatin } from './contracts.ts';

/**
 * The contract as a PDF, on the same stack as the invoices (Amiri + our bidi
 * pass, brand colour and logo). A signed contract carries the client's drawn
 * signature and the proof block: typed name, time in Riyadh, IP, device and
 * the content fingerprint the client signed.
 */

type Rgb = [number, number, number];
const NAVY: Rgb = [10, 26, 51];
const GOLD: Rgb = [192, 161, 107];
const MUTED: Rgb = [100, 116, 139];
const INK: Rgb = [15, 23, 42];
const LINE: Rgb = [226, 232, 240];

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function inkOn([r, g, b]: Rgb): Rgb {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? INK : [255, 255, 255];
}

function money(value: number): string {
  return `${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

function imageFromDataUrl(doc: jsPDF, dataUrl: string): PdfImage | null {
  if (!/^data:image\/png;base64,/.test(dataUrl)) return null;
  try {
    const props = doc.getImageProperties(dataUrl);
    return { dataUrl, width: props.width, height: props.height };
  } catch {
    return null;
  }
}

export async function buildContractPdf(contract: Contract, brand: VendorBrandSettings): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await applyArabicFont(doc);
  const logo = await loadPdfImage(brand.logoUrl);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const right = pageWidth - margin;
  const width = pageWidth - margin * 2;
  const bottom = pageHeight - 24;
  const band = isHexColor(brand.primaryColor) ? hexToRgb(brand.primaryColor) : NAVY;
  let y = 0;

  const ensure = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = 18;
    }
  };

  const heading = (label: string) => {
    ensure(12);
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...band);
    doc.text(label, right, y, { align: 'right' });
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.line(margin, y + 2, right, y + 2);
    y += 8;
  };

  /** A right-aligned label: value row, wrapped. */
  const row = (label: string, value: string) => {
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(label ? `${label}: ${value || '—'}` : value || '—', width) as string[];
    ensure(lines.length * 5 + 1);
    doc.setFont(PDF_FONT, 'normal');
    doc.setTextColor(...INK);
    for (const line of lines) {
      doc.text(line, right, y, { align: 'right' });
      y += 5;
    }
    y += 0.5;
  };

  // ── Header band ──
  doc.setFillColor(...band);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 26, pageWidth, 1.6, 'F');
  doc.setTextColor(...inkOn(band));
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(16);
  doc.text('عقد تقديم خدمات', right, 12, { align: 'right' });
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.text(`Service Contract | ${contract.number}`, right, 19, { align: 'right' });
  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(CONTRACT_STATUS_LABEL[contract.status] || contract.status, margin, 12);
  y = 36;

  // ── Vendor identity ──
  if (logo) {
    const box = 18;
    const { w, h } = fitInBox(logo, box);
    doc.addImage(logo.dataUrl, 'PNG', right - box + (box - w) / 2, 30 + (box - h) / 2, w, h);
  }
  const textRight = logo ? right - 22 : right;
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(brand.brandName || contract.vendorName, textRight, 37, { align: 'right' });
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const idLine = [brand.crNumber ? `س.ت ${brand.crNumber}` : '', brand.city, brand.phone].filter(Boolean).join(' • ');
  if (idLine) doc.text(idLine, textRight, 43, { align: 'right' });
  y = logo ? 54 : 50;

  if (contract.legacy) {
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(248, 113, 113);
    doc.roundedRect(margin, y - 4, width, 9, 1.5, 1.5, 'FD');
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(185, 28, 28);
    doc.text(LEGACY_LABEL, right - 3, y + 1.8, { align: 'right' });
    y += 11;
  }

  // ── Parties ──
  heading('أطراف العقد');
  row('الطرف الأول (المورّد)', [contract.vendorName, brand.crNumber ? `س.ت ${brand.crNumber}` : ''].filter(Boolean).join(' — '));
  row(
    'الطرف الثاني (العميل)',
    [
      contract.client.name,
      contract.client.phone ? `جوال ${contract.client.phone}` : '',
      contract.client.nationalId ? `هوية ${contract.client.nationalId}` : '',
    ]
      .filter(Boolean)
      .join(' — '),
  );
  y += 2;

  // ── Event ──
  heading('المناسبة والخدمة');
  row('الخدمة', contract.event.service);
  row('التاريخ', [contract.event.date, contract.event.time].filter(Boolean).join(' '));
  row('الموقع', contract.event.location);
  y += 2;

  // ── Amounts ──
  heading('القيمة والدفعات');
  ensure(24);
  const colW = width / 3;
  const cells: Array<[string, number]> = [
    ['إجمالي العقد', contract.amounts.total],
    ['العربون', contract.amounts.deposit],
    ['المتبقي', contract.amounts.remaining],
  ];
  cells.forEach(([label, value], index) => {
    const x = right - colW * (index + 1);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...LINE);
    doc.roundedRect(x + 1, y - 3, colW - 2, 15, 1.5, 1.5, 'FD');
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(label, x + colW - 4, y + 2, { align: 'right' });
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(money(value), x + colW - 4, y + 9, { align: 'right' });
  });
  y += 17;
  const words = tafqeetSAR(contract.amounts.total);
  if (words) row('الإجمالي كتابةً', words);
  y += 2;

  // ── Terms ──
  heading('البنود');
  contract.terms.forEach((term, index) => {
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(`${index + 1}. ${term}`, width - 2) as string[];
    ensure(lines.length * 5 + 1.5);
    doc.setFont(PDF_FONT, 'normal');
    doc.setTextColor(...INK);
    for (const line of lines) {
      doc.text(line, right, y, { align: 'right' });
      y += 5;
    }
    y += 1.5;
  });
  if (contract.notes) {
    y += 1;
    heading('ملاحظات');
    for (const paragraph of contract.notes.split('\n')) row('', paragraph);
  }
  y += 3;

  // ── Signatures ──
  heading('التوقيعات');
  ensure(46);
  const boxW = (width - 6) / 2;
  const boxH = 40;
  const vendorX = right - boxW;
  const clientX = margin;
  doc.setDrawColor(...LINE);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(vendorX, y - 3, boxW, boxH, 2, 2, 'FD');
  doc.roundedRect(clientX, y - 3, boxW, boxH, 2, 2, 'FD');

  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...band);
  doc.text('الطرف الأول — صادر من المورّد', vendorX + boxW - 4, y + 2, { align: 'right' });
  doc.text('الطرف الثاني — توقيع العميل', clientX + boxW - 4, y + 2, { align: 'right' });

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(contract.vendorSignature?.name || contract.vendorName, vendorX + boxW - 4, y + 12, { align: 'right' });
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(contract.vendorSignature ? riyadhStampLatin(contract.vendorSignature.at) : 'لم يُرسل بعد', vendorX + boxW - 4, y + 18, {
    align: 'right',
  });

  const signature = contract.signature;
  const sigImage = signature?.image ? imageFromDataUrl(doc, signature.image) : null;
  if (sigImage) {
    const maxW = boxW - 10;
    const maxH = 18;
    const ratio = sigImage.width / sigImage.height;
    const w = Math.min(maxW, maxH * ratio);
    const h = w / ratio;
    doc.addImage(sigImage.dataUrl, 'PNG', clientX + (boxW - w) / 2, y + 5, w, h);
  }
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  if (signature) {
    doc.text(signature.name, clientX + boxW - 4, y + 28, { align: 'right' });
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(riyadhStampLatin(signature.signedAt), clientX + boxW - 4, y + 33.5, { align: 'right' });
  } else {
    doc.setTextColor(...MUTED);
    doc.text('بانتظار توقيع العميل', clientX + boxW - 4, y + 16, { align: 'right' });
  }
  y += boxH + 4;

  // ── Proof ──
  if (signature && !contract.legacy) {
    heading('إثبات التوقيع الإلكتروني');
    row('الاسم كما كتبه العميل', signature.name);
    row('وقت التوقيع', riyadhStampLatin(signature.signedAt));
    row('عنوان IP', signature.ip || '—');
    row('الجهاز', deviceLabel(signature.userAgent));
    row('بصمة المحتوى', 'SHA-256');
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    ensure(6);
    doc.text(signature.contentHash, margin, y, { maxWidth: width });
    y += 6;
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const proofNote = doc.splitTextToSize(
      'وقّع العميل بنفسه على رابط خاص أُرسل له، بعد الموافقة على جميع البنود. البصمة تثبت أن النص الموقّع هو هذا النص دون تعديل.',
      width,
    ) as string[];
    ensure(proofNote.length * 4);
    for (const line of proofNote) {
      doc.text(line, right, y, { align: 'right' });
      y += 4;
    }
  } else if (signature && contract.legacy) {
    heading('ملاحظة التوقيع');
    row('', signature.note || LEGACY_LABEL);
  }

  // ── Footers ──
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const footerY = pageHeight - 14;
    doc.setDrawColor(...LINE);
    doc.line(margin, footerY, right, footerY);
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated electronically via Usil.', margin, footerY + 5);
    doc.text(`Contract: ${contract.number} | Page ${page} of ${pages}`, right, footerY + 5, { align: 'right' });
  }
  return doc;
}

export function contractFileName(contract: Contract): string {
  return `Contract-${contract.number}${contract.status === 'signed' ? '-signed' : ''}.pdf`;
}

export async function downloadContractPdf(contract: Contract, brand: VendorBrandSettings): Promise<void> {
  const doc = await buildContractPdf(contract, brand);
  doc.save(contractFileName(contract));
}

/** Print: the caller opens `tab` inside the click (popup blockers); the PDF fills it. */
export async function printContractPdf(contract: Contract, brand: VendorBrandSettings, tab: Window | null): Promise<void> {
  try {
    const doc = await buildContractPdf(contract, brand);
    doc.autoPrint();
    const url = URL.createObjectURL(doc.output('blob'));
    if (tab && !tab.closed) tab.location.href = url;
    else doc.save(contractFileName(contract));
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
