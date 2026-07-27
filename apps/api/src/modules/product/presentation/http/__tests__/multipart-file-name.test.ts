import { describe, expect, it } from 'vitest';
import { decodeMultipartFileName } from '../multipart-file-name.js';

describe('decodeMultipartFileName', () => {
  it('recovers a UTF-8 filename interpreted as Latin-1 by multipart parsing', () => {
    expect(decodeMultipartFileName('12- æååè£æ£éªè§ç¨.docx')).toBe('12- 成品包装检验规程.docx');
  });

  it('preserves filenames already decoded as Unicode', () => {
    expect(decodeMultipartFileName('成品包装检验规程.docx')).toBe('成品包装检验规程.docx');
  });

  it('preserves a valid Latin-1 filename when its bytes are not valid UTF-8', () => {
    expect(decodeMultipartFileName('café.docx')).toBe('café.docx');
  });
});
