import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname; // the site folder
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p.endsWith('/')) p += 'index.html';
    const body = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
await page.goto(`http://localhost:${port}/app/`);

const result = await page.evaluate(async () => {
  const log = [];
  const ok = (name, cond, extra = '') => log.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);

  const { scan, build } = await import('/app/js/importer.js');
  const { sortPhotos, groupChapters } = await import('/app/js/chapters.js');
  const { openAlbum } = await import('/app/js/store.js');
  const { openViewer } = await import('/app/js/viewer.js');
  const { renderEditor } = await import('/app/js/editor.js');
  const ops = await import('/app/js/ops.js');
  const { saveChapter } = await import('/app/js/store.js');

  const opfs = await navigator.storage.getDirectory();
  for await (const [n] of opfs.entries()) await opfs.removeEntry(n, { recursive: true });
  const src = await opfs.getDirectoryHandle('src', { create: true });
  const dest = await opfs.getDirectoryHandle('album', { create: true });

  // 36 synthetic photos in mixed shapes
  const shapes = [[1200, 800], [800, 1200], [1000, 1000], [1600, 900], [900, 1600], [3000, 2000]];
  for (let i = 0; i < 36; i++) {
    const [w, h] = shapes[i % shapes.length];
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = `hsl(${(i * 37) % 360} 60% 50%)`;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = '120px sans-serif';
    g.fillText(String(i + 1), 60, 200);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    const fh = await src.getFileHandle(`IMG_${String(i + 1).padStart(3, '0')}.jpg`, { create: true });
    const w2 = await fh.createWritable();
    await w2.write(blob);
    await w2.close();
  }

  const { photos, skipped } = await scan(src);
  ok('scan finds all photos', photos.length === 36, photos.length);
  ok('scan reads dimensions', photos.every((p) => shapes.some(([w, h]) => w === p.w && h === p.h)));
  const groups = groupChapters(sortPhotos(photos));
  ok('groups cover all photos', groups.reduce((s, g) => s + g.length, 0) === 36, `chapters=${groups.length}`);

  const written = await build(dest, groups);
  ok('build writes chapter folders', written.length === groups.length, written.join(','));

  const album = await openAlbum(dest);
  ok('album reopens from disk', album.chapters.length === groups.length);
  const ch = album.chapters[0];
  ok('manifest has pages with thumbs', ch.pages.length > 0 && ch.pages.every((p) => p.thumb));
  ok('copies are 1080p-bounded', ch.photos.every((p) => Math.max(p.w, p.h) <= 1920));
  ok('every page 1–4 photos', album.chapters.every((c) => c.pages.every((p) => p.photos.length >= 1 && p.photos.length <= 4)));
  const idsOnPages = album.chapters.every((c) => c.pages.flatMap((p) => p.photos).sort().join() === c.photos.map((p) => p.id).sort().join());
  ok('every photo on exactly one page', idsOnPages);
  const thumbFile = await (await (await ch.dir.getDirectoryHandle('pages')).getFileHandle(ch.pages[0].id + '.jpg')).getFile();
  ok('page thumbnail written', thumbFile.size > 500, thumbFile.size);

  // viewer
  const v = openViewer(album, { chapter: 0, page: 0 });
  await new Promise((r) => setTimeout(r, 900));
  const viewerEl = document.querySelector('.viewer');
  ok('viewer open', !!viewerEl);
  const imgsOf = () => [...document.querySelectorAll('.layer:last-of-type .photo')];
  const first = imgsOf();
  ok('viewer shows page photos', first.length === ch.pages[0].photos.length, first.length);
  const stageRect = document.querySelector('.stage').getBoundingClientRect();
  const noCrop = first.every((im) => Math.abs(im.naturalWidth / im.naturalHeight - parseFloat(im.style.width) / parseFloat(im.style.height)) < 0.01);
  ok('viewer never crops (displayed ratio = file ratio)', noCrop);
  ok('viewer photos inside the stage', first.every((im) => parseFloat(im.style.left) >= 0 && parseFloat(im.style.top) >= 0 && parseFloat(im.style.left) + parseFloat(im.style.width) <= stageRect.width + 0.5 && parseFloat(im.style.top) + parseFloat(im.style.height) <= stageRect.height + 0.5));

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  ok('arrow right goes to page 2', v.index === 1, v.index);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  ok('arrow left goes back', v.index === 0);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  const total = album.chapters.reduce((s, c) => s + c.pages.length, 0);
  ok('End goes to the last page across chapters', v.index === total - 1, `${v.index}/${total}`);
  ok('old layers cleaned up', document.querySelectorAll('.layer').length === 1, document.querySelectorAll('.layer').length);
  document.querySelector('[aria-label="Show pages"]').click();
  await new Promise((r) => setTimeout(r, 600));
  ok('thumbnail strip lists every page', document.querySelectorAll('.thumb').length === total);
  ok('chapter covers marked', document.querySelectorAll('.thumb.cover').length === album.chapters.length);
  const loaded = [...document.querySelectorAll('.thumb img')].filter((i) => i.src).length;
  ok('some thumbnails load', loaded > 0, loaded);
  ok('mute hidden when no music', document.querySelector('[aria-label="Sound on or off"]').hidden === true);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes the viewer', !document.querySelector('.viewer'));

  // editor + save round trip
  const mount = document.getElementById('app');
  renderEditor(mount, album, 0, { onBack() {}, onSwitch() {}, onView() {} });
  await new Promise((r) => setTimeout(r, 400));
  ok('editor renders page cards', document.querySelectorAll('.card').length === ch.pages.length);

  const pageIdx = ch.pages.findIndex((p) => p.photos.length >= 2);
  const victim = ch.pages[pageIdx].photos[0];
  const before = ch.photos.length;
  ops.deletePhoto(ch, victim);
  ok('delete removes photo from chapter', ch.photos.length === before - 1);
  ops.movePage(ch, 0, 1);
  const opts = ops.layoutOptions(ch, ch.pages[0]);
  if (opts.length > 1) ops.setLayout(ch, 0, opts[opts.length - 1].id);
  await saveChapter(ch);
  const reopened = await openAlbum(dest);
  const ch2 = reopened.chapters[0];
  ok('saved edits survive reopening', ch2.photos.length === before - 1 && ch2.pages.map((p) => p.id).join() === ch.pages.map((p) => p.id).join());
  let gone = false;
  try { await (await ch.dir.getDirectoryHandle('photos')).getFileHandle(victim + '.jpg'); } catch { gone = true; }
  ok('deleted photo file removed from disk', gone);
  ok('every page still has a thumbnail after save', ch2.pages.every((p) => p.thumb));

  return log;
});
console.log(result.join('\n'));
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
server.close();
