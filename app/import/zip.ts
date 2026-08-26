/**
 * Just enough ZIP to open the archive Apple Health and Whoop hand you, without
 * asking anyone to unzip anything first. Only the central directory and the one
 * entry being read are ever loaded, so a multi-gigabyte Apple export does not
 * have to fit in memory.
 */

export type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  headerOffset: number;
};

const EOCD_SIGNATURE = 0x0605_4b50;
const CENTRAL_SIGNATURE = 0x0201_4b50;
const LOCAL_SIGNATURE = 0x0403_4b50;
const MAX_COMMENT = 65_535;
const UNKNOWN_32 = 0xffff_ffff;

export class ZipError extends Error {}

async function view(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

export async function readZipDirectory(blob: Blob): Promise<ZipEntry[]> {
  const tailLength = Math.min(blob.size, MAX_COMMENT + 22);
  const tail = await view(blob, blob.size - tailLength, blob.size);

  let eocd = -1;
  for (let index = tail.byteLength - 22; index >= 0; index -= 1) {
    if (tail.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd === -1) throw new ZipError("That file is not a readable zip archive.");

  const count = tail.getUint16(eocd + 10, true);
  const directorySize = tail.getUint32(eocd + 12, true);
  const directoryOffset = tail.getUint32(eocd + 16, true);
  if (directoryOffset === UNKNOWN_32 || directorySize === UNKNOWN_32) {
    throw new ZipError("This zip uses the zip64 format. Unzip it first and add the files inside.");
  }

  const directory = await view(blob, directoryOffset, directoryOffset + directorySize);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let cursor = 0;

  for (let index = 0; index < count && cursor + 46 <= directory.byteLength; index += 1) {
    if (directory.getUint32(cursor, true) !== CENTRAL_SIGNATURE) break;
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    const name = decoder.decode(
      new Uint8Array(directory.buffer, directory.byteOffset + cursor + 46, nameLength),
    );

    entries.push({
      name,
      method: directory.getUint16(cursor + 10, true),
      compressedSize: directory.getUint32(cursor + 20, true),
      uncompressedSize: directory.getUint32(cursor + 24, true),
      headerOffset: directory.getUint32(cursor + 42, true),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries.filter((entry) => !entry.name.endsWith("/") && !entry.name.split("/").pop()!.startsWith("."));
}

export async function openZipEntry(blob: Blob, entry: ZipEntry): Promise<ReadableStream<Uint8Array>> {
  if (entry.method !== 0 && entry.method !== 8) {
    throw new ZipError(`“${entry.name}” uses a compression method this reader does not support.`);
  }
  if (entry.compressedSize === UNKNOWN_32) {
    throw new ZipError("This zip uses the zip64 format. Unzip it first and add the files inside.");
  }

  const header = await view(blob, entry.headerOffset, entry.headerOffset + 30);
  if (header.getUint32(0, true) !== LOCAL_SIGNATURE) throw new ZipError("This zip archive is damaged.");
  const start =
    entry.headerOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);

  const data = blob.slice(start, start + entry.compressedSize).stream();
  return entry.method === 0 ? data : data.pipeThrough(new DecompressionStream("deflate-raw"));
}

export async function readZipEntryText(blob: Blob, entry: ZipEntry): Promise<string> {
  const reader = (await openZipEntry(blob, entry)).getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text + decoder.decode();
    text += decoder.decode(value, { stream: true });
  }
}
