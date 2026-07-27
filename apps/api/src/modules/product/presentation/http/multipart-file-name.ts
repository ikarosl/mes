/**
 * Busboy/Multer historically interprets multipart filename parameters as Latin-1.
 * Recover UTF-8 only when every received character represents one byte and those
 * bytes form valid UTF-8; otherwise preserve the client-provided name unchanged.
 */
export const decodeMultipartFileName = (fileName: string) => {
  const characters = Array.from(fileName);
  if (characters.some((character) => character.codePointAt(0)! > 0xff)) {
    return fileName.normalize('NFC');
  }

  const bytes = Uint8Array.from(characters, (character) => character.codePointAt(0)!);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).normalize('NFC');
  } catch {
    return fileName.normalize('NFC');
  }
};
