import { describe, expect, it } from 'vitest';
import { canPreviewFile, getFileExtension, previewMimeOf } from '../file-preview';

describe('file-preview', () => {
  it('lowercases file extensions', () => {
    expect(getFileExtension('SOP.PDF')).toBe('.pdf');
    expect(getFileExtension('archive.TAR.GZ')).toBe('.gz');
    expect(getFileExtension('no-extension')).toBe('');
  });

  it('allows preview only for browser-safe pdf/image/text formats', () => {
    expect(canPreviewFile('SOP.PDF')).toBe(true);
    expect(canPreviewFile('photo.jpg')).toBe(true);
    expect(canPreviewFile('说明.txt')).toBe(true);
    expect(canPreviewFile('word.docx')).toBe(false);
    expect(canPreviewFile('archive.zip')).toBe(false);
    expect(canPreviewFile('no-extension')).toBe(false);
  });

  it('uses the explicit mime type for preview so blob urls open inline', () => {
    expect(previewMimeOf('SOP.PDF', 'application/octet-stream')).toBe('application/pdf');
    expect(previewMimeOf('photo.png')).toBe('image/png');
    expect(previewMimeOf('word.docx', 'application/octet-stream')).toBe('application/octet-stream');
    expect(previewMimeOf('word.docx')).toBe('application/octet-stream');
  });
});
