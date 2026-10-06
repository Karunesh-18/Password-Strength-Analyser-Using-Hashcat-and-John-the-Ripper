// Minimal MD4 implementation (RFC 1320).
// Node's OpenSSL 3 build disables MD4 in crypto.createHash, but NTLM hashing
// requires it, so we implement the (short, fixed) algorithm directly.
// ponytail: hand-rolled only because stdlib dropped support; do not reuse
// elsewhere — if another MD4 need shows up, extract to a shared package.

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

export function md4(input: Buffer): Buffer {
  const msgLenBits = input.length * 8;
  const padLen = ((input.length % 64) < 56 ? 56 : 120) - (input.length % 64);
  const padded = Buffer.alloc(input.length + padLen + 8);
  input.copy(padded);
  padded[input.length] = 0x80;
  padded.writeUInt32LE(msgLenBits >>> 0, padded.length - 8);
  padded.writeUInt32LE(Math.floor(msgLenBits / 2 ** 32), padded.length - 4);

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const x: number[] = [];
    for (let i = 0; i < 16; i++) x.push(padded.readUInt32LE(offset + i * 4));

    const aa = a, bb = b, cc = c, dd = d;

    const F = (x: number, y: number, z: number) => (x & y) | (~x & z);
    const G = (x: number, y: number, z: number) => (x & y) | (x & z) | (y & z);
    const H = (x: number, y: number, z: number) => x ^ y ^ z;

    for (let i = 0; i < 16; i++) {
      const f = (F(b, c, d) + a + x[i]) >>> 0;
      const s = [3, 7, 11, 19][i % 4];
      a = d; d = c; c = b; b = rotl(f, s);
    }

    const round2Order = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
    for (let i = 0; i < 16; i++) {
      const f = (G(b, c, d) + a + x[round2Order[i]] + 0x5a827999) >>> 0;
      const s = [3, 5, 9, 13][i % 4];
      a = d; d = c; c = b; b = rotl(f, s);
    }

    const round3Order = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
    for (let i = 0; i < 16; i++) {
      const f = (H(b, c, d) + a + x[round3Order[i]] + 0x6ed9eba1) >>> 0;
      const s = [3, 9, 11, 15][i % 4];
      a = d; d = c; c = b; b = rotl(f, s);
    }

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0);
  out.writeUInt32LE(b, 4);
  out.writeUInt32LE(c, 8);
  out.writeUInt32LE(d, 12);
  return out;
}
