// Real air times in the app (client/src/mobile/airingSchedule.js): AniList's next airing,
// matched to catalogue records by MAL id. Nothing is guessed: a record without a match has no
// time, and a show is listed on the day of its real air time (local time of the device).
import test from 'node:test';
import assert from 'node:assert/strict';
import { airingFor, airingLine, airingState, buildScheduleDay, countdownText } from '../src/mobile/airingSchedule.js';
import { dayIdOf } from '../src/mobile/scheduleDays.js';

const NOW = Date.now();
const sec = (ms) => Math.floor(ms / 1000);
const item = (n, extra = {}) => ({ objectID: `Show ${n}`, titleEn: `Show ${n}`, malId: 1000 + n, ...extra });

test('a record is matched by MAL id only', () => {
  const map = new Map([[1001, { airingAt: sec(NOW + 3600e3), episode: 4 }]]);
  assert.equal(airingFor(item(1), map).episode, 4);
  assert.equal(airingFor(item(2), map), null);
  assert.equal(airingFor({ objectID: 'x' }, map), null);
  assert.equal(airingFor(item(1), null), null);
});

test('states: aired, soon (24 h), next week (today’s already aired), later', () => {
  assert.equal(airingState(sec(NOW - 60e3), NOW), 'aired');
  assert.equal(airingState(sec(NOW + 3 * 3600e3), NOW), 'soon');
  assert.equal(airingState(sec(NOW + 7 * 86400e3 - 60e3), NOW), 'nextWeek');
  assert.equal(airingState(sec(NOW + 3 * 86400e3), NOW), 'later');
});

test('countdowns in Egyptian Arabic and English', () => {
  assert.equal(countdownText(sec(NOW + 60e3), NOW, true), 'بعد دقيقة');
  assert.equal(countdownText(sec(NOW + 2 * 60e3), NOW, true), 'بعد دقيقتين');
  assert.equal(countdownText(sec(NOW + 2 * 3600e3), NOW, true), 'بعد ساعتين');
  assert.equal(countdownText(sec(NOW + 3 * 3600e3 + 10 * 60e3), NOW, true), 'بعد 3 ساعات و 10 دقايق');
  assert.equal(countdownText(sec(NOW + 2 * 3600e3), NOW, false), 'dans 2 h');
  assert.equal(countdownText(sec(NOW - 1000), NOW, true), '');
});

test('a card line carries the real episode and when it airs', () => {
  const line = airingLine({ airingAt: sec(NOW + 90 * 60e3), episode: 8 }, NOW, true);
  assert.match(line, /^الحلقة 8 • بعد ساعة/);
  assert.equal(airingLine(null, NOW, true), '');
});

test('a weekday lists its shows by real air time, then the tagged ones without a time', () => {
  const soon = sec(NOW + 2 * 3600e3);
  const day = dayIdOf(new Date(soon * 1000));
  const otherDay = dayIdOf(new Date((soon + 86400) * 1000));
  const map = new Map([
    [1001, { airingAt: soon, episode: 3 }],
    // tagged with `day` by the catalogue, but really airs the next day: listed there only
    [1003, { airingAt: soon + 86400, episode: 9 }]
  ]);
  const airingItems = [item(1), item(2)];
  const dayItems = [item(3), item(4)];
  const list = buildScheduleDay({ dayId: day, airingItems, dayItems, map });
  assert.deepEqual(list.map((x) => x.objectID), ['Show 1', 'Show 4']);
  assert.equal(list[0].airing.episode, 3);
  assert.equal(list[1].airing, null);
  const next = buildScheduleDay({ dayId: otherDay, airingItems, dayItems: [], map });
  assert.deepEqual(next.map((x) => x.objectID), []);
  const nextWithTagged = buildScheduleDay({ dayId: otherDay, airingItems: [item(3)], dayItems: [], map });
  assert.deepEqual(nextWithTagged.map((x) => x.objectID), ['Show 3']);
});

test('«all airing» = every show on air, soonest first, then the ones without a time', () => {
  const map = new Map([
    [1002, { airingAt: sec(NOW + 5 * 3600e3), episode: 1 }],
    [1003, { airingAt: sec(NOW + 1 * 3600e3), episode: 2 }]
  ]);
  const list = buildScheduleDay({ dayId: 'all_airing', airingItems: [item(1), item(2), item(3)], map });
  assert.deepEqual(list.map((x) => x.objectID), ['Show 3', 'Show 2', 'Show 1']);
});

test('without air times the tagged list is shown unchanged (nothing invented)', () => {
  const list = buildScheduleDay({ dayId: 'السبت', airingItems: [item(1)], dayItems: [item(5), item(6)], map: new Map() });
  assert.deepEqual(list.map((x) => x.objectID), ['Show 5', 'Show 6']);
  assert.ok(list.every((x) => x.airing === null));
});
