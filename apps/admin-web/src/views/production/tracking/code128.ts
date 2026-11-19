// Code 128 symbol patterns (ISO/IEC 15417).
const PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
] as const;

const START_B = 104;
const START_C = 105;
const SWITCH_B = 100;
const SWITCH_C = 99;
const STOP = 106;
const QUIET_ZONE = 12;

function encodeSymbols(value: string): number[] {
  const costsB = new Array<number>(value.length + 1).fill(0);
  const costsC = new Array<number>(value.length + 1).fill(0);
  const switchFromB = new Array<boolean>(value.length).fill(false);
  const switchFromC = new Array<boolean>(value.length).fill(false);
  // Each transition consumes input, so suffix costs include switches without cyclic states.
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const hasPair = /^\d{2}$/.test(value.slice(index, index + 2));
    const stayB = 1 + costsB[index + 1];
    const toC = hasPair ? 2 + costsC[index + 2] : Infinity;
    const stayC = hasPair ? 1 + costsC[index + 2] : Infinity;
    const toB = 2 + costsB[index + 1];
    switchFromB[index] = toC < stayB;
    switchFromC[index] = toB < stayC;
    costsB[index] = Math.min(stayB, toC);
    costsC[index] = Math.min(stayC, toB);
  }

  let useC = costsC[0] < costsB[0];
  const codes = [useC ? START_C : START_B];
  for (let index = 0; index < value.length;) {
    if (useC && switchFromC[index]) {
      codes.push(SWITCH_B);
      useC = false;
    } else if (!useC && switchFromB[index]) {
      codes.push(SWITCH_C);
      useC = true;
    }
    if (useC) {
      codes.push(Number(value.slice(index, index + 2)));
      index += 2;
    } else {
      codes.push(value.charCodeAt(index) - 32);
      index += 1;
    }
  }
  const checksum = codes.reduce((sum, code, index) => sum + code * Math.max(index, 1), 0) % 103;
  return [...codes, checksum, STOP];
}

export function code128Svg(value: string, displayText = value): string {
  if (!value || !/^[\x20-\x7e]+$/.test(value)) throw new Error('追踪卡编号无法生成条形码');
  const codes = encodeSymbols(value);
  const barcodeWidth = codes.reduce(
    (sum, code) =>
      sum + Array.from(PATTERNS[code] ?? '', Number).reduce((total, size) => total + size, 0),
    QUIET_ZONE * 2,
  );
  const textWidth = Array.from(displayText).length * 7;
  const width = Math.max(barcodeWidth, textWidth + 8);
  let position = QUIET_ZONE + (width - barcodeWidth) / 2;
  const bars: string[] = [];
  for (const code of codes) {
    const pattern = PATTERNS[code];
    if (!pattern) throw new Error('条形码编码失败');
    Array.from(pattern).forEach((width, index) => {
      const size = Number(width);
      if (index % 2 === 0) bars.push(`<rect x="${position}" y="3" width="${size}" height="33"/>`);
      position += size;
    });
  }
  const escaped = displayText
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 53" role="img" aria-label="${escaped}"><rect width="${width}" height="53" fill="white"/><g fill="black">${bars.join('')}</g><text x="${width / 2}" y="49" text-anchor="middle" font-size="11" font-family="monospace" fill="black">${escaped}</text></svg>`;
}
