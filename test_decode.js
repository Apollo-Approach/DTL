const buf = Buffer.from('0101000020E6100000C3D4963A485054C05EA2D524D37D4540', 'hex');
// Byte 0: Endianness (01 = Little Endian)
// Byte 1-4: Type (01000020 = Point with SRID)
// Byte 5-8: SRID (E6100000 = 4326)
// Byte 9-16: X (Longitude)
const x = buf.readDoubleLE(9);
// Byte 17-24: Y (Latitude)
const y = buf.readDoubleLE(17);
console.log(`Longitude: ${x}, Latitude: ${y}`);
