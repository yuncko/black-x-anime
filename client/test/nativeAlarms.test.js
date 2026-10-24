// APK air-time reminders (client/src/mobile/nativeAlarms.js) and the data saver modes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ALARMS, alarmIdFor, buildAlarmList, nativeAlarmsSupported, scheduleNativeAlarms } from '../src/mobile/nativeAlarms.js';
import { dataSaverFor } from '../src/mobile/dataSaver.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');

test('alarm ids: stable, positive 31-bit, different per episode', () => {
  const a = alarmIdFor('61323:3');
  assert.equal(a, alarmIdFor('61323:3'));
  assert.notEqual(a, alarmIdFor('61323:4'));
  assert.ok(Number.isInteger(a) && a > 0 && a < 2 ** 31);
});

test('one reminder per followed title with a real air time in the next 8 days', () => {
  const airing = new Map([
    [61323, { airingAt: NOW / 1000 + 3600, episode: 3 }],
    [61603, { airingAt: NOW / 1000 - 60, episode: 3 }], // already aired
    [64340, { airingAt: NOW / 1000 + 9 * 86400, episode: 4 }], // too far
    [62907, { airingAt: NOW / 1000 + 600, episode: null }]
  ]);
  const followed = [
    { malId: 61323, titleEn: 'Blue Box Season 2' },
    { malId: '61323', titleEn: 'duplicate' },
    { malId: 61603, titleEn: 'Aoashi' },
    { malId: 64340, titleEn: 'Overgeared' },
    { malId: 62907, titleEn: 'Uncle' },
    { titleEn: 'No MAL id' }
  ];
  const list = buildAlarmList({ followed, airingMap: airing, now: NOW, isRtl: true });
  assert.equal(list.length, 2);
  assert.equal(list[0].at, NOW + 600_000, 'soonest first');
  assert.match(list[0].body, /^الحلقة الجديدة بتتعرض دلوقتي في اليابان/);
  assert.equal(list[1].title, 'ميعاد Blue Box Season 2');
  assert.match(list[1].body, /^الحلقة 3 بتتعرض دلوقتي في اليابان\. هتنزل على Hearbor لما تتترجم\.$/);
  const en = buildAlarmList({ followed, airingMap: airing, now: NOW, isRtl: false });
  assert.match(en[1].body, /^Episode 3 is airing in Japan now\./);
  assert.deepEqual(buildAlarmList({ followed, airingMap: null, now: NOW }), []);
});

test('at most MAX_ALARMS reminders', () => {
  const airing = new Map();
  const followed = [];
  for (let i = 1; i <= MAX_ALARMS + 10; i += 1) {
    airing.set(i, { airingAt: NOW / 1000 + i * 60, episode: 1 });
    followed.push({ malId: i, titleEn: `T${i}` });
  }
  assert.equal(buildAlarmList({ followed, airingMap: airing, now: NOW }).length, MAX_ALARMS);
});

test('the bridge: only when the APK has it', () => {
  assert.equal(nativeAlarmsSupported(), false);
  assert.equal(scheduleNativeAlarms([{ id: 1 }]), -1);
  let got = null;
  globalThis.window = { BlackXNativeAuth: { scheduleEpisodeAlarms: (json) => ((got = JSON.parse(json)), got.length) } };
  try {
    assert.equal(nativeAlarmsSupported(), true);
    assert.equal(scheduleNativeAlarms([{ id: 7, at: 1 }]), 1);
    assert.deepEqual(got, [{ id: 7, at: 1 }]);
  } finally {
    delete globalThis.window;
  }
});

test('data saver modes: auto, mobile data, on, off', () => {
  assert.equal(dataSaverFor('auto', false, true), false, 'auto ignores mobile data');
  assert.equal(dataSaverFor('auto', true, false), true);
  assert.equal(dataSaverFor('cellular', false, true), true);
  assert.equal(dataSaverFor('cellular', false, false), false);
  assert.equal(dataSaverFor('cellular', true, false), true);
  assert.equal(dataSaverFor('on', false, false), true);
  assert.equal(dataSaverFor('off', true, true), false);
});
