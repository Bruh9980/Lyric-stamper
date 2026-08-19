// script.js
let ws;

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements (declare early to avoid ReferenceError)
  const tabButtons = document.querySelectorAll('.tab');
  const lyricsInput = document.getElementById('lyrics-input');
  const linesList = document.getElementById('lines-list');
  const previewContainer = document.getElementById('preview-container');
  const shiftCheckbox = document.getElementById('shift-checkbox') || document.getElementById('shift-enable'); // fallback id
  const shiftValueInput = document.getElementById('shift-value');
  const playBtn = document.getElementById('play-pause');
  const progress = document.getElementById('progress');
  const info = document.getElementById('audio-info');
  const fileInput = document.getElementById('audio-file');
  const albumArt = document.getElementById('album-art');
  const albumArtStorageKey = 'timed-lyrics-editor-album-art';
  const downloadBtn = document.getElementById('download-lrc');
  const previewWarning = document.getElementById('preview-warning');
  const downloadWarning = document.getElementById('download-warning');

  // state
  let currentTab = null;
  let previewActive = false;
  let lines = []; // { text: string, time: number|null }
  let currentIndex = 0;

  // Tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('bg-blue-50','text-blue-700'));
      btn.classList.add('bg-blue-50','text-blue-700');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      const targetId = btn.dataset.target;
      const target = document.getElementById(targetId);
      if (target) target.classList.remove('hidden');

      currentTab = targetId;
      previewActive = (targetId === 'preview-tab');

      if (previewActive) renderPreview();
      else if (previewContainer) previewContainer.innerHTML = '';
    });
  });

  if (typeof WaveSurfer === 'undefined') {
    if (info) info.textContent = 'Audio player unavailable. Reload the page to retry.';
    return;
  }

  // Wavesurfer init
  ws = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#bfdbfe',
    progressColor: '#3b82f6',
    height: 56,
    barWidth: 2,
    responsive: true
  });

  function formatTime(s) {
    if (!isFinite(s)) return '0:00.00';
    const mm = Math.floor(s/60);
    const ss = Math.floor(s%60).toString().padStart(2,'0');
    const cs = Math.floor((s - Math.floor(s)) * 100).toString().padStart(2,'0');
    return `${mm}:${ss}.${cs}`;
  }

  // Metadata generator (ensure available)
  const metadataConfig = [
    { key: 'ti', inputId: 'input-ti', cbId: 'cb-ti' },
    { key: 'ar', inputId: 'input-ar', cbId: 'cb-ar' },
    { key: 'al', inputId: 'input-al', cbId: 'cb-al' },
    { key: 'length', inputId: 'input-length', cbId: 'cb-length' },
    { key: 'au', inputId: 'input-au', cbId: 'cb-au' },
    { key: 'lr', inputId: 'input-lr', cbId: 'cb-lr' },
    { key: 'by', inputId: 'input-by', cbId: 'cb-by' },
    { key: 'tool', inputId: 'input-tool', cbId: 'cb-tool' },
    { key: 're', inputId: 'input-re', cbId: 'cb-re' },
    { key: 've', inputId: 'input-ve', cbId: 'cb-ve' },
    { key: 'offset', inputId: 'input-offset', cbId: 'cb-offset' }
  ];

  function generateLrcHeader() {
    let header = '';
    metadataConfig.forEach(item => {
      const checkbox = document.getElementById(item.cbId);
      const input = document.getElementById(item.inputId);
      if (checkbox && checkbox.checked) {
        const value = input ? String(input.value).trim() : '';
        header += `[${item.key}:${value}]\n`;
      }
    });
    return header;
  }

  // Wavesurfer events
  ws.on('ready', () => {
    if (playBtn) playBtn.disabled = false;
    const dur = ws.getDuration();
    if (info) info.textContent = `${fileInput.files[0]?.name || 'Audio'} | 0:00.00 / ${formatTime(dur)}`;
    if (progress) progress.max = Math.floor(dur*100);

    // auto-fill title/length if metadata inputs exist
    const filename = fileInput.files[0]?.name || '';
    const base = filename.replace(/\.[^/.]+$/, '');
    const tiInput = document.getElementById('input-ti');
    if (tiInput && (!tiInput.value || tiInput.value.trim() === '')) tiInput.value = base;
    const lengthInput = document.getElementById('input-length');
    if (lengthInput) {
      const mm = Math.floor(dur/60).toString().padStart(2,'0');
      const ss = Math.floor(dur%60).toString().padStart(2,'0');
      lengthInput.value = `${mm}:${ss}`;
    }
  });

  ws.on('audioprocess', (time) => {
    if (progress) progress.value = Math.floor(time*100);
    const dur = ws.getDuration() || 0;
    if (info) info.textContent = `${fileInput.files[0]?.name || 'Audio'} | ${formatTime(time)} / ${formatTime(dur)}`;
    if (previewActive) updatePreviewHighlight(time);
  });

  ws.on('seek', () => {
    const time = ws.getCurrentTime();
    if (progress) progress.value = Math.floor(time*100);
    if (previewActive) updatePreviewHighlight(time);
  });

  // Controls
  if (playBtn) playBtn.addEventListener('click', () => {
    ws.playPause();
    playBtn.textContent = ws.isPlaying() ? 'Pause' : 'Play';
  });

  if (progress) progress.addEventListener('input', (e) => {
    const val = Number(e.target.value)/100;
    ws.seekTo(val / (ws.getDuration() || 1));
  });

  function readText(bytes, start, end) {
    return new TextDecoder('latin1').decode(bytes.slice(start, end));
  }

  function findAlbumArtFromId3(file) {
    return file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      if (bytes.length < 10 || readText(bytes, 0, 3) !== 'ID3') return null;

      const version = bytes[3];
      const flags = bytes[5];
      const tagSize = ((bytes[6] & 0x7f) << 21) |
        ((bytes[7] & 0x7f) << 14) |
        ((bytes[8] & 0x7f) << 7) |
        (bytes[9] & 0x7f);
      let offset = 10 + ((flags & 0x40) ? 4 : 0);
      const tagEnd = Math.min(bytes.length, 10 + tagSize);

      while (offset < tagEnd - 10) {
        const frameId = readText(bytes, offset, offset + (version === 2 ? 3 : 4));
        const frameSize = version === 2
          ? (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5]
          : (version === 4
            ? ((bytes[offset + 4] & 0x7f) << 21) | ((bytes[offset + 5] & 0x7f) << 14) |
              ((bytes[offset + 6] & 0x7f) << 7) | (bytes[offset + 7] & 0x7f)
            : (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7]);
        const headerSize = version === 2 ? 6 : 10;
        if (!frameId.trim() || !frameSize) break;

        const frameStart = offset + headerSize;
        const frameEnd = Math.min(frameStart + frameSize, tagEnd);
        if (frameId === 'APIC' || frameId === 'PIC') {
          const encoding = bytes[frameStart];
          let cursor = frameStart + 1;
          let mime = 'image/jpeg';
          if (version === 2) {
            mime = `image/${readText(bytes, cursor, cursor + 3).toLowerCase()}`;
            cursor += 3;
          } else {
            const mimeEnd = bytes.indexOf(0, cursor);
            if (mimeEnd < 0) return null;
            mime = readText(bytes, cursor, mimeEnd) || mime;
            cursor = mimeEnd + 2;
          }
          const terminatorSize = encoding === 1 || encoding === 2 ? 2 : 1;
          let imageStart = cursor;
          for (let index = cursor; index < frameEnd - terminatorSize; index += 1) {
            const isTerminator = bytes[index] === 0 &&
              (terminatorSize === 1 || bytes[index + 1] === 0);
            if (isTerminator) {
              imageStart = index + terminatorSize;
              break;
            }
          }
          if (imageStart < frameEnd) {
            return new Blob([bytes.slice(imageStart, frameEnd)], { type: mime });
          }
        }
        offset = frameEnd;
      }
      return null;
    });
  }

  function findAlbumArt(file) {
    if (window.jsmediatags) {
      return new Promise((resolve) => {
        const fallback = () => {
          findAlbumArtFromId3(file).then(resolve).catch(() => resolve(null));
        };

        window.jsmediatags.read(file, {
          onSuccess: (result) => {
            const picture = result.tags && result.tags.picture;
            if (!picture || !picture.data || !picture.format) {
              fallback();
              return;
            }
            resolve(new Blob([new Uint8Array(picture.data)], { type: picture.format }));
          },
          onError: fallback
        });
      });
    }
    return findAlbumArtFromId3(file);
  }

  function updateAlbumArt(file) {
    if (!albumArt) return;
    albumArt.onerror = () => {
      albumArt.classList.add('hidden');
      albumArt.removeAttribute('src');
    };
    albumArt.classList.add('hidden');
    albumArt.removeAttribute('src');
    if (!file) return;

    try {
      localStorage.removeItem(albumArtStorageKey);
    } catch {
      // localStorage can be unavailable in private or restricted browsing modes.
    }

    findAlbumArt(file).then((cover) => {
      if (!cover) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl) return;

        albumArt.src = dataUrl;
        albumArt.classList.remove('hidden');

        try {
          localStorage.setItem(albumArtStorageKey, dataUrl);
        } catch {
          // Large covers may exceed localStorage quota; display still works.
        }
      };
      reader.readAsDataURL(cover);
    }).catch(() => {
      albumArt.classList.add('hidden');
    });
  }

  try {
    const savedAlbumArt = localStorage.getItem(albumArtStorageKey);
    if (savedAlbumArt && albumArt) {
      albumArt.src = savedAlbumArt;
      albumArt.classList.remove('hidden');
    }
  } catch {
    // localStorage can be unavailable in private or restricted browsing modes.
  }

  if (fileInput) fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    updateAlbumArt(f);

    // Use createObjectURL for efficient audio loading, but revoke it after Wavesurfer has decoded/loaded
    const url = URL.createObjectURL(f);
    ws.load(url);

    // Revoke the object URL once Wavesurfer signals ready to avoid leaking memory.
    const revokeOnce = () => {
      try { URL.revokeObjectURL(url); } catch (err) { /* ignore */ }
    };

    if (typeof ws.once === 'function') {
      ws.once('ready', revokeOnce);
    } else if (typeof ws.on === 'function') {
      // add a one-time listener fallback
      const handler = () => { revokeOnce(); if (typeof ws.off === 'function') ws.off('ready', handler); if (typeof ws.un === 'function') ws.un('ready', handler); };
      ws.on('ready', handler);
    } else {
      // last resort: attempt to revoke after a delay (not ideal but safe)
      setTimeout(revokeOnce, 5000);
    }
  });

  // Syncer UI
  function rebuildLines() {
    if (!linesList) return;
    linesList.innerHTML = '';
    lines.forEach((ln, idx) => {
      const li = document.createElement('li');
      const ts = document.createElement('div');
      ts.className = 'line-timestamp';
      ts.textContent = ln.time == null ? '--:--.--' : `[${formatTime(ln.time)}]`;
      const txt = document.createElement('div');
      txt.className = 'line-text';
      txt.textContent = ln.text || '';
      li.appendChild(ts);
      li.appendChild(txt);
      li.dataset.index = idx;
      li.addEventListener('click', () => selectLine(idx));
      linesList.appendChild(li);
    });
  }

  function selectLine(i) {
    currentIndex = i;
    if (!linesList) return;
    Array.from(linesList.children).forEach(c => c.classList.remove('bg-blue-50'));
    const el = linesList.children[i];
    if (el) el.classList.add('bg-blue-50');
  }

  function stampCurrent() {
    const t = ws.getCurrentTime();
    if (!isFinite(t)) return;
    if (!lines[currentIndex]) return;
    lines[currentIndex].time = t;
    rebuildLines();
    const next = Math.min(currentIndex+1, lines.length-1);
    selectLine(next);
    if (previewActive) renderPreview();
  }

  // Keyboard shortcuts only when in syncer tab
  document.addEventListener('keydown', (e) => {
    if (currentTab !== 'syncer-tab') return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === 'r') { stampCurrent(); e.preventDefault(); }
    else if (key === 'k' || key === ' ') { ws.playPause(); if (playBtn) playBtn.textContent = ws.isPlaying() ? 'Pause' : 'Play'; e.preventDefault(); }
    else if (key === 'arrowdown') { selectLine(Math.min(currentIndex+1, lines.length-1)); e.preventDefault(); }
    else if (key === 'arrowup') { selectLine(Math.max(0, currentIndex-1)); e.preventDefault(); }
    else if (key === 'arrowleft') { const ct = Math.max(0, ws.getCurrentTime()-5); ws.seekTo(ct / (ws.getDuration() || 1)); e.preventDefault(); }
    else if (key === 'arrowright') { const ct2 = Math.min(ws.getDuration() || 0, ws.getCurrentTime()+5); ws.seekTo(ct2 / (ws.getDuration() || 1)); e.preventDefault(); }
    else if (key === 't') { lines.splice(currentIndex+1,0,{text:'',time:null}); rebuildLines(); selectLine(currentIndex+1); e.preventDefault(); }
    else if (key === 'y') { lines.splice(currentIndex+1,0,{text:'',time:0}); rebuildLines(); selectLine(currentIndex+1); e.preventDefault(); }
    else if (key === 'delete') { if (lines[currentIndex]) { lines[currentIndex].time = null; rebuildLines(); } }
  });

  // mobile buttons (safe attach)
  const mbStamp = document.getElementById('mobile-stamp');
  if (mbStamp) mbStamp.addEventListener('click', stampCurrent);

  // Preview utilities
  function toLrcTime(t) {
    const mm = String(Math.floor(t/60)).padStart(2,'0');
    const ss = String(Math.floor(t%60)).padStart(2,'0');
    const cs = String(Math.floor((t - Math.floor(t))*100)).padStart(2,'0');
    return `${mm}:${ss}.${cs}`;
  }

  function getShiftSeconds() {
    if (!shiftCheckbox || !shiftCheckbox.checked) return 0;
    const v = parseFloat(shiftValueInput?.value);
    return isNaN(v) ? 0 : v;
  }

  function renderPreview() {
    if (!previewContainer) return;
    const header = generateLrcHeader();
    const headerHtml = header ? `<div class="preview-header">${header.replace(/\n/g,'<br>')}</div><hr>` : '';
    const html = lines.map((l, idx) => {
      const hasTime = (l.time != null && isFinite(l.time));
      const shifted = hasTime ? (l.time + getShiftSeconds()) : null;
      const displayTs = hasTime ? toLrcTime(shifted) : '--:--.--';
      const safeText = (l.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const cls = hasTime ? 'preview-line' : 'preview-line grayed';
      return `<div class="${cls}" data-idx="${idx}" data-time="${hasTime ? shifted : ''}"><span class="line-timestamp">[${displayTs}]</span><span class="line-text">${safeText}</span></div>`;
    }).join('');
    previewContainer.innerHTML = headerHtml + html;
    if (previewActive) updatePreviewHighlight(ws.getCurrentTime() || 0);
  }

  function updatePreviewHighlight(currentTime) {
    if (!previewActive || !previewContainer) return;
    const elems = Array.from(previewContainer.querySelectorAll('.preview-line'));
    let activeIdx = -1;
    for (let i = 0; i < elems.length; i++) {
      const tAttr = elems[i].getAttribute('data-time');
      if (!tAttr) continue;
      const t = parseFloat(tAttr);
      if (t <= currentTime) activeIdx = i;
      else break;
    }
    elems.forEach((el, i) => {
      if (i === activeIdx) {
        el.classList.add('active-preview-line');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        el.classList.remove('active-preview-line');
      }
    });
  }

  if (shiftCheckbox) shiftCheckbox.addEventListener('change', () => renderPreview());
  if (shiftValueInput) shiftValueInput.addEventListener('input', () => renderPreview());

  // Parser / Import logic (fixed regex per request)
  const metadataRegex = /^\s*\[(ti|ar|al|length|au|lr|by|tool|re|ve|offset):(.*)\]\s*$/i;
  const timeRegex = /^\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]\s*(.*)$/;

  function parseTimeToSeconds(ts) {
    if (!ts) return null;
    const parts = ts.split(':');
    if (parts.length !== 2) return null;
    const mm = parseInt(parts[0], 10);
    const sec = parseFloat(parts[1]);
    if (isNaN(mm) || isNaN(sec)) return null;
    return mm * 60 + sec;
  }

  function parseImportedLyrics(rawText) {
    const out = [];
    const rows = rawText.replace(/\r/g, '').split('\n');
    rows.forEach(raw => {
      const line = raw.trim();
      if (!line) return;

      // metadata header
      const meta = line.match(metadataRegex);
      if (meta) {
        const key = meta[1].toLowerCase();
        const val = meta[2].trim();
        const inputEl = document.getElementById(`input-${key}`);
        const cbEl = document.getElementById(`cb-${key}`);
        if (inputEl) inputEl.value = val;
        if (cbEl) cbEl.checked = true;

        if (key === 'length') {
          const m = val.match(/^(\d{1,2}):?(\d{2})(?:\.\d+)?$/);
          if (m) {
            const lengthInput = document.getElementById('input-length');
            if (lengthInput) lengthInput.value = `${m[1].padStart(2,'0')}:${m[2]}`;
            const cbLen = document.getElementById('cb-length');
            if (cbLen) cbLen.checked = true;
          }
        }
        if (key === 'offset') {
          const offInput = document.getElementById('input-offset');
          if (offInput) offInput.value = val;
          const cbOff = document.getElementById('cb-offset');
          if (cbOff) cbOff.checked = true;
        }
        return;
      }

      // timestamped lyric using requested regex
      const tmatch = line.match(timeRegex);
      if (tmatch) {
        const rawTs = tmatch[1]; // "2:18.86"
        const lyricText = (tmatch[2] || '').trim();
        const seconds = parseTimeToSeconds(rawTs);
        out.push({
          text: lyricText,
          time: (seconds == null || !isFinite(seconds)) ? null : seconds
        });
      } else {
        // plain lyric
        out.push({ text: line, time: null });
      }
    });
    return out;
  }

  // loadLyricsFromTextarea: use parser to preserve timestamps
  function loadLyricsFromTextarea() {
    const raw = lyricsInput?.value || '';
    if (!raw) {
      lines = [];
      rebuildLines();
      return;
    }
    const parsed = parseImportedLyrics(raw);
    lines = parsed.length ? parsed : [{ text: '', time: null }];
    rebuildLines();
  }

  // wire textarea events
  if (lyricsInput) {
    lyricsInput.addEventListener('blur', loadLyricsFromTextarea);
    lyricsInput.addEventListener('input', () => {
      // update live but avoid overriding manual editing of metadata
      const raw = lyricsInput.value || '';
      const parsed = parseImportedLyrics(raw);
      if (parsed && parsed.length) {
        lines = parsed;
        rebuildLines();
      }
    });
    lyricsInput.addEventListener('paste', () => {
      setTimeout(() => loadLyricsFromTextarea(), 60);
    });
  }

  // Start Sync button (if present)
  const startSyncBtn = document.getElementById('start-sync');
  if (startSyncBtn) {
    startSyncBtn.addEventListener('click', () => {
      loadLyricsFromTextarea();
      const syncBtn = document.querySelector('[data-target="syncer-tab"]');
      if (syncBtn) syncBtn.click();
    });
  }

  // Download handler (respect header + lines)
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      // Warn if any lines missing timestamps (optional behavior kept)
      const incomplete = lines.some(l => l.time == null);
      if (incomplete) {
        if (downloadWarning) downloadWarning.classList.remove('hidden');
        return;
      } else {
        if (downloadWarning) downloadWarning.classList.add('hidden');
      }

      const content = generateLrcContent();
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      // choose filename from metadata title if available
      const tiInput = document.getElementById('input-ti');
      let name = (tiInput && tiInput.value.trim()) ? tiInput.value.trim() : '';
      name = name.replace(/[\\\/:*?"<>|]/g, '').trim(); // sanitize
      if (!name) name = 'lyrics';
      const filename = `${name}.lrc`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // revoke URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }

  // Generate LRC content (header + timestamped lines)
  function generateLrcContent() {
    const header = generateLrcHeader(); // uses metadataConfig
    const shift = getShiftSeconds ? getShiftSeconds() : 0;
    const linesWithTs = lines.filter(l => l.time != null && isFinite(l.time));

    const body = linesWithTs.map(l => {
      const shifted = l.time + shift;
      // ensure mm:ss.cs format via existing toLrcTime
      const ts = toLrcTime(shifted);
      return `[${ts}]${l.text || ''}`;
    }).join('\n');

    return (header ? header + '\n' : '') + body;
  }

  // initial load
  loadLyricsFromTextarea();
  if (tabButtons && tabButtons.length) {
    tabButtons[0].click();
  }
});

// Mobile controls elements (ensure declared)
const mobileControls = document.getElementById('mobile-controls');
const mobilePrev = document.getElementById('mobile-prev');
const mobilePlay = document.getElementById('mobile-play');
const mobileNext = document.getElementById('mobile-next');
const mobileStamp = document.getElementById('mobile-stamp');

const mobileViewportQuery = window.matchMedia('(max-width: 767px)');

function getActiveTabId() {
  const activePane = document.querySelector('.tab-pane:not(.hidden)');
  return activePane ? activePane.id : null;
}

function updateMobileControls() {
  if (!mobileControls) return;

  const isMobile = mobileViewportQuery.matches;
  const activeTab = getActiveTabId();
  const isSyncer = activeTab === 'syncer-tab';
  const isPreview = activeTab === 'preview-tab';

  const shouldShow = isMobile && (isSyncer || isPreview);

  mobileControls.classList.toggle('is-visible', shouldShow);
  mobileControls.classList.toggle('preview-mode', isPreview);

  if (mobileStamp) {
    mobileStamp.hidden = !isSyncer;
  }
}

function updateMobilePlayButton() {
  if (!mobilePlay || !ws) return;
  mobilePlay.textContent = ws.isPlaying() ? 'Pause' : 'Play';
}

function seekAudio(seconds) {
  if (!ws) return;

  const duration = ws.getDuration() || 0;
  const currentTime = ws.getCurrentTime() || 0;
  const nextTime = Math.max(0, Math.min(duration, currentTime + seconds));

  if (duration > 0) {
    ws.seekTo(nextTime / duration);
  }
}

if (mobilePrev) {
  mobilePrev.addEventListener('click', () => seekAudio(-5));
}

if (mobileNext) {
  mobileNext.addEventListener('click', () => seekAudio(5));
}

if (mobilePlay) {
  mobilePlay.addEventListener('click', () => {
    if (!ws) return;
    ws.playPause();
    setTimeout(updateMobilePlayButton, 0);
  });
}

if (mobileStamp) {
  mobileStamp.addEventListener('click', () => {
    if (getActiveTabId() === 'syncer-tab' && typeof stampCurrent === 'function') {
      stampCurrent();
    }
  });
}

// Switch tab: update visibility after pane berubah
document.querySelectorAll('.tab').forEach(tabButton => {
  tabButton.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('is-active');
    });

    tabButton.classList.add('is-active');

    requestAnimationFrame(() => {
      if (typeof updateMobileControls === 'function') {
        updateMobileControls();
      }
    });
  });
});

// Responsif saat orientasi atau ukuran layar berubah
window.addEventListener('resize', updateMobileControls);
mobileViewportQuery.addEventListener?.('change', updateMobileControls);

// Sinkronisasi status tombol dengan audio
ws?.on?.('play', updateMobilePlayButton);
ws?.on?.('pause', updateMobilePlayButton);
ws?.on?.('finish', updateMobilePlayButton);

// Penyesuaian posisi ketika keyboard virtual terbuka
function updateKeyboardOffset() {
  if (!window.visualViewport) return;

  const viewport = window.visualViewport;
  const keyboardHeight = Math.max(
    0,
    window.innerHeight - viewport.height - viewport.offsetTop
  );

  document.documentElement.style.setProperty(
    '--keyboard-offset',
    `${keyboardHeight}px`
  );
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateKeyboardOffset);
  window.visualViewport.addEventListener('scroll', updateKeyboardOffset);
}

updateKeyboardOffset();
updateMobileControls();
