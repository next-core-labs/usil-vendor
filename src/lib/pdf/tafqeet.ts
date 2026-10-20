/**
 * تفقيط — a riyal amount in Arabic words, for receipts
 * (ported from the old dashboard, `usil/src/utils/arabicNumberToWords.ts`).
 */
export function tafqeetSAR(amount: number): string {
  if (isNaN(amount) || amount < 0) return '';
  if (Math.round(amount * 100) === 0) return 'صفر ريال سعودي فقط لا غير';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertGroup(n: number): string {
    if (n === 0) return '';
    let result = '';
    const h = Math.floor(n / 100);
    const rem = n % 100;

    if (h > 0) {
      result += hundreds[h];
    }

    if (rem > 0) {
      if (result !== '') result += ' و';
      if (rem < 20) {
        result += ones[rem];
      } else {
        const o = rem % 10;
        const t = Math.floor(rem / 10);
        if (o > 0) {
          result += `${ones[o]} و${tens[t]}`;
        } else {
          result += tens[t];
        }
      }
    }
    return result;
  }

  // Round to whole halalas first, so 9.999 reads as ten riyals, not 9 riyals and 100 halalas.
  const totalHalalas = Math.round(amount * 100);
  const intPart = Math.floor(totalHalalas / 100);
  const halalas = totalHalalas % 100;

  let words = '';

  if (intPart >= 1000000) {
    const millions = Math.floor(intPart / 1000000);
    words += `${convertGroup(millions)} مليون `;
  }

  const thousands = Math.floor((intPart % 1000000) / 1000);
  if (thousands > 0) {
    if (words !== '') words += 'و';
    if (thousands === 1) {
      words += 'ألف ';
    } else if (thousands === 2) {
      words += 'ألفان ';
    } else if (thousands >= 3 && thousands <= 10) {
      words += `${convertGroup(thousands)} آلاف `;
    } else {
      words += `${convertGroup(thousands)} ألفاً `;
    }
  }

  const rest = intPart % 1000;
  if (rest > 0) {
    if (words !== '') words += 'و';
    words += `${convertGroup(rest)} `;
  }

  words = words.trim();
  let finalWord = '';

  if (intPart === 1) {
    finalWord = 'ريال سعودي واحد';
  } else if (intPart === 2) {
    finalWord = 'ريالان سعوديان';
  } else if (intPart >= 3 && intPart <= 10) {
    finalWord = `${words} ريالات سعودية`;
  } else if (intPart > 10) {
    finalWord = `${words} ريالاً سعودياً`;
  }

  if (halalas > 0) {
    const halalaWord = convertGroup(halalas);
    if (finalWord !== '') {
      finalWord += ` و${halalaWord} هللة`;
    } else {
      finalWord = `${halalaWord} هللة`;
    }
  }

  return `${finalWord} فقط لا غير`;
}
