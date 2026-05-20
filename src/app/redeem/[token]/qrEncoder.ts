// src/app/redeem/[token]/qrEncoder.ts
// Minimal QR Code generator — Version 2 (25×25), alphanumeric mode.
// Zero dependencies. Produces a boolean[][] matrix for canvas rendering.
// Only handles strings up to ~47 alphanumeric chars (enough for our tokens).
//
// For production at scale, replace with a proper library like 'qrcode'.
// This is intentionally minimal to avoid adding a dependency for a single use case.

// ── GF(256) arithmetic for Reed-Solomon ──

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x & 128 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsEncode(data: number[], ecLen: number): number[] {
  // Generator polynomial for the given EC length
  const gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], GF_EXP[i]);
    }
    gen.length = 0;
    gen.push(...next);
  }

  const msg = [...data, ...new Array(ecLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coeff = msg[i];
    if (coeff !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coeff);
      }
    }
  }
  return msg.slice(data.length);
}

// ── QR Code Version 2 (25×25) with Medium EC level ──

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const SIZE = 25;

function encodeAlphanumeric(text: string): number[] {
  const bits: number[] = [];
  const upper = text.toUpperCase();

  // Mode indicator: alphanumeric = 0010
  pushBits(bits, 0b0010, 4);
  // Character count (9 bits for version 2)
  pushBits(bits, upper.length, 9);

  for (let i = 0; i < upper.length; i += 2) {
    const c1 = ALPHANUMERIC.indexOf(upper[i]);
    if (i + 1 < upper.length) {
      const c2 = ALPHANUMERIC.indexOf(upper[i + 1]);
      pushBits(bits, c1 * 45 + c2, 11);
    } else {
      pushBits(bits, c1, 6);
    }
  }

  // Terminator
  const capacity = 128; // Version 2-M data bits
  const remaining = capacity - bits.length;
  pushBits(bits, 0, Math.min(4, remaining));

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad codewords
  const padWords = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < capacity) {
    pushBits(bits, padWords[padIdx % 2], 8);
    padIdx++;
  }

  // Convert to bytes
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] || 0);
    }
    bytes.push(byte);
  }

  return bytes;
}

function pushBits(arr: number[], value: number, count: number) {
  for (let i = count - 1; i >= 0; i--) {
    arr.push((value >> i) & 1);
  }
}

export function encode(text: string): boolean[][] {
  const dataBytes = encodeAlphanumeric(text);
  const ecBytes = rsEncode(dataBytes, 16); // Version 2-M: 16 EC codewords

  // Interleave data + EC
  const allBytes = [...dataBytes, ...ecBytes];

  // Convert to bit stream
  const bitStream: number[] = [];
  for (const byte of allBytes) {
    pushBits(bitStream, byte, 8);
  }

  // Create module grid
  const grid: (boolean | null)[][] = Array.from({ length: SIZE }, () =>
    Array(SIZE).fill(null)
  );

  // Place finder patterns
  placeFinder(grid, 0, 0);
  placeFinder(grid, SIZE - 7, 0);
  placeFinder(grid, 0, SIZE - 7);

  // Place alignment pattern (Version 2: at 6,18)
  placeAlignment(grid, 18, 18);

  // Timing patterns
  for (let i = 8; i < SIZE - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Dark module
  grid[SIZE - 8][8] = true;

  // Reserve format information areas
  for (let i = 0; i < 15; i++) {
    // These will be filled after masking
  }

  // Place data bits (upward/downward columns, right to left, skipping col 6)
  let bitIdx = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // Skip timing column
    for (let vert = 0; vert < SIZE; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const row = ((right + 1) & 2) === 0 ? SIZE - 1 - vert : vert;
        if (grid[row][col] === null) {
          grid[row][col] = bitIdx < bitStream.length ? bitStream[bitIdx++] === 1 : false;
        }
      }
    }
  }

  // Apply mask 0 (checkerboard) and format info
  const result: boolean[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      result[r][c] = grid[r][c] ?? false;
      // Apply mask: (row + column) mod 2 == 0
      if (isDataModule(r, c) && (r + c) % 2 === 0) {
        result[r][c] = !result[r][c];
      }
    }
  }

  // Place format info (mask 0, EC level M = 00, mask 000)
  // Pre-computed format string for M-0: 101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  placeFormatInfo(result, formatBits);

  return result;
}

function placeFinder(grid: (boolean | null)[][], row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const gr = row + r;
      const gc = col + c;
      if (gr < 0 || gr >= SIZE || gc < 0 || gc >= SIZE) continue;

      if (r === -1 || r === 7 || c === -1 || c === 7) {
        grid[gr][gc] = false; // Separator
      } else if (
        (r === 0 || r === 6 || c === 0 || c === 6) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      ) {
        grid[gr][gc] = true;
      } else {
        grid[gr][gc] = false;
      }
    }
  }
}

function placeAlignment(grid: (boolean | null)[][], row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const gr = row + r;
      const gc = col + c;
      if (gr < 0 || gr >= SIZE || gc < 0 || gc >= SIZE) continue;
      if (grid[gr][gc] !== null) continue;

      if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
        grid[gr][gc] = true;
      } else {
        grid[gr][gc] = false;
      }
    }
  }
}

function isDataModule(row: number, col: number): boolean {
  // Skip finder patterns + separators
  if (row < 9 && col < 9) return false;
  if (row < 9 && col >= SIZE - 8) return false;
  if (row >= SIZE - 8 && col < 9) return false;
  // Skip timing patterns
  if (row === 6 || col === 6) return false;
  // Skip alignment pattern
  if (row >= 16 && row <= 20 && col >= 16 && col <= 20) return false;
  return true;
}

function placeFormatInfo(grid: boolean[][], bits: number[]) {
  // Around top-left finder
  const positions1: [number, number][] = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3],
    [8, 2], [8, 1], [8, 0],
  ];
  // Around other finders
  const positions2: [number, number][] = [
    [8, SIZE - 1], [8, SIZE - 2], [8, SIZE - 3], [8, SIZE - 4],
    [8, SIZE - 5], [8, SIZE - 6], [8, SIZE - 7],
    [SIZE - 7, 8], [SIZE - 6, 8], [SIZE - 5, 8], [SIZE - 4, 8],
    [SIZE - 3, 8], [SIZE - 2, 8], [SIZE - 1, 8], [SIZE - 8, 8],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = bits[i] === 1;
    const [r1, c1] = positions1[i];
    grid[r1][c1] = bit;
    if (i < positions2.length) {
      const [r2, c2] = positions2[i];
      grid[r2][c2] = bit;
    }
  }
}
