import { Buffer } from 'buffer';

function decodeWKBPoint(wkbString) {
  const buf = Buffer.from(wkbString, 'hex');
  const lng = buf.readDoubleLE(9);
  const lat = buf.readDoubleLE(17);
  return { lng, lat };
}

console.log(decodeWKBPoint('0101000020E61000008664B7851D5054C00C18C9C3E77D4540'));
