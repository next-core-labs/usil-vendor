import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { VendorBrandSettings } from '../../api/brand.ts';
import { isHexColor, isValidSaudiVatNumber } from '../../api/brand.ts';
import type { VendorInvoice } from '../../api/invoices.ts';
import { tafqeetSAR } from './tafqeet.ts';
import { applyArabicFont, PDF_FONT } from './arabicFont.ts';
import { encodeQrMatrix } from '../qrMatrix.ts';
import { fitInBox, loadPdfImage, type PdfImage } from './images.ts';

/**
 * Invoice and receipt PDFs, ported from the old dashboard
 * (`usil/src/utils/zatcaPdfExporter.ts`) and extended with the vendor's logo,
 * stamp and brand colour.
 *
 * Honesty rules kept from the old exporter: only a vendor with a VALID Saudi
 * VAT number gets a «فاتورة ضريبية مبسطة» with the ZATCA phase-1 TLV QR; anyone
 * else gets a plain «فاتورة» with no QR and no tax-invoice claim. Nothing in
 * these documents claims e-invoicing (phase-2 / FATOORA) compliance.
 */

type Rgb = [number, number, number];

const NAVY: Rgb = [10, 26, 51];
const GOLD: Rgb = [192, 161, 107];

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

/** Brand colour for the header band, falling back to navy. */
function brandRgb(brand: VendorBrandSettings): Rgb {
  return isHexColor(brand.primaryColor) ? hexToRgb(brand.primaryColor) : NAVY;
}

/** White text on dark bands, near-black on light ones. */
function inkOn([r, g, b]: Rgb): Rgb {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? [15, 23, 42] : [255, 255, 255];
}

/** ISO-8601 timestamp (seconds precision, UTC) for a `YYYY-MM-DD` issue date in Riyadh. */
function zatcaTimestamp(issueDate: string | undefined): string {
  const d =
    issueDate && /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? new Date(`${issueDate}T00:00:00+03:00`) : new Date();
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function newA4(): jsPDF {
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
}

function money(value: number): string {
  return `${(Number(value) || 0).toFixed(2)} SAR`;
}

/**
 * ZATCA phase-1 QR payload: TLV (tag, length, UTF-8 value) base64-encoded.
 * 1 seller name · 2 VAT number · 3 timestamp · 4 total with VAT · 5 VAT total.
 */
export function generateZatcaTlvBase64(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  totalAmount: number,
  vatAmount: number,
): string {
  const encoder = new TextEncoder();
  const tlv = (tag: number, value: string): Uint8Array => {
    // One length byte: clip at 255 bytes (a seller name never gets near it).
    let bytes = encoder.encode(value);
    if (bytes.length > 255) bytes = bytes.slice(0, 255);
    const out = new Uint8Array(2 + bytes.length);
    out[0] = tag;
    out[1] = bytes.length;
    out.set(bytes, 2);
    return out;
  };
  const tags = [
    tlv(1, sellerName),
    tlv(2, vatNumber),
    tlv(3, timestamp || new Date().toISOString()),
    tlv(4, totalAmount.toFixed(2)),
    tlv(5, vatAmount.toFixed(2)),
  ];
  const combined = new Uint8Array(tags.reduce((sum, tag) => sum + tag.length, 0));
  let offset = 0;
  for (const tag of tags) {
    combined.set(tag, offset);
    offset += tag.length;
  }
  let binary = '';
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

/** Draws a real, scannable QR code of `qrText`. */
async function drawQrCode(doc: jsPDF, x: number, y: number, size: number, qrText: string, caption: string) {
  const matrix = await encodeQrMatrix(qrText);
  const quiet = 2;
  const cell = size / (matrix.length + quiet * 2);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, 'F');
  doc.setFillColor(0, 0, 0);
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      // Slight overlap avoids hairline gaps between modules in some viewers.
      if (dark) doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.02, cell + 0.02, 'F');
    }),
  );
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(caption, x + size / 2, y + size + 3.5, { align: 'center' });
}

function drawImage(doc: jsPDF, image: PdfImage, x: number, y: number, box: number) {
  const { w, h } = fitInBox(image, box);
  // Centre inside the box so a wide logo and a square one sit on the same line.
  doc.addImage(image.dataUrl, 'PNG', x + (box - w) / 2, y + (box - h) / 2, w, h);
}

/** «Page n of N» footer on every page, drawn last so the count is known. */
function drawFooters(doc: jsPDF, margin: number, idLabel: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const footerY = pageHeight - 18;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, footerY, pageWidth - margin, footerY);
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated electronically via Usil.', margin, footerY + 5);
    doc.text(`${idLabel} | Page ${page} of ${pages}`, pageWidth - margin, footerY + 5, { align: 'right' });
  }
}

const STATUS_PDF: Record<string, { text: string; fill: Rgb }> = {
  paid: { text: 'مدفوعة | PAID', fill: [16, 185, 129] },
  partial: { text: 'مدفوعة جزئياً | PARTIAL', fill: [21, 94, 239] },
  unpaid: { text: 'غير مدفوعة | UNPAID', fill: [245, 158, 11] },
  draft: { text: 'مسودة | DRAFT', fill: [100, 116, 139] },
};

/**
 * The invoice as a jsPDF document. A simplified tax invoice with a real ZATCA
 * (phase 1) TLV QR when the vendor has a valid Saudi VAT number and the
 * invoice carries VAT; otherwise a plain invoice with no QR.
 */
export async function buildInvoicePdf(invoice: VendorInvoice, brand: VendorBrandSettings): Promise<jsPDF> {
  const doc = newA4();
  await applyArabicFont(doc);
  const [logo, stamp] = await Promise.all([loadPdfImage(brand.logoUrl), loadPdfImage(brand.stampUrl)]);

  const taxRate = Number(invoice.taxRate) || 0;
  const withVat = taxRate > 0;
  const taxInvoice = withVat && isValidSaudiVatNumber(brand.vatNumber);
  const vatPct = Math.round(taxRate * 100);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const band = brandRgb(brand);
  const bandInk = inkOn(band);

  // Header band in the brand colour, with a thin gold rule under it.
  doc.setFillColor(...band);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 28, pageWidth, 2, 'F');

  doc.setTextColor(...bandInk);
  doc.setFontSize(16);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(taxInvoice ? 'SIMPLIFIED TAX INVOICE | فاتورة ضريبية مبسطة' : 'INVOICE | فاتورة', margin, 12);
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, 'normal');
  doc.text(
    taxInvoice ? `VAT ${vatPct}% | ضريبة القيمة المضافة` : 'المملكة العربية السعودية',
    margin,
    19,
  );

  const status = STATUS_PDF[invoice.status] || STATUS_PDF.unpaid;
  doc.setFillColor(...status.fill);
  doc.roundedRect(pageWidth - margin - 40, 7, 40, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(status.text, pageWidth - margin - 20, 14.5, { align: 'center' });

  // Seller block (logo + details) on the left, the ZATCA QR on the right.
  const logoBox = 20;
  if (logo) drawImage(doc, logo, margin, 34, logoBox);
  const textX = margin + (logo ? logoBox + 4 : 0);
  let curY = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(brand.brandName || '—', textX, curY);

  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(71, 85, 105);
  curY += 5;
  const sellerLines = [
    brand.slogan,
    // An invalid number is never printed: it would read as a tax registration.
    isValidSaudiVatNumber(brand.vatNumber) ? `VAT No.: ${brand.vatNumber.replace(/\s/g, '')} | الرقم الضريبي` : '',
    brand.crNumber ? `CR: ${brand.crNumber} | السجل التجاري` : '',
    [brand.city, brand.address].filter(Boolean).join('، '),
    [brand.phone ? `Contact: ${brand.phone}` : '', brand.email ? `Email: ${brand.email}` : ''].filter(Boolean).join(' | '),
  ].filter(Boolean);
  // The header note takes the last line of this block when there is one.
  for (const line of sellerLines.slice(0, brand.invoiceHeaderNote ? 4 : 5)) {
    doc.text(line, textX, curY);
    curY += 4.5;
  }

  const qrSize = 25;
  if (taxInvoice) {
    const tlv = generateZatcaTlvBase64(
      brand.brandName || brand.accountHolder || 'Vendor',
      brand.vatNumber.replace(/\s/g, ''),
      zatcaTimestamp(invoice.issueDate),
      invoice.total,
      invoice.taxAmount,
    );
    await drawQrCode(doc, pageWidth - margin - qrSize, 33, qrSize, tlv, 'رمز QR للفاتورة الضريبية');
  }

  if (brand.invoiceHeaderNote) {
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const width = pageWidth - margin * 2 - (taxInvoice ? qrSize + 6 : 0);
    const [first] = doc.splitTextToSize(brand.invoiceHeaderNote, width) as string[];
    if (first) doc.text(first, margin, 61);
  }

  // Invoice & customer box.
  curY = 64;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, curY, pageWidth - margin * 2, 28, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, curY, pageWidth - margin * 2, 28, 2, 2, 'S');

  const col1X = margin + 4;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont(PDF_FONT, 'bold');
  doc.text('INVOICE NO:', col1X, curY + 6);
  doc.text('ISSUE DATE:', col1X, curY + 12);
  doc.text('EVENT DATE:', col1X, curY + 18);
  doc.text('PAYMENT METHOD:', col1X, curY + 24);
  doc.setTextColor(15, 23, 42);
  doc.setFont(PDF_FONT, 'normal');
  doc.text(invoice.invoiceNumber, col1X + 32, curY + 6);
  doc.text(invoice.issueDate || '—', col1X + 32, curY + 12);
  doc.text(invoice.eventDate || invoice.dueDate || '—', col1X + 32, curY + 18);
  doc.text(invoice.paymentMethod || '—', col1X + 32, curY + 24);

  const col2X = pageWidth / 2 + 5;
  doc.setTextColor(100, 116, 139);
  doc.setFont(PDF_FONT, 'bold');
  doc.text('BILLED TO (العميل):', col2X, curY + 6);
  doc.text('CUSTOMER PHONE:', col2X, curY + 12);
  doc.text('CUSTOMER VAT ID:', col2X, curY + 18);
  if (invoice.bookingId) doc.text('ORDER REF:', col2X, curY + 24);
  doc.setTextColor(15, 23, 42);
  doc.setFont(PDF_FONT, 'normal');
  doc.text(invoice.clientName || '—', col2X + 36, curY + 6);
  doc.text(invoice.clientPhone || '—', col2X + 36, curY + 12);
  doc.text(invoice.clientTaxId || '—', col2X + 36, curY + 18);
  if (invoice.bookingId) doc.text(invoice.bookingId, col2X + 36, curY + 24);

  // Lines.
  const rows = invoice.items.map((item, index) => {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const lineSubtotal = qty * unitPrice;
    const lineVat = lineSubtotal * taxRate;
    return withVat
      ? [
          String(index + 1),
          item.description || '—',
          String(qty),
          money(unitPrice),
          money(lineSubtotal),
          money(lineVat),
          money(lineSubtotal + lineVat),
        ]
      : [String(index + 1), item.description || '—', String(qty), money(unitPrice), money(lineSubtotal)];
  });

  autoTable(doc, {
    startY: 97,
    head: [
      withVat
        ? ['#', 'Item & Description / الوصف', 'Qty', 'Unit Price', 'Subtotal (Excl)', `VAT (${vatPct}%)`, 'Total (SAR)']
        : ['#', 'Item & Description / الوصف', 'Qty', 'Unit Price', 'Total (SAR)'],
    ],
    body: rows,
    margin: { left: margin, right: margin, bottom: 24 },
    theme: 'grid',
    headStyles: { fillColor: band, textColor: bandInk, fontStyle: 'bold', fontSize: 8, halign: 'center' },
    columnStyles: withVat
      ? {
          0: { halign: 'center', cellWidth: 10 },
          1: { halign: 'right', cellWidth: 'auto' },
          2: { halign: 'center', cellWidth: 14 },
          3: { halign: 'right', cellWidth: 24 },
          4: { halign: 'right', cellWidth: 26 },
          5: { halign: 'right', cellWidth: 26 },
          6: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
        }
      : {
          0: { halign: 'center', cellWidth: 10 },
          1: { halign: 'right', cellWidth: 'auto' },
          2: { halign: 'center', cellWidth: 16 },
          3: { halign: 'right', cellWidth: 30 },
          4: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
        },
    styles: { font: PDF_FONT, fontSize: 8, cellPadding: 3, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 140;
  const footerY = pageHeight - 18;
  const boxH = 42;
  let boxY = finalY + 6;
  if (boxY + boxH > footerY - 4) {
    doc.addPage();
    boxY = 20;
  }

  // Totals.
  const sumW = 85;
  const sumX = pageWidth - margin - sumW;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(sumX, boxY, sumW, boxH, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(sumX, boxY, sumW, boxH, 2, 2, 'S');

  doc.setFontSize(8);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(100, 116, 139);
  if (withVat) {
    doc.text('Subtotal (قبل الضريبة):', sumX + 4, boxY + 7);
    doc.text(`VAT ${vatPct}% (ضريبة القيمة المضافة):`, sumX + 4, boxY + 14);
    doc.setTextColor(15, 23, 42);
    doc.text(money(invoice.subtotal), sumX + sumW - 4, boxY + 7, { align: 'right' });
    doc.text(money(invoice.taxAmount), sumX + sumW - 4, boxY + 14, { align: 'right' });
  } else {
    doc.text('Subtotal (المجموع):', sumX + 4, boxY + 7);
    doc.setTextColor(15, 23, 42);
    doc.text(money(invoice.subtotal), sumX + sumW - 4, boxY + 7, { align: 'right' });
    if (invoice.discount) {
      doc.setTextColor(100, 116, 139);
      doc.text('Discount (الخصم):', sumX + 4, boxY + 14);
      doc.setTextColor(15, 23, 42);
      doc.text(money(invoice.discount), sumX + sumW - 4, boxY + 14, { align: 'right' });
    }
  }
  doc.setFont(PDF_FONT, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(withVat ? 'Grand Total (الإجمالي شامل الضريبة):' : 'Grand Total (الإجمالي):', sumX + 4, boxY + 22);
  doc.setTextColor(21, 94, 239);
  doc.setFontSize(9.5);
  doc.text(money(invoice.total), sumX + sumW - 4, boxY + 22, { align: 'right' });

  doc.setFontSize(8);
  doc.setDrawColor(226, 232, 240);
  doc.line(sumX + 4, boxY + 26, sumX + sumW - 4, boxY + 26);
  doc.setTextColor(16, 185, 129);
  doc.text('Paid (المبلغ المسدد):', sumX + 4, boxY + 32);
  doc.text(money(invoice.depositPaid), sumX + sumW - 4, boxY + 32, { align: 'right' });
  doc.setTextColor(225, 29, 72);
  doc.text('Remaining Due (المتبقي):', sumX + 4, boxY + 38);
  doc.text(money(invoice.remainingBalance), sumX + sumW - 4, boxY + 38, { align: 'right' });

  // Bank details & terms.
  const leftW = sumX - margin - 6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, boxY, leftW, boxH, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, boxY, leftW, boxH, 2, 2, 'S');

  doc.setFontSize(8);
  doc.setFont(PDF_FONT, 'bold');
  doc.setTextColor(...NAVY);
  doc.text('Bank Details (الحساب البنكي):', margin + 4, boxY + 6);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(71, 85, 105);
  const beneficiary = brand.accountHolder || brand.brandName;
  const bankLine = [brand.bankName ? `Bank: ${brand.bankName}` : '', beneficiary ? `Beneficiary: ${beneficiary}` : '']
    .filter(Boolean)
    .join(' | ');
  doc.text(bankLine || '—', margin + 4, boxY + 12);
  doc.setFont(PDF_FONT, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(brand.iban ? `IBAN: ${brand.iban}` : 'IBAN: —', margin + 4, boxY + 18);

  doc.setTextColor(...NAVY);
  doc.text('Terms & Conditions (الشروط):', margin + 4, boxY + 26);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  const terms = doc.splitTextToSize(invoice.terms || brand.invoiceFooterNotes || '—', leftW - 8) as string[];
  doc.text(terms.slice(0, 3), margin + 4, boxY + 31);

  // Stamp & signature under the totals.
  if (stamp) {
    const stampBox = 26;
    let stampY = boxY + boxH + 6;
    if (stampY + stampBox + 6 > footerY) {
      doc.addPage();
      stampY = 20;
    }
    drawImage(doc, stamp, pageWidth - margin - stampBox - 10, stampY, stampBox);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('الختم والتوقيع المعتمد', pageWidth - margin - 10 - stampBox / 2, stampY + stampBox + 4, {
      align: 'center',
    });
  }

  drawFooters(doc, margin, `Invoice: ${invoice.invoiceNumber}`);
  return doc;
}

export type ReceiptData = {
  receiptNumber: string;
  customerName: string;
  customerPhone?: string;
  invoiceNumber: string;
  amount: number;
  remainingAmount: number;
  paymentMethod: string;
  date: string;
  notes?: string;
};

/** سند قبض — the payment / deposit receipt for an invoice. */
export async function buildReceiptPdf(receipt: ReceiptData, brand: VendorBrandSettings): Promise<jsPDF> {
  const doc = newA4();
  await applyArabicFont(doc);
  const [logo, stamp] = await Promise.all([loadPdfImage(brand.logoUrl), loadPdfImage(brand.stampUrl)]);

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const band = brandRgb(brand);
  const bandInk = inkOn(band);

  doc.setFillColor(...band);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 28, pageWidth, 2, 'F');

  doc.setTextColor(...bandInk);
  doc.setFontSize(16);
  doc.setFont(PDF_FONT, 'bold');
  doc.text('PAYMENT RECEIPT | سند قبض', margin, 13);
  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, 'normal');
  doc.text('PAYMENT RECEIPT VOUCHER', margin, 20);

  doc.setFontSize(9);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(`Receipt No: ${receipt.receiptNumber}`, pageWidth - margin, 13, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont(PDF_FONT, 'normal');
  doc.text(`Date: ${receipt.date}`, pageWidth - margin, 20, { align: 'right' });

  // Vendor.
  const logoBox = 16;
  if (logo) drawImage(doc, logo, margin, 33, logoBox);
  const textX = margin + (logo ? logoBox + 4 : 0);
  let curY = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(brand.brandName || '—', textX, curY);
  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(71, 85, 105);
  curY += 5;
  const idLine = [brand.crNumber ? `CR: ${brand.crNumber}` : '', isValidSaudiVatNumber(brand.vatNumber) ? `VAT Number: ${brand.vatNumber.replace(/\s/g, '')}` : '']
    .filter(Boolean)
    .join(' | ');
  if (idLine) {
    doc.text(idLine, textX, curY);
    curY += 5;
  }
  const cityLine = [brand.city ? `City: ${brand.city}` : '', brand.phone ? `Phone: ${brand.phone}` : '']
    .filter(Boolean)
    .join(' | ');
  if (cityLine) doc.text(cityLine, textX, curY);

  // Voucher box.
  curY = 56;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, curY, pageWidth - margin * 2, 110, 3, 3, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, curY, pageWidth - margin * 2, 110, 3, 3, 'S');

  doc.setFillColor(16, 185, 129);
  doc.roundedRect(margin + 6, curY + 6, pageWidth - margin * 2 - 12, 16, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, 'bold');
  doc.text('AMOUNT RECEIVED (المبلغ المقبوض):', margin + 12, curY + 16);
  doc.setFontSize(14);
  doc.text(money(receipt.amount), pageWidth - margin - 12, curY + 17, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont(PDF_FONT, 'bold');
  doc.text('Amount in Words (المبلغ كتابة):', margin + 8, curY + 30);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(71, 85, 105);
  const words = doc.splitTextToSize(tafqeetSAR(receipt.amount) || `${receipt.amount} SAR`, pageWidth - margin * 2 - 70) as string[];
  doc.text(words[0] || '', margin + 58, curY + 30);

  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 8, curY + 35, pageWidth - margin - 8, curY + 35);

  const rows = [
    { label: 'Received From (استلمنا من):', value: receipt.customerName || '—' },
    { label: 'Customer Phone (رقم الجوال):', value: receipt.customerPhone || '—' },
    { label: 'For Invoice No (عن الفاتورة رقم):', value: receipt.invoiceNumber },
    { label: 'Payment Method (طريقة الدفع):', value: receipt.paymentMethod || '—' },
    { label: 'Remaining Balance (الرصيد المتبقي):', value: money(receipt.remainingAmount) },
    { label: 'Notes (البيان):', value: receipt.notes || '—' },
  ];
  let lineY = curY + 44;
  for (const row of rows) {
    doc.setFontSize(8.5);
    doc.setFont(PDF_FONT, 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(row.label, margin + 8, lineY);
    doc.setFont(PDF_FONT, 'normal');
    doc.setTextColor(15, 23, 42);
    const [value] = doc.splitTextToSize(row.value, pageWidth - margin * 2 - 80) as string[];
    doc.text(value || '—', margin + 70, lineY);
    lineY += 9;
  }

  // Signatures.
  const sigY = curY + 122;
  const sigW = (pageWidth - margin * 2 - 8) / 2;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, sigY, sigW, 45, 2, 2, 'FD');
  doc.roundedRect(pageWidth / 2 + 4, sigY, sigW, 45, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, 'bold');
  doc.setTextColor(...NAVY);
  doc.text('Received by (المستلم):', margin + 6, sigY + 8);
  if (stamp) drawImage(doc, stamp, margin + sigW / 2 - 12, sigY + 11, 24);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Signature & Stamp: _______________________', margin + 6, sigY + 40);

  doc.setFont(PDF_FONT, 'bold');
  doc.setTextColor(...NAVY);
  doc.text('Paid by (المسلّم):', pageWidth / 2 + 10, sigY + 8);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Signature: _______________________', pageWidth / 2 + 10, sigY + 40);

  drawFooters(doc, margin, `Receipt: ${receipt.receiptNumber}`);
  return doc;
}

/* ── Invoice → receipt, file names, and the browser actions ────────── */

export function receiptForInvoice(invoice: VendorInvoice): ReceiptData {
  return {
    receiptNumber: `REC-${invoice.invoiceNumber.replace(/^INV-/, '')}`,
    customerName: invoice.clientName,
    customerPhone: invoice.clientPhone,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.depositPaid,
    remainingAmount: invoice.remainingBalance,
    paymentMethod: invoice.paymentMethod,
    date: invoice.issueDate,
    notes:
      invoice.remainingBalance > 0
        ? `دفعة مقدمة${invoice.eventDate ? ` لموعد ${invoice.eventDate}` : ''}`
        : 'سداد كامل قيمة الفاتورة',
  };
}

export function invoiceFileName(invoice: VendorInvoice, brand: VendorBrandSettings): string {
  const taxInvoice = (Number(invoice.taxRate) || 0) > 0 && isValidSaudiVatNumber(brand.vatNumber);
  return `${taxInvoice ? 'Tax-Invoice' : 'Invoice'}-${invoice.invoiceNumber}.pdf`;
}

export async function downloadInvoicePdf(invoice: VendorInvoice, brand: VendorBrandSettings): Promise<void> {
  const doc = await buildInvoicePdf(invoice, brand);
  doc.save(invoiceFileName(invoice, brand));
}

export async function downloadReceiptPdf(invoice: VendorInvoice, brand: VendorBrandSettings): Promise<void> {
  const receipt = receiptForInvoice(invoice);
  const doc = await buildReceiptPdf(receipt, brand);
  doc.save(`Receipt-${receipt.receiptNumber}.pdf`);
}

/** The invoice PDF as a File — for the phone's share sheet (WhatsApp with the file attached). */
export async function invoicePdfFile(invoice: VendorInvoice, brand: VendorBrandSettings): Promise<File> {
  const doc = await buildInvoicePdf(invoice, brand);
  return new File([doc.output('blob')], invoiceFileName(invoice, brand), { type: 'application/pdf' });
}

/**
 * Print = open the PDF with the print dialog armed. The caller opens `tab`
 * synchronously inside the click (before any await), so popup blockers let it
 * through; if it was blocked anyway the PDF is downloaded instead.
 */
export async function printInvoicePdf(
  invoice: VendorInvoice,
  brand: VendorBrandSettings,
  tab: Window | null,
): Promise<void> {
  try {
    const doc = await buildInvoicePdf(invoice, brand);
    doc.autoPrint();
    const url = URL.createObjectURL(doc.output('blob'));
    if (tab && !tab.closed) {
      tab.location.href = url;
    } else {
      doc.save(invoiceFileName(invoice, brand));
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
