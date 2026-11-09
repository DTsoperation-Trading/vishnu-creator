import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { configure } from '@testing-library/react';
import { appLanguageOptions } from '../i18n/language.js';
import { loadLanguageCatalog } from '../i18n/translated-copy.js';
import { beforeEach } from 'vitest';

configure({ asyncUtilTimeout: 5000 });

// Polyfill HTMLMediaElement methods not implemented in jsdom
// jsdom throws "Not implemented" for play/pause on audio/video elements
// Define them on HTMLMediaElement.prototype so tests can mock/spy on them
// and they will be inherited by both HTMLAudioElement and HTMLVideoElement

// State for media elements
let mediaCurrentTime = 0;
let mediaPlaybackRate = 1;
let mediaMuted = false;
let videoDuration = NaN;

if (typeof HTMLMediaElement !== 'undefined') {
  // play/pause - make writable so tests can spy
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: function() { return Promise.resolve(); }
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value: function() { }
  });

  // currentTime
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get() { return mediaCurrentTime; },
    set(v) { mediaCurrentTime = v; }
  });

  // playbackRate
  Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
    configurable: true,
    get() { return mediaPlaybackRate; },
    set(v) { mediaPlaybackRate = v; }
  });

  // muted
  Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
    configurable: true,
    get() { return mediaMuted; },
    set(v) { mediaMuted = v; }
  });
}

// Video-specific properties
if (typeof HTMLVideoElement !== 'undefined') {
  // duration - video only
  Object.defineProperty(HTMLVideoElement.prototype, 'duration', {
    configurable: true,
    get() { return videoDuration; },
    set(v) { videoDuration = v; }
  });
}

// Reset media element state between tests
beforeEach(() => {
  mediaCurrentTime = 0;
  mediaPlaybackRate = 1;
  mediaMuted = false;
  videoDuration = NaN;
});

// Component tests exercise initialized copy; cold loading is covered separately.
await Promise.all(appLanguageOptions.map(({ value }) => loadLanguageCatalog(value)));

Object.defineProperty(window.navigator, 'language', {
  configurable: true,
  value: 'zh-CN'
});
Object.defineProperty(window.navigator, 'languages', {
  configurable: true,
  value: ['zh-CN']
});

Object.defineProperty(window, 'confirm', {
  configurable: true,
  writable: true,
  value: () => true
});

type RectLike = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  toJSON(): Record<string, number>;
};

function createRect(): RectLike {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      };
    }
  };
}

function createRectList(rects: RectLike[] = []) {
  return {
    length: rects.length,
    item(index: number) {
      return rects[index] ?? null;
    },
    [Symbol.iterator]: function* iterator() {
      yield* rects;
    }
  };
}

const rangePrototype = document.createRange().constructor.prototype as Range;

if (typeof rangePrototype.getBoundingClientRect !== 'function') {
  Object.defineProperty(rangePrototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return createRect();
    }
  });
}

if (typeof rangePrototype.getClientRects !== 'function') {
  Object.defineProperty(rangePrototype, 'getClientRects', {
    configurable: true,
    value() {
      return createRectList();
    }
  });
}
