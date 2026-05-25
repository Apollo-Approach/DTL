function decodeWkbPoint(wkbHex) {
  if (!wkbHex || wkbHex.length < 42) return null;
  // WKB Point with SRID is usually 42 hex chars long (1 byte endian, 4 bytes type, 4 bytes srid, 8 bytes X, 8 bytes Y)
  // But wait, PostGIS sometimes returns EWKB:
  // 01 01 00 00 20 E6 10 00 00 -> 18 hex chars header
  const header = wkbHex.substring(0, 18);
  if (header.toUpperCase() !== '0101000020E6100000') return null;
  
  const xHex = wkbHex.substring(18, 34);
  const yHex = wkbHex.substring(34, 50);
  
  const getFloat64 = (hex) => {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const bytes = hex.match(/.{2}/g).map(byte => parseInt(byte, 16));
    bytes.forEach((b, i) => view.setUint8(7 - i, b)); // Little Endian
    return view.getFloat64(0, false); // Actually, view.setUint8(i, b) and view.getFloat64(0, true) is better
  }
  
  const parseLE = (hex) => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      const bytes = hex.match(/.{2}/g).map(byte => parseInt(byte, 16));
      bytes.forEach((b, i) => view.setUint8(i, b));
      return view.getFloat64(0, true); // true for little-endian
  }

  return {
    lng: parseLE(xHex),
    lat: parseLE(yHex)
  }
}

const wkb = "0101000020E610000089C5361E0A5054C0209FD786B17D4540";
console.log(decodeWkbPoint(wkb));
