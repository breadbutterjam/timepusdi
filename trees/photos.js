'use strict';

/* =========================================================================
   Tree photos
   Loaded after app.js, which calls photoPanelOpen / photoPanelClose when the
   tree panel opens and closes. Photos save the moment they are added or
   removed; Save and Cancel on the panel only concern the tree's details.

   Each photo is shrunk in the browser (full size ~1600 px, thumbnail ~400 px,
   both JPEG), so the free storage allowance goes a long way: roughly 300 KB
   per photo, around 3,000 photos per GB.
   ========================================================================= */

const MAX_PHOTOS_PER_TREE = 10;
const FULL_MAX_PX = 1600;
const FULL_QUALITY = 0.8;
const THUMB_MAX_PX = 400;
const THUMB_QUALITY = 0.7;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;   // matches the bucket's limit in supabase-photos.sql
const SWIPE_PX = 50;

// ---------- Storage (same idea as the tree storage in app.js) ----------
function photoUrl(path) {
    return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function photoFromRow(row) {
    return {
        id: row.id,
        path: row.path,
        thumbPath: row.thumb_path,
        url: photoUrl(row.path),
        thumbUrl: photoUrl(row.thumb_path)
    };
}

let cachedUserId = null;
async function currentUserId() {
    if (cachedUserId) return cachedUserId;
    const { data, error } = await sb.auth.getSession();
    if (error || !data.session) throw error || new Error('Not signed in');
    cachedUserId = data.session.user.id;
    return cachedUserId;
}

async function removePhotoFiles(paths) {
    try {
        await sb.storage.from(PHOTO_BUCKET).remove(paths);
    } catch (err) {
        console.error('Could not remove photo files:', err);
    }
}

storage.listPhotos = async function (treeId) {
    const { data, error } = await sb.from(PHOTO_TABLE)
        .select('id, path, thumb_path')
        .eq('tree_id', treeId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(photoFromRow);
};

// Upload both files, then record the photo. If anything fails, nothing is left behind.
storage.addPhoto = async function (treeId, processed) {
    const uid = await currentUserId();
    const id = generateId();
    const path = `${uid}/${treeId}/${id}.jpg`;
    const thumbPath = `${uid}/${treeId}/${id}_thumb.jpg`;
    const bucket = sb.storage.from(PHOTO_BUCKET);
    const opts = { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false };

    const uploaded = [];
    try {
        let res = await bucket.upload(path, processed.full, opts);
        if (res.error) throw res.error;
        uploaded.push(path);
        res = await bucket.upload(thumbPath, processed.thumb, opts);
        if (res.error) throw res.error;
        uploaded.push(thumbPath);

        const { error } = await sb.from(PHOTO_TABLE).insert({
            id,
            tree_id: treeId,
            path,
            thumb_path: thumbPath,
            width: processed.width,
            height: processed.height,
            bytes: processed.full.size
        });
        if (error) throw error;
    } catch (err) {
        if (uploaded.length) await removePhotoFiles(uploaded);
        throw err;
    }
    return photoFromRow({ id, path, thumb_path: thumbPath });
};

storage.deletePhoto = async function (photo) {
    // Row first: if that fails nothing has changed. Leftover files would be harmless;
    // a row pointing at missing files would not be.
    const { error } = await sb.from(PHOTO_TABLE).delete().eq('id', photo.id);
    if (error) throw error;
    await removePhotoFiles([photo.path, photo.thumbPath]);
};

// ---------- Shrinking a picture in the browser ----------
async function decodeImage(file) {
    if (window.createImageBitmap) {
        try {
            // 'from-image' applies the phone's rotation flag, so portrait photos stay upright
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (err) { /* fall through to the <img> route */ }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();   // browsers apply EXIF rotation to <img> by default
        return img;
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
}

function drawToJpeg(source, maxPx, quality) {
    const w0 = source.naturalWidth || source.width;
    const h0 = source.naturalHeight || source.height;
    const scale = Math.min(1, maxPx / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * scale));
    const height = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';   // JPEG has no transparency
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve({ blob, width, height }) : reject(new Error('Could not encode image')),
            'image/jpeg', quality);
    });
}

async function processImage(file) {
    const source = await decodeImage(file);
    try {
        const full = await drawToJpeg(source, FULL_MAX_PX, FULL_QUALITY);
        const thumb = await drawToJpeg(source, THUMB_MAX_PX, THUMB_QUALITY);
        if (full.blob.size > MAX_UPLOAD_BYTES) throw new Error('Photo is too large');
        return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
    } finally {
        if (source.close) source.close();
    }
}

// ---------- Panel ----------
const photoEls = {
    section: $('photoSection'),
    label: $('photoLabel'),
    strip: $('photoStrip'),
    buttons: $('photoButtons'),
    cameraBtn: $('photoCameraBtn'),
    galleryBtn: $('photoGalleryBtn'),
    cameraInput: $('photoCameraInput'),
    galleryInput: $('photoGalleryInput')
};

const photoUi = { treeId: null, readOnly: false };
const photosLoaded = new Set();   // trees whose saved photos have been fetched

function photosOf(treeId) {
    return state.photos.get(treeId) || [];
}

function isPhotoPanelFor(treeId) {
    return state.selected && state.selected.id === treeId && photoUi.treeId === treeId;
}

function renderPhotos() {
    const list = photosOf(photoUi.treeId);
    const done = list.filter(p => !p.pending && !p.failed);

    // View mode: nothing to show if there are no photos
    photoEls.section.hidden = !photoUi.treeId || (photoUi.readOnly && !list.length);
    photoEls.buttons.hidden = photoUi.readOnly;
    photoEls.label.textContent = list.length ? `Photos (${list.length})` : 'Photos';

    photoEls.strip.replaceChildren();
    for (const photo of list) {
        const tile = document.createElement('div');
        tile.className = 'photo-tile' + (photo.pending ? ' pending' : '') + (photo.failed ? ' failed' : '');

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'photo-open';
        open.setAttribute('aria-label', 'View photo');
        const img = document.createElement('img');
        img.alt = 'Tree photo';
        img.loading = 'lazy';
        img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER_IMG; };
        img.src = photo.localUrl || photo.thumbUrl;
        open.appendChild(img);
        if (!photo.pending && !photo.failed) open.addEventListener('click', () => openLightbox(done.indexOf(photo)));
        tile.appendChild(open);

        if ((!photoUi.readOnly && !photo.pending) || photo.failed) {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'photo-del';
            del.textContent = '✕';
            del.setAttribute('aria-label', photo.failed ? 'Dismiss' : 'Delete photo');
            del.addEventListener('click', () => photo.failed ? dismissFailed(photo) : removePhoto(photo));
            tile.appendChild(del);
        }
        photoEls.strip.appendChild(tile);
    }

    // The panel changed height: keep the tree in view above it
    if (state.selected && typeof revealMarker === 'function') {
        const marker = state.markers.get(state.selected.id);
        if (marker) revealMarker(marker);
    }
}

async function photoPanelOpen(treeId, readOnly) {
    photoUi.treeId = treeId;
    photoUi.readOnly = readOnly;
    renderPhotos();

    if (photosLoaded.has(treeId)) return;

    // Not loaded yet: fetch the list (a tree added a moment ago has none, and
    // its row may not exist yet, so only ask once it has been saved)
    try {
        if (state.saving.has(treeId)) await state.saving.get(treeId);
        if (!state.trees.has(treeId)) return;
        const loaded = await storage.listPhotos(treeId);
        // keep any uploads that began while the list was loading
        const inFlight = photosOf(treeId).filter(p => p.pending || p.failed);
        state.photos.set(treeId, [...loaded, ...inFlight]);
        photosLoaded.add(treeId);
    } catch (err) {
        console.error('Could not load photos:', err);
        if (isPhotoPanelFor(treeId)) showToast("Couldn't load photos");
        return;
    }
    if (isPhotoPanelFor(treeId)) renderPhotos();
}

function photoPanelClose() {
    photoUi.treeId = null;
    photoUi.readOnly = false;
    photoEls.section.hidden = true;
    photoEls.strip.replaceChildren();
    closeLightbox();
}

// ---------- Adding ----------
let uploadQueue = Promise.resolve();   // photos go up one at a time, which is kind to a phone connection

function queuePhotos(files) {
    const treeId = photoUi.treeId;
    if (!treeId || photoUi.readOnly) return;

    const picked = [...files].filter(f => f.type ? f.type.startsWith('image/') : true);
    if (!picked.length) {
        showToast('Please choose a picture');
        return;
    }

    const room = MAX_PHOTOS_PER_TREE - photosOf(treeId).length;
    if (room <= 0) {
        showToast(`A tree can have up to ${MAX_PHOTOS_PER_TREE} photos`);
        return;
    }
    if (picked.length > room) {
        showToast(`Only ${room} more photo${room === 1 ? '' : 's'} fit${room === 1 ? 's' : ''} on this tree`);
        picked.length = room;
    }

    for (const file of picked) {
        const entry = { id: 'pending-' + generateId(), pending: true, localUrl: URL.createObjectURL(file) };
        state.photos.set(treeId, [...photosOf(treeId), entry]);
        uploadQueue = uploadQueue.then(() => uploadOne(treeId, file, entry));
    }
    renderPhotos();
}

async function uploadOne(treeId, file, entry) {
    const replaceEntry = replacement => {
        const list = photosOf(treeId).slice();
        const i = list.indexOf(entry);
        if (i === -1) return false;   // the tree was deleted meanwhile
        if (replacement) list[i] = replacement; else list.splice(i, 1);
        state.photos.set(treeId, list);
        return true;
    };

    try {
        const processed = await processImage(file);
        if (state.saving.has(treeId)) await state.saving.get(treeId);   // the tree row must exist first
        if (!state.trees.has(treeId)) throw new Error('Tree no longer exists');

        const photo = await storage.addPhoto(treeId, processed);
        if (!state.trees.has(treeId)) {
            // deleted while uploading: tidy up the files we just made
            await removePhotoFiles([photo.path, photo.thumbPath]);
            return;
        }
        replaceEntry(photo);
        URL.revokeObjectURL(entry.localUrl);
    } catch (err) {
        console.error('Could not add photo:', err);
        if (state.trees.has(treeId)) {
            entry.pending = false;
            entry.failed = true;
            showToast("Couldn't add a photo. Tap ✕ on it to dismiss, then try again.");
        }
    }
    if (isPhotoPanelFor(treeId)) renderPhotos();
}

function dismissFailed(photo) {
    if (photo.localUrl) URL.revokeObjectURL(photo.localUrl);
    state.photos.set(photoUi.treeId, photosOf(photoUi.treeId).filter(p => p !== photo));
    renderPhotos();
}

async function removePhoto(photo) {
    const treeId = photoUi.treeId;
    if (!treeId || photoUi.readOnly) return;
    if (!confirm('Delete this photo?')) return;

    try {
        await storage.deletePhoto(photo);
    } catch (err) {
        console.error('Could not delete photo:', err);
        showToast("Couldn't delete the photo. Check your connection.");
        return;
    }
    state.photos.set(treeId, photosOf(treeId).filter(p => p !== photo));
    if (isPhotoPanelFor(treeId)) renderPhotos();
    showToast('Photo deleted');
}

photoEls.cameraBtn.addEventListener('click', () => photoEls.cameraInput.click());
photoEls.galleryBtn.addEventListener('click', () => photoEls.galleryInput.click());
for (const input of [photoEls.cameraInput, photoEls.galleryInput]) {
    input.addEventListener('change', () => {
        const files = [...input.files];
        input.value = '';   // so choosing the same file again still fires
        if (files.length) queuePhotos(files);
    });
}

// ---------- Full-size viewer ----------
const lb = {
    root: $('lightbox'),
    img: $('lbImg'),
    prev: $('lbPrev'),
    next: $('lbNext'),
    close: $('lbClose'),
    count: $('lbCount'),
    list: [],
    index: 0
};

function showLightbox() {
    const photo = lb.list[lb.index];
    if (!photo) return closeLightbox();
    lb.img.onerror = () => { lb.img.onerror = null; lb.img.src = photo.thumbUrl; };   // at least show the small one
    lb.img.src = photo.url;
    lb.count.textContent = `${lb.index + 1} / ${lb.list.length}`;
    lb.prev.hidden = lb.next.hidden = lb.list.length < 2;
}

function openLightbox(index) {
    lb.list = photosOf(photoUi.treeId).filter(p => !p.pending && !p.failed);
    if (!lb.list.length) return;
    lb.index = Math.min(Math.max(index, 0), lb.list.length - 1);
    lb.root.hidden = false;
    showLightbox();
}

function closeLightbox() {
    if (lb.root.hidden) return;
    lb.root.hidden = true;
    lb.img.removeAttribute('src');
}

function stepLightbox(delta) {
    if (lb.list.length < 2) return;
    lb.index = (lb.index + delta + lb.list.length) % lb.list.length;
    showLightbox();
}

lb.close.addEventListener('click', closeLightbox);
lb.prev.addEventListener('click', () => stepLightbox(-1));
lb.next.addEventListener('click', () => stepLightbox(1));
lb.root.addEventListener('click', e => { if (e.target === lb.root) closeLightbox(); });

document.addEventListener('keydown', e => {
    if (lb.root.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') stepLightbox(-1);
    else if (e.key === 'ArrowRight') stepLightbox(1);
});

// Swipe left / right to move between photos
let swipeStartX = null;
lb.root.addEventListener('touchstart', e => { swipeStartX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
lb.root.addEventListener('touchend', e => {
    if (swipeStartX === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(dx) > SWIPE_PX) stepLightbox(dx < 0 ? 1 : -1);
}, { passive: true });
