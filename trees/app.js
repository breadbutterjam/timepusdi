'use strict';

/* =========================================================================
   Tree Marker
   Full-screen map: tap an empty spot to add a tree, tap a tree to edit it.
   The list of tree types lives in tree-types.js.
   ========================================================================= */

// ---------- Config ----------
const DEFAULT_CENTER = [19.0755, 72.8316];
const DEFAULT_ZOOM = 19;
const MAX_NATIVE_ZOOM = 19;   // OpenStreetMap tiles stop here
const MAX_ZOOM = 21;          // allow zooming further in, to place trees that are close together
const LABEL_MIN_ZOOM = 17;    // labels are hidden when zoomed out beyond this
const ADD_DEBOUNCE_MS = 350;  // ignore a second tap this soon after an add (double-tap reflex)
const STORAGE_KEY = 'savedTrees';
const CURRENT_TYPE_KEY = 'currentTreeType';

// Shown when a tree photo is missing. Built in as an inline SVG, so it can
// never fail to load.
const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">' +
    '<rect width="200" height="150" fill="#e8f3ea"/>' +
    '<text x="100" y="95" font-size="64" text-anchor="middle">🌳</text>' +
    '</svg>'
);

// ---------- Tree types (defined in tree-types.js) ----------
const typesById = new Map(treeTypes.map(t => [t.id, t]));

// ---------- Storage layer (Supabase) ----------
// Everything else talks to storage only through these three functions. The
// app uses camelCase fields; the database uses snake_case, converted here.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TABLE = 'trees';
const PAGE_SIZE = 1000;   // Supabase returns at most 1000 rows per request

function toRow(tree) {
    return {
        id: tree.id,
        latitude: tree.latitude,
        longitude: tree.longitude,
        tree_type_id: tree.treeTypeId || 'unknown',
        custom_name: tree.customName || '',
        description: tree.description || '',
        status: ['active', 'pruned', 'cut', 'fell'].includes(tree.status) ? tree.status : 'active',
        created_at: tree.timestamp,
        updated_at: tree.updatedAt
    };
}

function fromRow(row) {
    return {
        id: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
        treeTypeId: row.tree_type_id,
        customName: row.custom_name || '',
        description: row.description || '',
        status: row.status,
        timestamp: row.created_at,
        updatedAt: row.updated_at
    };
}

const storage = {
    async listTrees() {
        const all = [];
        for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await sb.from(TABLE)
                .select('*')
                .order('created_at', { ascending: true })
                .range(from, from + PAGE_SIZE - 1);
            if (error) throw error;
            all.push(...data);
            if (data.length < PAGE_SIZE) break;
        }
        return all.map(fromRow);
    },
    async saveTree(tree) {
        const { error } = await sb.from(TABLE).upsert(toRow(tree));
        if (error) throw error;
    },
    async deleteTree(id) {
        const { error } = await sb.from(TABLE).delete().eq('id', id);
        if (error) throw error;
    }
};

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const els = {
    map: $('map'),
    chip: $('typeChip'),
    chipLabel: $('typeChipLabel'),
    picker: $('typePicker'),
    search: $('typeSearch'),
    list: $('typeList'),
    locate: $('locateBtn'),
    panel: $('treePanel'),
    type: $('panelType'),
    name: $('panelName'),
    desc: $('panelDesc'),
    lat: $('panelLat'),
    lng: $('panelLng'),
    del: $('panelDelete'),
    cancel: $('panelCancel'),
    save: $('panelSave'),
    toast: $('toast')
};

// ---------- State ----------
const state = {
    trees: new Map(),     // id -> tree
    markers: new Map(),   // id -> L.Marker
    currentTypeId: null,  // type used for newly added trees
    selected: null,       // { id, original } while the panel is open
    lastAddAt: 0
};

// ---------- Map ----------
const map = L.map('map', {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    doubleClickZoom: false   // a double-tap would otherwise add two trees as well as zoom
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: MAX_ZOOM,
    maxNativeZoom: MAX_NATIVE_ZOOM
}).addTo(map);

L.control.zoom({ position: 'bottomleft' }).addTo(map);

// ---------- Helpers ----------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The browser creates each tree's id (a UUID), so a tree can appear on the map
// instantly, before the database has answered.
function generateId() {
    if (crypto.randomUUID) return crypto.randomUUID();   // needs https or localhost
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function round6(n) {
    return Math.round(n * 1e6) / 1e6;
}

function isValidCoord(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function labelFor(tree) {
    return (tree.customName || '').trim() ||
        (typesById.get(tree.treeTypeId)?.commonName) ||
        'Unknown tree';
}

let toastTimer = null;
function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function makeTreeImg(type) {
    const img = document.createElement('img');
    img.alt = type.commonName;
    img.loading = 'lazy';
    // One-shot fallback: disarm the handler first so a failing placeholder
    // can never trigger it again.
    img.onerror = () => {
        img.onerror = null;
        img.src = PLACEHOLDER_IMG;
    };
    img.src = type.image ? `img/${type.image}` : PLACEHOLDER_IMG;
    return img;
}

// ---------- Markers ----------
function buildPin(label) {
    const pin = document.createElement('div');
    pin.className = 'tree-pin';

    const emoji = document.createElement('span');
    emoji.className = 'tree-emoji';
    emoji.textContent = '🌳';

    const text = document.createElement('span');
    text.className = 'tree-label';
    text.textContent = label;

    pin.append(emoji, text);
    return pin;
}

function pinIcon(label) {
    return L.divIcon({
        html: buildPin(label),
        className: 'tree-pin-wrap',
        iconSize: [44, 44],      // generous tap target
        iconAnchor: [22, 38]     // base of the tree sits on the coordinate
    });
}

function updateMarkerLabel(marker, text) {
    const el = marker && marker.getElement();
    const label = el && el.querySelector('.tree-label');
    if (label) label.textContent = text;
}

function setPinSelected(marker, selected) {
    const el = marker && marker.getElement();
    const pin = el && el.querySelector('.tree-pin');
    if (pin) pin.classList.toggle('selected', selected);
}

function addMarkerFor(tree) {
    const marker = L.marker([tree.latitude, tree.longitude], {
        icon: pinIcon(labelFor(tree)),
        draggable: false
    }).addTo(map);

    marker.on('click', () => selectTree(tree.id));

    // Keep the coordinate fields in step while dragging
    marker.on('drag', e => {
        if (state.selected && state.selected.id === tree.id) {
            const p = e.target.getLatLng();
            els.lat.value = p.lat.toFixed(6);
            els.lng.value = p.lng.toFixed(6);
        }
    });

    marker.on('dragend', () => {
        if (state.selected && state.selected.id === tree.id) revealMarker(marker);
    });

    state.markers.set(tree.id, marker);
    return marker;
}

// Put the marker back to what is stored (used after Cancel and Save)
function syncMarker(id) {
    const tree = state.trees.get(id);
    const marker = state.markers.get(id);
    if (!tree || !marker) return;
    marker.setLatLng([tree.latitude, tree.longitude]);
    updateMarkerLabel(marker, labelFor(tree));
}

// Pan the map just enough that the marker is visible above the floating panel
function revealMarker(marker) {
    requestAnimationFrame(() => {
        const size = map.getSize();
        const point = map.latLngToContainerPoint(marker.getLatLng());
        const panelHeight = els.panel.hidden ? 0 : els.panel.offsetHeight;
        const sidePad = 40;
        const topPad = 70;
        const bottomPad = panelHeight + 70;   // room for the label as well

        let dx = 0;
        let dy = 0;
        if (point.x < sidePad) dx = point.x - sidePad;
        else if (point.x > size.x - sidePad) dx = point.x - (size.x - sidePad);
        if (point.y < topPad) dy = point.y - topPad;
        else if (point.y > size.y - bottomPad) dy = point.y - (size.y - bottomPad);

        if (dx || dy) map.panBy([dx, dy], { animate: true });
    });
}

// Labels are hidden when zoomed out so they don't pile up
function updateLabelVisibility() {
    els.map.classList.toggle('labels-hidden', map.getZoom() < LABEL_MIN_ZOOM);
}
map.on('zoomend', updateLabelVisibility);

// ---------- Moving the selected tree ----------
function moveSelectedTo(latlng) {
    const marker = state.markers.get(state.selected.id);
    if (!marker) return;
    marker.setLatLng(latlng);
    els.lat.value = latlng.lat.toFixed(6);
    els.lng.value = latlng.lng.toFixed(6);
}

// ---------- Adding trees ----------
async function addTreeAt(latlng) {
    const now = new Date().toISOString();
    const tree = {
        id: generateId(),
        latitude: latlng.lat,
        longitude: latlng.lng,
        treeTypeId: state.currentTypeId,
        customName: '',
        description: '',
        timestamp: now,
        updatedAt: now,
        status: 'active'
    };

    // Show the tree immediately; save in the background and undo if it fails
    state.trees.set(tree.id, tree);
    addMarkerFor(tree);   // quiet add: marker + label appear, nothing else opens

    try {
        await storage.saveTree(tree);
    } catch (err) {
        console.error('Could not save tree:', err);
        if (state.selected && state.selected.id === tree.id) closePanel();
        const marker = state.markers.get(tree.id);
        if (marker) map.removeLayer(marker);
        state.markers.delete(tree.id);
        state.trees.delete(tree.id);
        showToast("Couldn't save the tree. Check your connection.");
    }
}

map.on('click', e => {
    // A tap outside the picker just closes it
    if (isPickerOpen()) {
        closePicker();
        return;
    }

    // A tree is open in the panel: a tap moves it there (Save keeps it, Cancel undoes it)
    if (state.selected) {
        moveSelectedTo(e.latlng);
        return;
    }

    const now = Date.now();
    if (now - state.lastAddAt < ADD_DEBOUNCE_MS) return;
    state.lastAddAt = now;

    addTreeAt(e.latlng);
});

// ---------- Current type chip + picker ----------
function isPickerOpen() {
    return !els.picker.hidden;
}

function updateChip() {
    const type = typesById.get(state.currentTypeId);
    els.chipLabel.textContent = type ? type.commonName : 'Choose type';
}

function setCurrentType(id) {
    state.currentTypeId = id;
    try { localStorage.setItem(CURRENT_TYPE_KEY, id); } catch (err) { /* not critical */ }
    updateChip();
}

function loadCurrentType() {
    let id = null;
    try { id = localStorage.getItem(CURRENT_TYPE_KEY); } catch (err) { /* ignore */ }
    if (typesById.has(id)) return id;
    return treeTypes.length ? treeTypes[0].id : null;
}

function renderTypeList() {
    const q = els.search.value.trim().toLowerCase();
    const matches = treeTypes.filter(t =>
        !q || t.commonName.toLowerCase().includes(q) || t.scientificName.toLowerCase().includes(q));

    els.list.replaceChildren();

    if (!matches.length) {
        const empty = document.createElement('li');
        empty.className = 'type-empty';
        empty.textContent = 'No matching trees';
        els.list.appendChild(empty);
        return;
    }

    for (const type of matches) {
        const li = document.createElement('li');
        li.className = 'type-item' + (type.id === state.currentTypeId ? ' current' : '');
        li.setAttribute('role', 'option');
        li.dataset.typeId = type.id;

        const text = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'type-item-name';
        name.textContent = type.commonName;
        const sci = document.createElement('div');
        sci.className = 'type-item-sci';
        sci.textContent = type.scientificName;
        text.append(name, sci);

        li.append(makeTreeImg(type), text);
        li.addEventListener('click', () => {
            setCurrentType(type.id);
            closePicker();
        });
        els.list.appendChild(li);
    }
}

function openPicker() {
    els.search.value = '';
    renderTypeList();
    els.picker.hidden = false;
    els.chip.setAttribute('aria-expanded', 'true');
    const current = els.list.querySelector('.current');
    if (current) current.scrollIntoView({ block: 'nearest' });
}

function closePicker() {
    els.picker.hidden = true;
    els.chip.setAttribute('aria-expanded', 'false');
}

els.chip.addEventListener('click', () => {
    if (isPickerOpen()) closePicker(); else openPicker();
});
els.search.addEventListener('input', renderTypeList);

// Tapping anywhere else (not the map, which handles itself) closes the picker
document.addEventListener('click', e => {
    if (isPickerOpen() && !els.picker.contains(e.target) && !els.chip.contains(e.target)) {
        closePicker();
    }
});

// ---------- Tree panel ----------
function buildPanelTypeOptions() {
    els.type.replaceChildren();
    for (const t of treeTypes) {
        els.type.add(new Option(`${t.commonName} (${t.scientificName})`, t.id));
    }
}

function typeName(typeId) {
    return typesById.get(typeId)?.commonName || '';
}

function fillPanel(tree) {
    // Trees saved with a type that is no longer in the list still need to display
    els.type.querySelectorAll('option[data-unknown]').forEach(o => o.remove());
    if (!typesById.has(tree.treeTypeId)) {
        const opt = new Option(`Unknown (${tree.treeTypeId})`, tree.treeTypeId);
        opt.dataset.unknown = '1';
        els.type.add(opt, 0);
    }
    els.type.value = tree.treeTypeId;
    // The name field starts out as the type name unless the tree has its own name
    els.name.value = tree.customName || typeName(tree.treeTypeId);
    els.desc.value = tree.description || '';
    els.lat.value = tree.latitude.toFixed(6);
    els.lng.value = tree.longitude.toFixed(6);
}

function readDraft() {
    const typeId = els.type.value;
    const name = els.name.value.trim();
    return {
        treeTypeId: typeId,
        // A name that just repeats the type is stored as "no custom name", so
        // the tree keeps following its type if the type is changed later
        customName: name === typeName(typeId) ? '' : name,
        description: els.desc.value.trim(),
        latitude: parseFloat(els.lat.value),
        longitude: parseFloat(els.lng.value)
    };
}

function isDirty() {
    if (!state.selected) return false;
    const o = state.selected.original;
    const d = readDraft();
    return d.treeTypeId !== o.treeTypeId ||
        d.customName !== (o.customName || '').trim() ||
        d.description !== (o.description || '').trim() ||
        round6(d.latitude) !== round6(o.latitude) ||
        round6(d.longitude) !== round6(o.longitude);
}

function selectTree(id) {
    if (state.selected) {
        if (state.selected.id === id) return;
        if (isDirty()) {
            showToast('Save or cancel your changes first');
            return;
        }
        closePanel();
    }

    const tree = state.trees.get(id);
    const marker = state.markers.get(id);
    if (!tree || !marker) return;

    closePicker();
    state.selected = { id, original: { ...tree }, typeId: tree.treeTypeId };
    fillPanel(tree);

    setPinSelected(marker, true);
    marker.dragging.enable();

    document.body.classList.add('panel-open');
    els.panel.hidden = false;
    revealMarker(marker);
}

function closePanel() {
    const sel = state.selected;
    if (!sel) return;

    const marker = state.markers.get(sel.id);
    state.selected = null;
    els.panel.hidden = true;
    document.body.classList.remove('panel-open');

    if (marker) {
        marker.dragging.disable();
        setPinSelected(marker, false);
        syncMarker(sel.id);
        map.panInside(marker.getLatLng(), { padding: [60, 60] });
    }
}

// Live label preview while typing / changing type (reverted by Cancel)
function onDraftChanged() {
    if (!state.selected) return;
    const d = readDraft();
    const text = d.customName || typesById.get(d.treeTypeId)?.commonName || 'Unknown tree';
    updateMarkerLabel(state.markers.get(state.selected.id), text);
}
els.type.addEventListener('change', () => {
    // If the name is still just the old type name (or empty), follow the new type
    const current = els.name.value.trim();
    if (state.selected && (current === '' || current === typeName(state.selected.typeId))) {
        els.name.value = typeName(els.type.value);
    }
    if (state.selected) state.selected.typeId = els.type.value;
    onDraftChanged();
});
els.name.addEventListener('input', onDraftChanged);

// Typing coordinates moves the marker (applied when the field loses focus / Enter)
function onCoordsChanged() {
    if (!state.selected) return;
    const marker = state.markers.get(state.selected.id);
    const lat = parseFloat(els.lat.value);
    const lng = parseFloat(els.lng.value);

    if (!isValidCoord(lat, lng)) {
        showToast('Invalid coordinates');
        const p = marker.getLatLng();
        els.lat.value = p.lat.toFixed(6);
        els.lng.value = p.lng.toFixed(6);
        return;
    }
    marker.setLatLng([lat, lng]);
    revealMarker(marker);
}
els.lat.addEventListener('change', onCoordsChanged);
els.lng.addEventListener('change', onCoordsChanged);

els.cancel.addEventListener('click', closePanel);

els.save.addEventListener('click', async () => {
    const sel = state.selected;
    if (!sel) return;

    const d = readDraft();
    if (!isValidCoord(d.latitude, d.longitude)) {
        showToast('Invalid coordinates');
        return;
    }

    const o = state.trees.get(sel.id);
    const updated = {
        ...o,
        treeTypeId: d.treeTypeId,
        customName: d.customName,
        description: d.description,
        // keep full precision if the coordinates weren't changed
        latitude: round6(d.latitude) === round6(o.latitude) ? o.latitude : d.latitude,
        longitude: round6(d.longitude) === round6(o.longitude) ? o.longitude : d.longitude,
        updatedAt: new Date().toISOString()
    };

    els.save.disabled = true;   // guard against a double-tap while the request is in flight
    try {
        await storage.saveTree(updated);
    } catch (err) {
        console.error('Could not save tree:', err);
        showToast("Couldn't save changes. Check your connection.");
        return;
    } finally {
        els.save.disabled = false;
    }

    state.trees.set(sel.id, updated);
    closePanel();
});

els.del.addEventListener('click', async () => {
    const sel = state.selected;
    if (!sel) return;

    const tree = state.trees.get(sel.id);
    if (!confirm(`Delete ${labelFor(tree)}?`)) return;

    els.del.disabled = true;
    try {
        await storage.deleteTree(sel.id);
    } catch (err) {
        console.error('Could not delete tree:', err);
        showToast("Couldn't delete the tree. Check your connection.");
        return;
    } finally {
        els.del.disabled = false;
    }

    const marker = state.markers.get(sel.id);
    if (marker) map.removeLayer(marker);
    state.markers.delete(sel.id);
    state.trees.delete(sel.id);
    closePanel();
    showToast('Tree deleted');
});

// Keep the selected tree visible when the keyboard opens or the screen rotates
window.addEventListener('resize', () => {
    if (state.selected) revealMarker(state.markers.get(state.selected.id));
});

// ---------- Locate me ----------
let userDot = null;
let userAccuracy = null;

function showUserLocation(lat, lng, accuracy) {
    const ll = [lat, lng];
    if (!userDot) {
        // interactive:false lets taps on the dot fall through to the map
        userAccuracy = L.circle(ll, {
            radius: accuracy, weight: 1, color: '#1a73e8', fillOpacity: 0.12, interactive: false
        }).addTo(map);
        userDot = L.circleMarker(ll, {
            radius: 7, weight: 2, color: '#fff', fillColor: '#1a73e8', fillOpacity: 1, interactive: false
        }).addTo(map);
    } else {
        userAccuracy.setLatLng(ll).setRadius(accuracy);
        userDot.setLatLng(ll);
    }
}

els.locate.addEventListener('click', () => {
    if (!navigator.geolocation) {
        showToast('Location is not supported on this device');
        return;
    }
    els.locate.classList.add('busy');
    navigator.geolocation.getCurrentPosition(
        pos => {
            const { latitude, longitude, accuracy } = pos.coords;
            showUserLocation(latitude, longitude, accuracy);
            map.setView([latitude, longitude], Math.max(map.getZoom(), 18));
            els.locate.classList.remove('busy');
        },
        err => {
            showToast('Could not get location: ' + err.message);
            els.locate.classList.remove('busy');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
});

// ---------- Trees saved on this device from before Supabase ----------
const validDate = v => (v && !Number.isNaN(Date.parse(v))) ? v : null;

// One-time offer to upload trees that only exist in this browser's localStorage.
// Ids are converted to UUIDs and saved locally *before* uploading, so a retry
// after a failure reuses the same ids and can't create duplicates.
async function offerLocalUpload() {
    let raw = null;
    let local = [];
    try {
        raw = localStorage.getItem(STORAGE_KEY);
        local = raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.error('Could not read local trees:', err);
        return;
    }
    if (!Array.isArray(local)) return;
    local = local.filter(t => t && Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
    if (!local.length) return;

    const n = local.length;
    if (!confirm(`${n} tree${n === 1 ? ' is' : 's are'} saved only on this device. Upload ${n === 1 ? 'it' : 'them'} to your account?`)) return;

    const now = new Date().toISOString();
    const prepared = local.map(t => ({
        ...t,
        id: UUID_RE.test(t.id) ? t.id : generateId(),
        timestamp: validDate(t.timestamp) || now,
        updatedAt: validDate(t.updatedAt) || validDate(t.timestamp) || now
    }));

    try {
        if (!localStorage.getItem(STORAGE_KEY + '_original')) localStorage.setItem(STORAGE_KEY + '_original', raw);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prepared));
    } catch (err) {
        console.error('Could not prepare local trees:', err);
        showToast("Couldn't prepare the upload");
        return;
    }

    try {
        for (let i = 0; i < prepared.length; i += 200) {
            const { error } = await sb.from(TABLE).upsert(prepared.slice(i, i + 200).map(toRow));
            if (error) throw error;
        }
    } catch (err) {
        console.error('Upload failed:', err);
        showToast("Couldn't upload your device's trees. They are still saved here.");
        return;
    }

    try {
        localStorage.setItem(STORAGE_KEY + '_uploaded', JSON.stringify(prepared));   // kept as a backup
        localStorage.removeItem(STORAGE_KEY);
    } catch (err) { /* not critical */ }
    showToast(`Uploaded ${n} tree${n === 1 ? '' : 's'}`);
}

// ---------- Sign in ----------
const loginEls = {
    overlay: $('loginOverlay'),
    form: $('loginForm'),
    email: $('loginEmail'),
    password: $('loginPassword'),
    error: $('loginError'),
    btn: $('loginBtn')
};

function showLogin() {
    loginEls.overlay.hidden = false;
    loginEls.email.focus();
}

loginEls.form.addEventListener('submit', async e => {
    e.preventDefault();
    loginEls.error.textContent = '';
    loginEls.btn.disabled = true;

    let error = null;
    try {
        ({ error } = await sb.auth.signInWithPassword({
            email: loginEls.email.value.trim(),
            password: loginEls.password.value
        }));
    } catch (err) {
        error = err;
    }
    loginEls.btn.disabled = false;

    if (error) {
        console.error('Sign in failed:', error);
        loginEls.error.textContent = /invalid login/i.test(error.message || '')
            ? 'Wrong email or password.'
            : "Couldn't sign in. Check your connection and try again.";
        return;
    }

    loginEls.password.value = '';
    loginEls.overlay.hidden = true;
    await loadTrees();
});

// If the session ends (signed out, or it can no longer be refreshed), start over at the sign-in screen
sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') location.reload();
});

// ---------- Start up ----------
async function loadTrees() {
    await offerLocalUpload();

    try {
        const trees = await storage.listTrees();
        for (const marker of state.markers.values()) map.removeLayer(marker);
        state.markers.clear();
        state.trees.clear();
        for (const tree of trees) {
            state.trees.set(tree.id, tree);
            addMarkerFor(tree);
        }
    } catch (err) {
        console.error('Could not load trees:', err);
        showToast("Couldn't load your trees. Check your connection and reload.");
    }
}

async function init() {
    buildPanelTypeOptions();
    state.currentTypeId = loadCurrentType();
    updateChip();
    updateLabelVisibility();

    let session = null;
    try {
        ({ data: { session } } = await sb.auth.getSession());
    } catch (err) {
        console.error('Could not read session:', err);
    }

    if (!session) {
        showLogin();
        return;
    }
    await loadTrees();
}

init();
