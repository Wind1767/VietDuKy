import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceInfo, maskIp, countryClash } from '../../src/session-device.js';
import { UA } from '../helpers/d1.mjs';

const req = (ua, extra = {}) => new Request('http://x/', { headers: { 'User-Agent': ua, ...extra } });

test('Nhận diện trình duyệt + hệ điều hành, bỏ số phiên bản', () => {
  assert.equal(deviceInfo(req(UA.chromeWin)).key, 'Chrome|Windows|d');
  assert.equal(deviceInfo(req(UA.chromeWinNewer)).key, 'Chrome|Windows|d');
  assert.equal(deviceInfo(req(UA.firefoxLinux)).key, 'Firefox|Linux|d');
  assert.equal(deviceInfo(req(UA.safariIphone)).key, 'Safari|iOS|m');
  assert.equal(deviceInfo(req(UA.chromeWin)).label, 'Chrome · Windows');
});

test('Edge và Opera không bị nhận nhầm là Chrome', () => {
  assert.match(deviceInfo(req('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0')).key, /^Edge\|/);
  assert.match(deviceInfo(req('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 OPR/110.0')).key, /^Opera\|/);
});

test('Không có User-Agent (curl, script): khác mọi trình duyệt thật', () => {
  const k = deviceInfo(new Request('http://x/')).key;
  assert.notEqual(k, deviceInfo(req(UA.chromeWin)).key);
});

test('Quốc gia: chỉ nhận mã 2 chữ hợp lệ', () => {
  assert.equal(deviceInfo(req(UA.chromeWin, { 'CF-IPCountry': 'vn' })).country, 'VN');
  assert.equal(deviceInfo(req(UA.chromeWin, { 'CF-IPCountry': 'XX' })).country, '');
  assert.equal(deviceInfo(req(UA.chromeWin, { 'CF-IPCountry': 'T1' })).country, '');
  assert.equal(countryClash('VN', 'RU'), true);
  assert.equal(countryClash('VN', ''), false);
  assert.equal(countryClash('', 'RU'), false);
});

test('Che địa chỉ IP', () => {
  assert.equal(maskIp('113.161.10.20'), '113.161.xxx.xxx');
  assert.equal(maskIp('2402:800:1234:5678::1'), '2402:800:1234:…');
  assert.equal(maskIp(''), '');
});
