// 가상 'OO시' 공약 3개가 든 최소 HWPX(OWPML zip)를 만든다. 실제 지자체·후보와 관계없다.
// 실행: node tests/fixtures/make-hwpx.ts [출력 경로]  (기본 tests/fixtures/pledge-sample.hwpx)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const NS_HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
const NS_HS = 'http://www.hancom.co.kr/hwpml/2011/section';
const NS_HC = 'http://www.hancom.co.kr/hwpml/2011/core';
const NS_HH = 'http://www.hancom.co.kr/hwpml/2011/head';
const NS_HV = 'http://www.hancom.co.kr/hwpml/2011/version';
const NS_OCF = 'urn:oasis:names:tc:opendocument:xmlns:container';
const NS_OPF = 'http://www.idpf.org/2007/opf/';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

// level 0 = 본문, 1~7 = 개요 1~7 (paraPr/style id 와 같다)
type Item = { level: number; text: string };

export const PLEDGE_ITEMS: Item[] = [
  { level: 1, text: 'OO시 시장 선거공약서 (가상)' },
  { level: 0, text: '이 문서는 시연을 위해 만든 가상의 공약서입니다. 실제 지자체·후보와 관계없습니다.' },
  { level: 2, text: '1. 교통' },
  { level: 0, text: '1. OO역 환승주차장 건립 — OO역 앞 시유지에 500면 규모 환승주차장을 짓는다.' },
  { level: 2, text: '2. 교육' },
  { level: 0, text: '2. 초등 돌봄교실 확대 — 초등학교 돌봄교실 운영 시간을 저녁 8시까지 늘린다.' },
  { level: 2, text: '3. 환경' },
  { level: 0, text: '3. OO천 생태하천 복원 — OO천 하류 3km 구간을 생태하천으로 복원한다.' },
];

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SECPR_RUN =
  '<hp:run charPrIDRef="0"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" ' +
  'tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" ' +
  'masterPageCnt="0"/><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" ' +
  'sameGap="0"/></hp:ctrl></hp:run>';

function paragraphXml(item: Item, i: number): string {
  return (
    `<hp:p id="${i}" paraPrIDRef="${item.level}" styleIDRef="${item.level}" pageBreak="0" columnBreak="0" merged="0">` +
    (i === 0 ? SECPR_RUN : '') +
    `<hp:run charPrIDRef="0"><hp:t>${escapeXml(item.text)}</hp:t></hp:run></hp:p>`
  );
}

function sectionXml(items: Item[]): string {
  return (
    `${XML_DECL}<hs:sec xmlns:hp="${NS_HP}" xmlns:hs="${NS_HS}" xmlns:hc="${NS_HC}">` +
    items.map(paragraphXml).join('') +
    '</hs:sec>'
  );
}

function paraPrXml(i: number): string {
  return (
    `<hh:paraPr id="${i}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
    '<hh:align horizontal="JUSTIFY" vertical="BASELINE"/>' +
    `<hh:heading type="${i === 0 ? 'NONE' : 'OUTLINE'}" idRef="0" level="${Math.max(i - 1, 0)}"/></hh:paraPr>`
  );
}

function styleXml(i: number): string {
  const [name, eng] = i === 0 ? ['바탕글', 'Normal'] : [`개요 ${i}`, `Outline ${i}`];
  return (
    `<hh:style id="${i}" type="PARA" name="${name}" engName="${eng}" paraPrIDRef="${i}" ` +
    `charPrIDRef="0" nextStyleIDRef="${i}" langID="1042" lockForm="0"/>`
  );
}

function headerXml(): string {
  const ids = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    `${XML_DECL}<hh:head xmlns:hh="${NS_HH}" xmlns:hp="${NS_HP}" version="1.5" secCnt="1">` +
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>' +
    `<hh:refList><hh:paraProperties itemCnt="8">${ids.map(paraPrXml).join('')}</hh:paraProperties>` +
    `<hh:styles itemCnt="8">${ids.map(styleXml).join('')}</hh:styles></hh:refList></hh:head>`
  );
}

const VERSION_XML =
  `${XML_DECL}<hv:HCFVersion xmlns:hv="${NS_HV}" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" ` +
  'buildNumber="0" os="1" xmlVersion="1.5" application="pledgetracker-fixture" appVersion="0"/>';

const CONTAINER_XML =
  `${XML_DECL}<ocf:container xmlns:ocf="${NS_OCF}"><ocf:rootfiles>` +
  '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>' +
  '</ocf:rootfiles></ocf:container>';

const CONTENT_HPF =
  `${XML_DECL}<opf:package xmlns:opf="${NS_OPF}" version="" unique-identifier="" id="">` +
  '<opf:metadata><opf:title/><opf:language/></opf:metadata><opf:manifest>' +
  '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>' +
  '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>' +
  '</opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/>' +
  '<opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>';

/** 결정적 바이트: 항목 순서 고정, mimetype 만 무압축, 수정 시각 1980-01-01. */
export function buildHwpx(items: Item[] = PLEDGE_ITEMS): Uint8Array {
  const mtime = new Date(1980, 0, 1, 0, 0, 0);
  return zipSync(
    {
      mimetype: [strToU8('application/hwp+zip'), { level: 0 }],
      'version.xml': strToU8(VERSION_XML),
      'META-INF/container.xml': strToU8(CONTAINER_XML),
      'Contents/content.hpf': strToU8(CONTENT_HPF),
      'Contents/header.xml': strToU8(headerXml()),
      'Contents/section0.xml': strToU8(sectionXml(items)),
    },
    { level: 6, mtime },
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? 'tests/fixtures/pledge-sample.hwpx';
  writeFileSync(out, buildHwpx());
  console.log(out);
}
