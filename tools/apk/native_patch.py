#!/usr/bin/env python3
"""Native changes of the Hearbor APK without a Gradle project (APK v18.0, 2026-10-17).

There is no Android SDK / D8 in this repository's toolbox, so the native additions are written
in smali (android-native/smali/) and assembled by apktool. Only two entries of the APK change:
the app's own dex (classes4.dex: MainActivity + EpisodeAlarms) and AndroidManifest.xml; every
other entry (classes.dex … classes3.dex, resources.arsc, res/, lib/) is copied byte for byte
from the current APK. tools/apk/patch-native.sh runs the steps:

  patch  DECODED_DIR SMALI_DIR VERSION_CODE VERSION_NAME
         adds EpisodeAlarms.smali, inserts MainActivity.scheduleEpisodeAlarms, the boot receiver
         and RECEIVE_BOOT_COMPLETED into an `apktool d` output, and sets the version
  merge  BASE_APK REBUILT_APK OUT_APK
         BASE_APK with AndroidManifest.xml + classes4.dex taken from REBUILT_APK (META-INF dropped:
         build-apk.sh signs again)
  verify OLD_APK NEW_APK
         checks the manifest additions, that every old class / method of classes4.dex is
         unchanged, that the new methods are there, and that all other entries are identical
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

RECEIVER = (
    '        <receiver android:exported="true" android:name="app.blackx.mobile.EpisodeAlarms">\n'
    '            <intent-filter>\n'
    '                <action android:name="android.intent.action.BOOT_COMPLETED"/>\n'
    '                <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>\n'
    '            </intent-filter>\n'
    '        </receiver>\n'
)
BOOT_PERMISSION = '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>\n'
CHANGED = {'AndroidManifest.xml', 'classes4.dex'}


def patch(dec_dir, smali_dir, version_code, version_name):
    dec = Path(dec_dir)
    src = Path(smali_dir)
    pkg = dec / 'smali_classes4' / 'app' / 'blackx' / 'mobile'
    if not (pkg / 'MainActivity.smali').exists():
        sys.exit('MainActivity.smali not found in smali_classes4 (unexpected APK layout)')
    shutil.copyfile(src / 'app' / 'blackx' / 'mobile' / 'EpisodeAlarms.smali', pkg / 'EpisodeAlarms.smali')

    main = pkg / 'MainActivity.smali'
    text = main.read_text(encoding='utf-8')
    if 'scheduleEpisodeAlarms' not in text:
        snippet = (src / 'MainActivity.scheduleEpisodeAlarms.smali').read_text(encoding='utf-8')
        snippet = '\n'.join(l for l in snippet.splitlines() if not l.startswith('#')).strip() + '\n\n'
        anchor = '.method public exitApp()V'
        if text.count(anchor) != 1:
            sys.exit('exitApp() anchor not found once in MainActivity.smali')
        text = text.replace(anchor, snippet + anchor)
        main.write_text(text, encoding='utf-8')

    manifest = dec / 'AndroidManifest.xml'
    xml = manifest.read_text(encoding='utf-8')
    if 'RECEIVE_BOOT_COMPLETED' not in xml:
        anchor = '<uses-permission android:name="android.permission.VIBRATE"/>\n'
        if xml.count(anchor) != 1:
            sys.exit('VIBRATE permission anchor not found once in the manifest')
        xml = xml.replace(anchor, anchor + BOOT_PERMISSION)
    if 'app.blackx.mobile.EpisodeAlarms' not in xml:
        if xml.count('    </application>') != 1:
            sys.exit('</application> not found once in the manifest')
        xml = xml.replace('    </application>', RECEIVER + '    </application>')
    manifest.write_text(xml, encoding='utf-8')

    yml = dec / 'apktool.yml'
    y = yml.read_text(encoding='utf-8')
    y, n1 = re.subn(r"(\n  versionCode: ).*", r"\g<1>" + str(int(version_code)), y)
    y, n2 = re.subn(r"(\n  versionName: ).*", r"\g<1>" + str(version_name), y)
    if n1 != 1 or n2 != 1:
        sys.exit('versionInfo not found in apktool.yml')
    yml.write_text(y, encoding='utf-8')
    print(f'patched {dec} (versionCode {version_code}, versionName {version_name})')


def merge(base_apk, rebuilt_apk, out_apk):
    with zipfile.ZipFile(rebuilt_apk) as rb:
        fresh = {name: rb.read(name) for name in CHANGED}
    with zipfile.ZipFile(base_apk) as zin, zipfile.ZipFile(out_apk, 'w') as zout:
        for info in zin.infolist():
            if info.filename.startswith('META-INF/'):
                continue
            data = fresh[info.filename] if info.filename in CHANGED else zin.read(info.filename)
            out = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            out.compress_type = info.compress_type
            out.external_attr = info.external_attr
            out.create_system = info.create_system
            zout.writestr(out, data)
    print(f'merged -> {out_apk}')


def _quiet_androguard():
    try:
        from loguru import logger

        logger.remove()
    except Exception:
        pass


def _dex_methods(dex_bytes):
    _quiet_androguard()
    from androguard.core.dex import DEX

    d = DEX(dex_bytes)
    out = {}
    for cls in d.get_classes():
        for m in cls.get_methods():
            code = []
            for ins in m.get_instructions():
                code.append(f'{ins.get_name()} {ins.get_output()}')
            out[(cls.get_name(), m.get_name(), m.get_descriptor())] = code
    return d, out


def verify(old_apk, new_apk):
    _quiet_androguard()
    from androguard.core.apk import APK

    ok = True

    def check(cond, label):
        nonlocal ok
        print(('PASS ' if cond else 'FAIL ') + label)
        ok = ok and bool(cond)

    with zipfile.ZipFile(old_apk) as zo, zipfile.ZipFile(new_apk) as zn:
        skip = ('META-INF/', 'assets/public/')  # the web bundle may differ (build-apk.sh replaces it)
        old_names = {i.filename for i in zo.infolist() if not i.filename.startswith(skip)}
        new_names = {i.filename for i in zn.infolist() if not i.filename.startswith(skip)}
        check(old_names == new_names, 'same native entries (META-INF and the web bundle aside)')
        same = [n for n in old_names & new_names if n not in CHANGED and not n.startswith('assets/public/') and zo.read(n) == zn.read(n)]
        others = [n for n in old_names & new_names if n not in CHANGED and not n.startswith('assets/public/')]
        check(len(same) == len(others), f'native entries byte-identical ({len(same)}/{len(others)})')
        old_dex, new_dex = zo.read('classes4.dex'), zn.read('classes4.dex')

    new = APK(new_apk)
    old = APK(old_apk)
    check(new.get_androidversion_code() == '31', f"versionCode {new.get_androidversion_code()}")
    check(new.get_androidversion_name() == '18.0', f"versionName {new.get_androidversion_name()}")
    check('android.permission.RECEIVE_BOOT_COMPLETED' in new.get_permissions(), 'RECEIVE_BOOT_COMPLETED')
    check(set(old.get_permissions()) <= set(new.get_permissions()), 'every old permission kept')
    receivers = new.get_receivers()
    check('app.blackx.mobile.EpisodeAlarms' in receivers, 'EpisodeAlarms receiver declared')
    filters = new.get_intent_filters('receiver', 'app.blackx.mobile.EpisodeAlarms')
    actions = set(filters.get('action', []))
    check({'android.intent.action.BOOT_COMPLETED', 'android.intent.action.MY_PACKAGE_REPLACED'} <= actions, f'receiver actions {sorted(actions)}')
    check(new.get_main_activity() == old.get_main_activity(), f'main activity {new.get_main_activity()}')
    check(new.get_min_sdk_version() == old.get_min_sdk_version() and new.get_target_sdk_version() == old.get_target_sdk_version(), 'min / target SDK unchanged')

    _, old_m = _dex_methods(old_dex)
    _new_d, new_m = _dex_methods(new_dex)
    changed = [k for k in old_m if k not in new_m or new_m[k] != old_m[k]]
    check(not changed, f'all {len(old_m)} old methods of classes4.dex unchanged' + (f' — changed: {changed[:3]}' if changed else ''))
    added = sorted(k for k in new_m if k not in old_m)
    want = {
        ('Lapp/blackx/mobile/MainActivity;', 'scheduleEpisodeAlarms', '(Ljava/lang/String;)I'),
        ('Lapp/blackx/mobile/EpisodeAlarms;', 'schedule', '(Landroid/content/Context; Ljava/lang/String;)I'),
        ('Lapp/blackx/mobile/EpisodeAlarms;', 'onReceive', '(Landroid/content/Context; Landroid/content/Intent;)V'),
    }
    names = {(c, n) for (c, n, _d) in added}
    check({(c, n) for (c, n, _d) in want} <= names, f'new methods present ({len(added)} added)')
    # (patch-native.sh disassembles the result again and checks the @JavascriptInterface annotation)
    print('VERIFIED' if ok else 'NOT VERIFIED')
    return 0 if ok else 1


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == 'patch' and len(sys.argv) == 6:
        patch(*sys.argv[2:6])
    elif cmd == 'merge' and len(sys.argv) == 5:
        merge(*sys.argv[2:5])
    elif cmd == 'verify' and len(sys.argv) == 4:
        sys.exit(verify(*sys.argv[2:4]))
    else:
        sys.exit(__doc__)
