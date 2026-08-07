// Minimal ambient typings for adm-zip (used for skill zip validation/upload).
declare module 'adm-zip' {
  namespace AdmZip {
    interface Header {
      /** Uncompressed size. */
      size: number;
      /** Compressed size. */
      compressedSize: number;
      method: number;
      attr: number;
    }
    interface ZipEntry {
      entryName: string;
      isDirectory: boolean;
      /** External file attributes (holds unix mode bits for unix-made zips). */
      attr?: number;
      header: Header;
      getData(): Buffer;
    }
  }

  class AdmZip {
    constructor(pathOrBuffer?: string | Buffer);
    getEntries(): AdmZip.ZipEntry[];
    addFile(entryName: string, content: Buffer | string): void;
    toBuffer(): Buffer;
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    getEntry(entryName: string): AdmZip.ZipEntry | null;
  }

  export = AdmZip;
}
