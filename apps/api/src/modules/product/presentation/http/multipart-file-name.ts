/**
 * Busboy/Multer 历史上会将 multipart 文件名参数按 Latin-1 解释。
 * 只有在每个接收字符都对应一个字节且这些字节组成有效 UTF-8 时才恢复 UTF-8；
 * 否则保留客户端提供的文件名不变。
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
