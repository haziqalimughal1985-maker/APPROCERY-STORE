import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export type ApkMetadata = {
  sha256: string;
  packageName: string | null;
  versionName: string | null;
  versionCode: number | null;
  minSdk: number | null;
  targetSdk: number | null;
  hasClassesDex: boolean;
  hasManifest: boolean;
};

function u16(buf: Buffer, offset: number) { return buf.readUInt16LE(offset); }
function u32(buf: Buffer, offset: number) { return buf.readUInt32LE(offset); }

function readZipEntries(buf: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buf.length && u32(buf, offset) === 0x04034b50) {
    const flags = u16(buf, offset + 6);
    const method = u16(buf, offset + 8);
    const compressedSize = u32(buf, offset + 18);
    const nameLength = u16(buf, offset + 26);
    const extraLength = u16(buf, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    if ((flags & 0x1) !== 0 || dataStart > buf.length || dataStart + compressedSize > buf.length) break;
    const name = buf.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const compressed = buf.subarray(dataStart, dataStart + compressedSize);
    try {
      const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (data) entries.set(name, data);
    } catch {
      // A malformed compressed entry is handled by the missing-manifest check.
    }
    offset = dataStart + compressedSize;
  }
  return entries;
}

function readLength(buf: Buffer, offset: number, utf8: boolean) {
  if (utf8) {
    const first = buf[offset++];
    const charLength = (first & 0x80) ? ((first & 0x7f) << 8) | buf[offset++] : first;
    const byteLengthByte = buf[offset++];
    const byteLength = (byteLengthByte & 0x80) ? ((byteLengthByte & 0x7f) << 8) | buf[offset++] : byteLengthByte;
    return { length: byteLength, next: offset, charLength };
  }
  const first = buf.readUInt16LE(offset);
  if (first & 0x8000) return { length: ((first & 0x7fff) << 16) | buf.readUInt16LE(offset + 2), next: offset + 4, charLength: 0 };
  return { length: first * 2, next: offset + 2, charLength: first };
}

function readStringPool(buf: Buffer, base: number) {
  if (base + 28 > buf.length || u16(buf, base) !== 0x0001) return { strings: [] as string[], end: base };
  const stringCount = u32(buf, base + 8);
  const flags = u32(buf, base + 16);
  const stringsStart = u32(buf, base + 20);
  const utf8 = (flags & 0x100) !== 0;
  const values: string[] = [];
  for (let i = 0; i < stringCount; i++) {
    const relative = u32(buf, base + 28 + i * 4);
    const start = base + stringsStart + relative;
    if (start >= buf.length) { values.push(""); continue; }
    const info = readLength(buf, start, utf8);
    values.push(utf8 ? buf.subarray(info.next, info.next + info.length).toString("utf8") : buf.subarray(info.next, info.next + info.length).toString("utf16le"));
  }
  return { strings: values, end: base + u32(buf, base + 4) };
}

function parseManifest(manifest: Buffer) {
  if (manifest.length < 16 || u16(manifest, 0) !== 0x0003) return {};
  const pool = readStringPool(manifest, u16(manifest, 2));
  const strings = pool.strings;
  if (strings.length === 0) return {};
  let offset = pool.end;
  let currentTag = "";
  const result: Record<string, string | number> = {};
  while (offset + 8 <= manifest.length) {
    const type = u16(manifest, offset);
    const headerSize = u16(manifest, offset + 2);
    const size = u32(manifest, offset + 4);
    if (size < 8 || offset + size > manifest.length) break;
    if (type === 0x0102 && headerSize >= 16) {
      const nameIndex = u32(manifest, offset + 20);
      currentTag = strings[nameIndex] ?? "";
      const attributeStart = u16(manifest, offset + 24);
      const attributeSize = u16(manifest, offset + 26);
      const attributeCount = u16(manifest, offset + 28);
      const attrsBase = offset + headerSize + attributeStart;
      for (let i = 0; i < attributeCount; i++) {
        const at = attrsBase + i * attributeSize;
        if (at + 20 > manifest.length) break;
        const attrName = strings[u32(manifest, at + 4)] ?? "";
        const rawIndex = u32(manifest, at + 8);
        const valueType = manifest[at + 15];
        const valueData = u32(manifest, at + 16);
        const raw = rawIndex !== 0xffffffff ? (strings[rawIndex] ?? "") : "";
        const value = valueType === 0x10 ? valueData : valueType === 0x03 ? raw : raw || String(valueData);
        if (currentTag === "manifest" && ["package", "versionName", "versionCode"].includes(attrName)) result[attrName] = attrName === "versionCode" && typeof value === "string" ? Number(value) : value;
        if (currentTag === "uses-sdk" && ["minSdkVersion", "targetSdkVersion"].includes(attrName)) result[attrName] = typeof value === "number" ? value : Number(value);
      }
    }
    offset += size;
  }
  return result;
}

export function inspectApk(buffer: Buffer): { ok: boolean; message: string; metadata?: ApkMetadata } {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (buffer.length < 4 || buffer.subarray(0, 2).toString() !== "PK") return { ok: false, message: "The upload is not an APK ZIP archive." };
  const lowerStart = buffer.subarray(0, Math.min(buffer.length, 128)).toString("utf8").toLowerCase();
  if (lowerStart.includes("<!doctype html") || lowerStart.includes("<html") || lowerStart.includes("{\"error\"")) return { ok: false, message: "An HTML or JSON error document cannot be used as an APK." };
  const entries = readZipEntries(buffer);
  const manifest = entries.get("AndroidManifest.xml");
  const hasClassesDex = Array.from(entries.keys()).some(name => /^classes(?:\d+)?\.dex$/.test(name));
  if (!manifest) return { ok: false, message: "AndroidManifest.xml is missing or unreadable." };
  if (!hasClassesDex) return { ok: false, message: "classes.dex is missing; the archive is not a complete Android package." };
  const parsed = parseManifest(manifest);
  const metadata: ApkMetadata = {
    sha256,
    packageName: typeof parsed.package === "string" ? parsed.package : null,
    versionName: typeof parsed.versionName === "string" ? parsed.versionName : null,
    versionCode: typeof parsed.versionCode === "number" ? parsed.versionCode : null,
    minSdk: typeof parsed.minSdkVersion === "number" ? parsed.minSdkVersion : null,
    targetSdk: typeof parsed.targetSdkVersion === "number" ? parsed.targetSdkVersion : null,
    hasClassesDex,
    hasManifest: true,
  };
  if (!metadata.packageName) return { ok: false, message: "AndroidManifest.xml does not contain a package name." };
  return { ok: true, message: "APK archive and Android manifest validated.", metadata };
}
