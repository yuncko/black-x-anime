#!/usr/bin/env python3
"""Rebuild the Hearbor APK with a fresh web bundle (no Android SDK needed).

The APK is a Capacitor shell whose UI lives in `assets/public/`. This script
copies every entry of the current APK except the web bundle and the old
signature, adds the new Vite build (built with VITE_BUILD_TARGET=apk), and
writes an UNSIGNED, zipaligned APK (stored entries start on a 4-byte
boundary, like `zipalign -p 4`; Android 11+ refuses to install an app
targeting API 30+ whose resources.arsc is not aligned). Sign it afterwards
with apksigner, which keeps the alignment (see tools/apk/README.md).

Usage: repack-apk.py <base.apk> <vite-dist-dir> <out-unsigned.apk>
"""
import os
import struct
import sys
import zipfile

ALIGNMENT = 4
# .so files must be page aligned when the app does not extract native libs.
SO_ALIGNMENT = 4096
# Extra-field id Android's zipalign uses for alignment padding.
ZIPALIGN_EXTRA_ID = 0xD935

SKIP_PREFIXES = ('assets/public/', 'META-INF/')
# Files in client/public that must not be bundled into the app itself.
SKIP_DIST_SUFFIXES = ('.apk', '.map')


def write_entry(dst, info, data):
    """Write one entry; stored entries get a zipalign-style padding extra field."""
    if info.compress_type == zipfile.ZIP_STORED:
        align = SO_ALIGNMENT if info.filename.endswith('.so') else ALIGNMENT
        name_len = len(info.filename.encode('utf-8'))
        header_end = dst.fp.tell() + 30 + name_len
        # The padding record needs at least 6 bytes: id, size, alignment.
        pad = 6 + (-(header_end + 6)) % align
        info.extra = struct.pack('<HHH', ZIPALIGN_EXTRA_ID, pad - 4, align) + b'\0' * (pad - 6)
    else:
        info.extra = b''
    dst.writestr(info, data)


def check_alignment(path):
    raw = open(path, 'rb').read()
    bad = []
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            if info.compress_type != zipfile.ZIP_STORED:
                continue
            off = info.header_offset
            name_len, extra_len = struct.unpack('<HH', raw[off + 26:off + 30])
            data_off = off + 30 + name_len + extra_len
            align = SO_ALIGNMENT if info.filename.endswith('.so') else ALIGNMENT
            if data_off % align:
                bad.append(info.filename)
    return bad


def main(base_apk, dist_dir, out_apk):
    if not os.path.isfile(os.path.join(dist_dir, 'index.html')):
        sys.exit(f'{dist_dir} has no index.html - run the APK Vite build first')
    added = kept = 0
    with zipfile.ZipFile(base_apk) as src, zipfile.ZipFile(out_apk, 'w') as dst:
        for info in src.infolist():
            if info.filename.startswith(SKIP_PREFIXES):
                continue
            data = src.read(info.filename)
            clone = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            clone.compress_type = info.compress_type
            clone.external_attr = info.external_attr
            write_entry(dst, clone, data)
            kept += 1
        for root, _dirs, files in os.walk(dist_dir):
            for name in sorted(files):
                if name.endswith(SKIP_DIST_SUFFIXES):
                    continue
                path = os.path.join(root, name)
                rel = os.path.relpath(path, dist_dir).replace(os.sep, '/')
                info = zipfile.ZipInfo(f'assets/public/{rel}', date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                with open(path, 'rb') as fh:
                    write_entry(dst, info, fh.read())
                added += 1
    misaligned = check_alignment(out_apk)
    if misaligned:
        sys.exit(f'alignment failed for {len(misaligned)} entries, e.g. {misaligned[:3]}')
    print(f'kept {kept} entries, added {added} web files, all stored entries aligned -> {out_apk}')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
