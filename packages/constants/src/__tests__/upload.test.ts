import { describe, expect, it } from 'vitest';
import {
  TECHNICAL_FILE_EXTENSIONS,
  TECHNICAL_FILE_MAX_SIZE_BYTES,
  TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION,
} from '../index';

describe('technical file upload whitelist', () => {
  it('covers common images, office documents and pdf, and never ppt', () => {
    expect(TECHNICAL_FILE_EXTENSIONS).toEqual([
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'bmp',
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
    ]);
    expect(TECHNICAL_FILE_EXTENSIONS).toContain('pdf');
    expect(TECHNICAL_FILE_EXTENSIONS).not.toContain('ppt');
    expect(TECHNICAL_FILE_EXTENSIONS).not.toContain('pptx');
  });

  it('keeps every extension lowercase and unique', () => {
    const extensions = [...TECHNICAL_FILE_EXTENSIONS];
    expect(extensions).toEqual(extensions.map((extension) => extension.toLowerCase()));
    expect(new Set(extensions).size).toBe(extensions.length);
  });

  it('defines a MIME whitelist for every accepted extension', () => {
    expect(Object.keys(TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION)).toEqual(TECHNICAL_FILE_EXTENSIONS);
    expect(TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION.pdf).toEqual(['application/pdf']);
    expect(TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION.docx).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('keeps the shared size cap at 20 MiB', () => {
    expect(TECHNICAL_FILE_MAX_SIZE_BYTES).toBe(20 * 1024 * 1024);
  });
});
