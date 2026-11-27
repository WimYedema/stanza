import struct, sys, zlib
# Usage: python scripts/make-cover-background.py examples/background-cover/assets/cover.png

# A made-up cover picture for the background-cover example (ADR 0097), in A4 proportions:
# a dark blue gradient, a lighter slanted facet across the bottom, and a thin amber line.
W, H = 1190, 1684
top, bottom = (11, 37, 69), (19, 64, 96)
facet = (32, 96, 128)
amber = (242, 165, 65)

def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))

rows = []
for y in range(H):
    base = mix(top, bottom, y / (H - 1))
    line = bytearray([0])
    # The edge of the facet runs from 78% down on the left to 58% down on the right.
    for x in range(W):
        edge = H * (0.78 - 0.20 * x / W)
        if abs(y - (edge - 26)) < 3:
            color = amber
        elif y > edge:
            color = mix(facet, bottom, (y - edge) / (H - edge) * 0.6)
        else:
            color = base
        line += bytes(color)
    rows.append(bytes(line))

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))
open(sys.argv[1], 'wb').write(png)
