/**
 * A minimal ZIP reader and writer: stored and deflated entries, which is
 * what shapefile bundles, KMZ and most zipped GIS data use. Deflate goes
 * through the platform's CompressionStream("deflate-raw"), so there is no
 * library to ship. No zip64, no encryption, no multi-disk archives.
 */

const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";

function decodeCp437(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {s += b < 128 ? String.fromCharCode(b) : CP437_HIGH[b - 128];}
  return s;
}

function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) {return new TextDecoder("utf-8").decode(bytes);}
  // Many tools write UTF-8 names without setting the flag; prefer UTF-8 when
  // the bytes are valid UTF-8 and not plain ASCII.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return decodeCp437(bytes);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const c of chunks) {n += c.length;}
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function throughStream(data: Uint8Array, stream: { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const written = writer.write(data).then(() => writer.close());
  // Surface write errors through the read loop rather than as an unhandled rejection.
  written.catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {break;}
    chunks.push(value);
  }
  await written;
  return concat(chunks);
}

export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return throughStream(data, new DecompressionStream("deflate-raw") as unknown as { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> });
}

export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return throughStream(data, new CompressionStream("deflate-raw") as unknown as { writable: WritableStream<Uint8Array>; readable: ReadableStream<Uint8Array> });
}

let crcTable: Uint32Array | null = null;

export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;}
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);}
  return (crc ^ 0xffffffff) >>> 0;
}

/** Every file in the archive by its path inside it. Directories are left out. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is in the last 22 + 65535 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {throw new Error("Not a ZIP file (no end of central directory)");}
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) {throw new Error("ZIP64 archives are not supported");}
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) {throw new Error("Corrupt ZIP central directory");}
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = decodeName(bytes.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) {continue;}
    if (flags & 1) {throw new Error(`${name}: encrypted ZIP entries are not supported`);}
    if (dv.getUint32(local, true) !== 0x04034b50) {throw new Error(`${name}: corrupt ZIP local header`);}
    // Sizes come from the central directory, so entries written with a data
    // descriptor (sizes zero in the local header) read correctly.
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + compSize);
    if (method === 0) {out.set(name, raw.slice());}
    else if (method === 8) {out.set(name, await inflateRaw(raw));}
    else {throw new Error(`${name}: unsupported ZIP compression method ${method}`);}
  }
  return out;
}

/** A ZIP of the given files (names are paths inside the archive). */
export async function writeZip(files: Record<string, Uint8Array | string>): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = (Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const names = Object.keys(files);
  for (const name of names) {
    const content = files[name];
    const data = typeof content === "string" ? enc.encode(content) : content;
    const crc = crc32(data);
    let method = 0;
    let body = data;
    if (data.length > 64) {
      const deflated = await deflateRaw(data);
      if (deflated.length < data.length) {
        method = 8;
        body = deflated;
      }
    }
    const nameBytes = enc.encode(name);
    const lh = new Uint8Array(30 + nameBytes.length);
    const l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(8, method, true);
    l.setUint16(10, dosTime, true);
    l.setUint16(12, dosDate, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, body.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, nameBytes.length, true);
    l.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    const ch = new Uint8Array(46 + nameBytes.length);
    const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(10, method, true);
    c.setUint16(12, dosTime, true);
    c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, nameBytes.length, true);
    c.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    parts.push(lh, body);
    central.push(ch);
    offset += lh.length + body.length;
  }
  const cd = concat(central);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, names.length, true);
  e.setUint16(10, names.length, true);
  e.setUint32(12, cd.length, true);
  e.setUint32(16, offset, true);
  return concat([...parts, cd, end]);
}
