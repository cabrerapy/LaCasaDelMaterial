/** File signatures are a first-line check, not a malware scanner or full decoder. */
export function matchesEvidenceContent(mime: string, data: Buffer): boolean {
  switch (mime) {
    case 'image/png':
      return data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        && data.toString('ascii', 12, 16) === 'IHDR'
        && data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0;
    case 'image/jpeg':
      return data.length >= 4 && data[0] === 255 && data[1] === 216
        && data[data.length - 2] === 255 && data[data.length - 1] === 217;
    case 'image/webp':
      return data.length >= 20 && data.toString('ascii', 0, 4) === 'RIFF'
        && data.readUInt32LE(4) + 8 === data.length
        && data.toString('ascii', 8, 12) === 'WEBP'
        && ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16));
    case 'application/pdf':
      return data.length >= 12 && /^%PDF-1\.[0-7]|^%PDF-2\.0/.test(data.toString('ascii', 0, 8))
        && /%%EOF\s*$/.test(data.subarray(-1024).toString('ascii'));
    default:
      return false;
  }
}
