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
const SETTINGS_KEY = 'treeSettings';
const GUEST_KEY = 'guestMode';   // remembered on this device so a returning guest lands on the map
const RECENT_MS = 5000;       // a tree you just added or saved stays fully visible this long, even if a filter would fade it
const FADE_MS = 600;          // matches the opacity transition in style.css

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
const PHOTO_TABLE = 'tree_photos';
const PHOTO_BUCKET = 'tree-photos';

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
        // Remove the photo files first (best effort): once the tree row is gone,
        // the photo rows go with it and we would lose track of the file names.
        try {
            const { data } = await sb.from(PHOTO_TABLE).select('path, thumb_path').eq('tree_id', id);
            const paths = (data || []).flatMap(p => [p.path, p.thumb_path]).filter(Boolean);
            if (paths.length) await sb.storage.from(PHOTO_BUCKET).remove(paths);
        } catch (err) {
            console.error('Could not remove photo files:', err);
        }
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
    toast: $('toast'),
    settingsBtn: $('settingsBtn'),
    settingsPane: $('settingsPane'),
    settingsClose: $('settingsClose'),
    filterBtn: $('filterBtn'),
    filterDot: $('filterDot'),
    filterPane: $('filterPane'),
    filterClose: $('filterClose'),
    modeBtn: $('modeBtn'),
    modePill: $('modePill'),
    filterSearch: $('filterSearch'),
    filterTypes: $('filterTypes'),
    filterSummary: $('filterSummary'),
    filterShow: $('filterShow'),
    filterClear: $('filterClear'),
    optFaded: $('optFaded'),
    optLabelsSelected: $('optLabelsSelected'),
    optDots: $('optDots'),
    baseMapList: $('baseMapList'),
    baseMapHelp: $('baseMapHelp'),
    exportSheet: $('exportSheetBtn'),
    exportMap: $('exportMapBtn'),
    signOut: $('signOutBtn')
};

// ---------- State ----------
const state = {
    mode: 'edit',         // 'edit' (default) or 'view'; always starts in edit
    trees: new Map(),     // id -> tree
    markers: new Map(),   // id -> L.Marker
    recent: new Map(),    // id -> timer, for trees exempt from the filter for a few seconds
    currentTypeId: null,  // type used for newly added trees
    selected: null,       // { id, original } while the panel is open
    guest: false,         // signed out, view only
    lastAddAt: 0,
    photos: new Map(),    // treeId -> list of photos already loaded (see photos.js)
    saving: new Map()     // treeId -> promise of a tree's first save still in flight
};

// What the filter currently lets through (not remembered between visits)
const filter = { types: new Set(), query: '' };

// Display settings (remembered on this device)
const settings = { showFaded: true, labelsSelectedOnly: false, dotPins: false, baseMap: 'osm' };
try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (typeof saved.showFaded === 'boolean') settings.showFaded = saved.showFaded;
    if (typeof saved.labelsSelectedOnly === 'boolean') settings.labelsSelectedOnly = saved.labelsSelectedOnly;
    if (typeof saved.dotPins === 'boolean') settings.dotPins = saved.dotPins;
    if (typeof saved.baseMap === 'string') settings.baseMap = saved.baseMap;
} catch (err) { /* use defaults */ }

function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (err) { /* not critical */ }
}

// ---------- Map ----------
const map = L.map('map', {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    doubleClickZoom: false   // a double-tap would otherwise add two trees as well as zoom
});

// ---------- Base maps ----------
// Each entry is a set of tiles Leaflet can draw. To offer another style, add an entry.
const IS_LOCAL_HOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const CARTO_KEY = IS_LOCAL_HOST ? CARTO_KEY_LOCAL : CARTO_KEY_SITE;
const ARCGIS_KEY = ARCGIS_API_KEY;
const CARTO_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
    '© <a href="https://carto.com/attribution/">CARTO</a>';

const cartoUrl = style => `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`;

// Esri's static basemap tiles are 512 px, so Leaflet needs tileSize 512 and a zoom offset of -1
const ESRI_BASE = 'https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/';
const esriUrl = style => `${ESRI_BASE}${style}/static/tile/{z}/{y}/{x}?token=${encodeURIComponent(ARCGIS_KEY)}`;
const ESRI_ATTRIBUTION = 'Powered by <a href="https://www.esri.com">Esri</a>';
// The aerial pictures come from Esri's World Imagery service (ordinary 256 px tiles);
// the street-name overlay comes from the static basemap tiles service above.
const IMAGERY_SERVICE = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer';
const imageryUrl = () => `${IMAGERY_SERVICE}/tile/{z}/{y}/{x}?token=${encodeURIComponent(ARCGIS_KEY)}`;
const imageryOptions = { maxNativeZoom: 19 };
const labelsOptions = { tileSize: 512, zoomOffset: -1, maxNativeZoom: 19 };

const BASE_MAPS = [
    {
        id: 'osm', label: 'Standard',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors', options: { maxNativeZoom: 19 }
    },
    {
        id: 'light', label: 'Light', available: () => !!CARTO_KEY,
        url: () => cartoUrl('light_all'), attribution: CARTO_ATTRIBUTION, options: { maxNativeZoom: 18 }
    },
    {
        id: 'light-nolabels', label: 'Light, no labels', available: () => !!CARTO_KEY,
        url: () => cartoUrl('light_nolabels'), attribution: CARTO_ATTRIBUTION, options: { maxNativeZoom: 18 }
    },
    {
        id: 'satellite', label: 'Satellite', available: () => !!ARCGIS_KEY,
        url: imageryUrl, attribution: ESRI_ATTRIBUTION, options: imageryOptions, creditInfoUrl: IMAGERY_SERVICE
    },
    {
        id: 'satellite-labels', label: 'Satellite with labels', available: () => !!ARCGIS_KEY,
        url: imageryUrl, attribution: ESRI_ATTRIBUTION, options: imageryOptions, creditInfoUrl: IMAGERY_SERVICE,
        overlayUrl: () => esriUrl('arcgis/imagery/labels'), overlayOptions: labelsOptions
    }
];
const baseMapsById = new Map(BASE_MAPS.map(b => [b.id, b]));
const baseMapAvailable = b => !b.available || b.available();

let baseLayer = null;
let overlayLayer = null;
let esriCopyright = null;   // attribution text currently added to the map for Esri

function clearBaseMap() {
    if (baseLayer) map.removeLayer(baseLayer);
    if (overlayLayer) map.removeLayer(overlayLayer);
    if (esriCopyright) map.attributionControl.removeAttribution(esriCopyright);
    baseLayer = overlayLayer = esriCopyright = null;
}

// Esri asks for the data-provider credit that goes with the imagery in view; the service supplies it
async function addEsriDataCredit(infoUrl, forLayer) {
    try {
        const res = await fetch(`${infoUrl}?f=json&token=${encodeURIComponent(ARCGIS_KEY)}`);
        const info = await res.json();
        if (!info.copyrightText || baseLayer !== forLayer) return;   // switched away meanwhile
        esriCopyright = info.copyrightText;
        map.attributionControl.addAttribution(esriCopyright);
    } catch (err) {
        console.error('Could not load the Esri data credit:', err);
    }
}

function applyBaseMap() {
    let def = baseMapsById.get(settings.baseMap);
    if (!def || !baseMapAvailable(def)) def = baseMapsById.get('osm');   // unknown, or its key is missing
    clearBaseMap();

    const common = { attribution: def.attribution, maxZoom: MAX_ZOOM, ...def.options };
    baseLayer = L.tileLayer(typeof def.url === 'function' ? def.url() : def.url, common).addTo(map);
    baseLayer.bringToBack();

    if (def.overlayUrl) {
        if (!map.getPane('base-labels')) {
            const pane = map.createPane('base-labels');
            pane.style.zIndex = 300;            // above the map pictures, below the trees
            pane.style.pointerEvents = 'none';
        }
        overlayLayer = L.tileLayer(def.overlayUrl(), { ...common, ...def.overlayOptions, attribution: '', pane: 'base-labels' }).addTo(map);
    }
    if (def.creditInfoUrl) addEsriDataCredit(def.creditInfoUrl, baseLayer);
}
applyBaseMap();

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
const DEFAULT_TREE_ICON = '🌳';
const DEFAULT_DOT_COLOR = '#2e7d32';   // keep in step with .tree-dot in style.css
const IMAGE_ICON_RE = /\.(png|svg|webp|jpe?g|gif)$/i;

// Icon (a type's emoji or image) and dot colour for a tree type
function applyTypeLook(pin, typeId) {
    const type = typesById.get(typeId) || {};
    const emoji = pin.querySelector('.tree-emoji');
    const dot = pin.querySelector('.tree-dot');
    const icon = (type.icon || '').trim();

    emoji.replaceChildren();
    if (IMAGE_ICON_RE.test(icon)) {
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.onerror = () => { img.onerror = null; emoji.replaceChildren(DEFAULT_TREE_ICON); };   // missing file: fall back to the tree
        img.src = `img/${icon}`;
        emoji.appendChild(img);
    } else {
        emoji.textContent = icon || DEFAULT_TREE_ICON;
    }
    dot.style.background = type.color || '';
}

function buildPin(label, typeId) {
    const pin = document.createElement('div');
    pin.className = 'tree-pin';

    const emoji = document.createElement('span');
    emoji.className = 'tree-emoji';

    const text = document.createElement('span');
    text.className = 'tree-label';
    text.textContent = label;

    const dot = document.createElement('span');
    dot.className = 'tree-dot';

    pin.append(emoji, dot, text);
    applyTypeLook(pin, typeId);
    return pin;
}

function pinIcon(label, typeId) {
    return L.divIcon({
        html: buildPin(label, typeId),
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

function updateMarkerType(marker, typeId) {
    const el = marker && marker.getElement();
    const pin = el && el.querySelector('.tree-pin');
    if (pin) applyTypeLook(pin, typeId);
}

function setPinSelected(marker, selected) {
    const el = marker && marker.getElement();
    const pin = el && el.querySelector('.tree-pin');
    if (pin) pin.classList.toggle('selected', selected);
}

function addMarkerFor(tree) {
    const marker = L.marker([tree.latitude, tree.longitude], {
        icon: pinIcon(labelFor(tree), tree.treeTypeId),
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
    updateMarkerType(marker, tree.treeTypeId);
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

// ---------- Filtering: which trees are shown, faded or hidden ----------
const hideTimers = new Map();   // id -> timer that removes a faded marker once its fade-out has finished

function isFilterActive() {
    return filter.types.size > 0 || filter.query.trim() !== '';
}

function matchesFilter(tree) {
    if (filter.types.size && !filter.types.has(tree.treeTypeId)) return false;
    const words = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const type = typesById.get(tree.treeTypeId);
    const haystack = [tree.customName, type && type.commonName, type && type.scientificName, tree.description]
        .join(' ').toLowerCase();
    return words.every(w => haystack.includes(w));
}

// 'normal' | 'faded' | 'hidden'
function computeVisibility(tree) {
    // The tree being edited, and trees added or saved in the last few seconds, always show in full
    if ((state.selected && state.selected.id === tree.id) || state.recent.has(tree.id)) return 'normal';
    if (matchesFilter(tree)) return 'normal';
    return settings.showFaded ? 'faded' : 'hidden';
}

function setPinFaded(marker, faded) {
    const el = marker && marker.getElement();
    const pin = el && el.querySelector('.tree-pin');
    if (pin) pin.classList.toggle('faded', faded);
}

function applyVisibility(id) {
    const tree = state.trees.get(id);
    const marker = state.markers.get(id);
    if (!tree || !marker) return;

    clearTimeout(hideTimers.get(id));
    hideTimers.delete(id);

    const visibility = computeVisibility(tree);
    if (visibility === 'hidden') {
        // Fade out first, then take the marker off the map
        setPinFaded(marker, true);
        hideTimers.set(id, setTimeout(() => {
            hideTimers.delete(id);
            const current = state.trees.get(id);
            if (current && computeVisibility(current) === 'hidden' && map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        }, FADE_MS));
        return;
    }

    if (!map.hasLayer(marker)) marker.addTo(map);
    setPinFaded(marker, visibility === 'faded');
}

function applyAllVisibility() {
    for (const id of state.trees.keys()) applyVisibility(id);
}

// Keep a just-added or just-saved tree fully visible for a few seconds
function markRecent(id) {
    clearTimeout(state.recent.get(id));
    state.recent.set(id, setTimeout(() => {
        state.recent.delete(id);
        applyVisibility(id);
    }, RECENT_MS));
    applyVisibility(id);
}

function forgetTree(id) {
    clearTimeout(state.recent.get(id));
    state.recent.delete(id);
    clearTimeout(hideTimers.get(id));
    hideTimers.delete(id);
    state.photos.delete(id);
}

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
    markRecent(tree.id);  // stays fully visible for a few seconds even if a filter would fade it

    // Photos can't be attached until the tree row exists, so they wait on this
    const saving = storage.saveTree(tree);
    state.saving.set(tree.id, saving.catch(() => {}));
    try {
        await saving;
        state.saving.delete(tree.id);
    } catch (err) {
        console.error('Could not save tree:', err);
        state.saving.delete(tree.id);
        if (state.selected && state.selected.id === tree.id) closePanel();
        forgetTree(tree.id);
        const marker = state.markers.get(tree.id);
        if (marker) map.removeLayer(marker);
        state.markers.delete(tree.id);
        state.trees.delete(tree.id);
        showToast("Couldn't save the tree. Check your connection.");
    }
}

map.on('click', e => {
    // A tap outside the picker or the settings pane just closes it
    if (isPickerOpen()) {
        closePicker();
        return;
    }
    if (isPaneOpen()) {
        closePanes();
        return;
    }

    if (state.selected) {
        // View mode: the panel is read-only, a tap elsewhere just closes it
        if (state.mode === 'view') closePanel();
        // Edit mode: a tap moves the tree there (Save keeps it, Cancel undoes it)
        else moveSelectedTo(e.latlng);
        return;
    }

    // View mode never adds trees
    if (state.mode === 'view') return;

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
    closePanes();
    const readOnly = state.mode === 'view';
    state.selected = { id, original: { ...tree }, typeId: tree.treeTypeId };
    fillPanel(tree);
    setPanelReadOnly(readOnly);
    if (typeof photoPanelOpen === 'function') photoPanelOpen(id, readOnly);   // photos.js

    setPinSelected(marker, true);
    if (!readOnly) marker.dragging.enable();
    applyVisibility(id);   // a faded tree shows in full while it is open

    document.body.classList.add('panel-open');
    els.panel.hidden = false;
    revealMarker(marker);
}

// View mode shows the details but nothing can be changed
function setPanelReadOnly(readOnly) {
    for (const field of [els.type, els.name, els.desc, els.lat, els.lng]) field.disabled = readOnly;
    els.save.hidden = readOnly;
    els.del.hidden = readOnly;
    els.cancel.textContent = readOnly ? 'Close' : 'Cancel';
    els.desc.placeholder = readOnly ? 'No notes' : 'Add notes about this tree...';
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

    setPanelReadOnly(false);
    if (typeof photoPanelClose === 'function') photoPanelClose();   // photos.js
    applyVisibility(sel.id);   // back under the filter's rules (unless it was just saved)
}

// Live label preview while typing / changing type (reverted by Cancel)
function onDraftChanged() {
    if (!state.selected) return;
    const d = readDraft();
    const text = d.customName || typesById.get(d.treeTypeId)?.commonName || 'Unknown tree';
    const marker = state.markers.get(state.selected.id);
    updateMarkerLabel(marker, text);
    updateMarkerType(marker, d.treeTypeId);
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
    markRecent(sel.id);   // stays fully visible for a few seconds even if its new type is filtered out
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

    forgetTree(sel.id);
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

// ---------- Settings and filter panes ----------
function isSettingsOpen() {
    return !els.settingsPane.hidden;
}

function isFilterOpen() {
    return !els.filterPane.hidden;
}

function isPaneOpen() {
    return isSettingsOpen() || isFilterOpen();
}

function closeSettings() {
    els.settingsPane.hidden = true;
}

function closeFilter() {
    els.filterPane.hidden = true;
}

function closePanes() {
    closeSettings();
    closeFilter();
}

function openSettings() {
    closePicker();
    closeFilter();
    els.optFaded.checked = settings.showFaded;
    els.optLabelsSelected.checked = settings.labelsSelectedOnly;
    els.optDots.checked = settings.dotPins;
    renderBaseMapOptions();
    els.settingsPane.hidden = false;
}

function openFilter() {
    closePicker();
    closeSettings();
    renderFilterTypes();
    els.filterSearch.value = filter.query;
    updateFilterSummary();
    els.filterPane.hidden = false;
}

els.settingsBtn.addEventListener('click', () => {
    if (isSettingsOpen()) closeSettings(); else openSettings();
});
els.settingsClose.addEventListener('click', closeSettings);

els.filterBtn.addEventListener('click', () => {
    if (isFilterOpen()) closeFilter(); else openFilter();
});
els.filterClose.addEventListener('click', closeFilter);

// -- View / edit mode (the button shows the mode you will switch TO)
function setMode(mode) {
    if (mode === state.mode) return;
    if (state.guest && mode === 'edit') return;
    if (state.selected) {
        if (isDirty()) {
            showToast('Save or cancel your changes first');
            return;
        }
        closePanel();
    }
    state.mode = mode;
    closePicker();
    closePanes();
    document.body.classList.toggle('view-mode', mode === 'view');
    els.modePill.hidden = mode !== 'view';

    const next = mode === 'view' ? 'Switch to edit mode' : 'Switch to view mode';
    els.modeBtn.textContent = mode === 'view' ? '✏️' : '👁️';
    els.modeBtn.setAttribute('aria-label', next);
    els.modeBtn.title = next;
}

els.modeBtn.addEventListener('click', () => setMode(state.mode === 'view' ? 'edit' : 'view'));

// -- Filters
function renderFilterTypes() {
    const counts = new Map();
    for (const tree of state.trees.values()) {
        counts.set(tree.treeTypeId, (counts.get(tree.treeTypeId) || 0) + 1);
    }

    els.filterTypes.replaceChildren();
    for (const type of treeTypes) {
        const row = document.createElement('label');
        row.className = 'check-row';

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = filter.types.has(type.id);
        box.addEventListener('change', () => {
            if (box.checked) filter.types.add(type.id); else filter.types.delete(type.id);
            onFilterChanged();
        });

        const swatch = document.createElement('span');
        swatch.className = 'type-swatch';
        swatch.style.background = type.color || DEFAULT_DOT_COLOR;

        const name = document.createElement('span');
        name.className = 'check-name';
        name.textContent = type.commonName;

        const count = document.createElement('span');
        count.className = 'check-count';
        count.textContent = counts.get(type.id) || 0;

        row.append(box, swatch, name, count);
        els.filterTypes.appendChild(row);
    }
}

function updateFilterSummary() {
    const total = state.trees.size;
    const matching = [...state.trees.values()].filter(matchesFilter).length;
    const active = isFilterActive();

    els.filterSummary.textContent = active
        ? `${matching} of ${total} trees match`
        : `${total} tree${total === 1 ? '' : 's'}`;
    els.filterShow.textContent = active ? `Show ${matching} on map` : `Show all ${total}`;
    els.filterShow.disabled = matching === 0;
    els.filterClear.hidden = !active;
    els.filterDot.hidden = !active;
}

function onFilterChanged() {
    applyAllVisibility();
    updateFilterSummary();
}

els.filterSearch.addEventListener('input', () => {
    filter.query = els.filterSearch.value;
    onFilterChanged();
});

els.filterSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        showMatchesOnMap();
    }
});

els.filterClear.addEventListener('click', () => {
    filter.types.clear();
    filter.query = '';
    els.filterSearch.value = '';
    renderFilterTypes();
    onFilterChanged();
});

function showMatchesOnMap() {
    const points = [...state.trees.values()]
        .filter(matchesFilter)
        .map(t => [t.latitude, t.longitude]);
    if (!points.length) {
        showToast('No matching trees');
        return;
    }
    closeFilter();
    map.fitBounds(L.latLngBounds(points), { padding: [70, 70], maxZoom: MAX_NATIVE_ZOOM });
}
els.filterShow.addEventListener('click', showMatchesOnMap);

// -- Display options
function applyLabelSetting() {
    els.map.classList.toggle('labels-selected-only', settings.labelsSelectedOnly);
    els.map.classList.toggle('dot-pins', settings.dotPins);
}

els.optFaded.addEventListener('change', () => {
    settings.showFaded = els.optFaded.checked;
    saveSettings();
    applyAllVisibility();
});

function renderBaseMapOptions() {
    const current = baseMapsById.get(settings.baseMap) && baseMapAvailable(baseMapsById.get(settings.baseMap)) ? settings.baseMap : 'osm';
    els.baseMapList.replaceChildren();
    for (const b of BASE_MAPS) {
        const row = document.createElement('label');
        row.className = 'check-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'baseMap';
        radio.checked = b.id === current;
        radio.disabled = !baseMapAvailable(b);
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            settings.baseMap = b.id;
            saveSettings();
            applyBaseMap();
        });
        const name = document.createElement('span');
        name.className = 'check-name';
        name.textContent = b.label;
        row.append(radio, name);
        els.baseMapList.appendChild(row);
    }
    els.baseMapHelp.hidden = BASE_MAPS.every(baseMapAvailable);
}

els.optDots.addEventListener('change', () => {
    settings.dotPins = els.optDots.checked;
    saveSettings();
    applyLabelSetting();
});

els.optLabelsSelected.addEventListener('change', () => {
    settings.labelsSelectedOnly = els.optLabelsSelected.checked;
    saveSettings();
    applyLabelSetting();
});

// -- Export (built in the browser from the trees already loaded; nothing is sent anywhere)
const MY_MAPS_ROW_LIMIT = 2000;   // Google My Maps: files shouldn't exceed 2,000 rows

// Quote a CSV cell. Text that starts with = + - @ would be read as a formula by
// Google Sheets / Excel, so it gets a leading apostrophe.
function csvCell(value, isText = true) {
    let s = value == null ? '' : String(value);
    if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv(columns, rows) {
    // columns: [{ header, value(tree) , text? }]; BOM so Excel reads accents correctly
    const lines = [columns.map(c => csvCell(c.header, false)).join(',')];
    for (const tree of rows) {
        lines.push(columns.map(c => csvCell(c.value(tree), c.text !== false)).join(','));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
}

const coord = n => Number(n.toFixed(7));   // 7 decimals is about 1 cm

const typeLabel = tree => typeName(tree.treeTypeId) || tree.treeTypeId;
const typeScientific = tree => (typesById.get(tree.treeTypeId) || {}).scientificName || '';

// Everything, for Google Sheets (also works as a backup)
const SHEET_COLUMNS = [
    { header: 'id', value: t => t.id },
    { header: 'latitude', value: t => coord(t.latitude), text: false },
    { header: 'longitude', value: t => coord(t.longitude), text: false },
    { header: 'tree_type', value: typeLabel },
    { header: 'scientific_name', value: typeScientific },
    { header: 'tree_type_id', value: t => t.treeTypeId },
    { header: 'name', value: t => t.customName },
    { header: 'description', value: t => t.description },
    { header: 'status', value: t => t.status },
    { header: 'created_at', value: t => t.timestamp },
    { header: 'updated_at', value: t => t.updatedAt }
];

// Leaner, for Google My Maps: "name" is the title, and every other column shows in the pin's popup
const MAP_COLUMNS = [
    { header: 'name', value: labelFor },
    { header: 'latitude', value: t => coord(t.latitude), text: false },
    { header: 'longitude', value: t => coord(t.longitude), text: false },
    { header: 'type', value: typeLabel },
    { header: 'scientific_name', value: typeScientific },
    { header: 'description', value: t => t.description }
];

function localDateStamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function downloadTextFile(filename, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportTrees(kind) {
    const trees = [...state.trees.values()].sort((x, y) => String(x.timestamp).localeCompare(String(y.timestamp)));
    if (!trees.length) {
        showToast('No trees to export');
        return;
    }
    const isMap = kind === 'map';
    const csv = buildCsv(isMap ? MAP_COLUMNS : SHEET_COLUMNS, trees);
    downloadTextFile(`trees-${isMap ? 'my-maps' : 'sheet'}-${localDateStamp()}.csv`, csv, 'text/csv;charset=utf-8');

    if (isMap && trees.length > MY_MAPS_ROW_LIMIT) {
        showToast(`Exported ${trees.length} trees. My Maps takes up to ${MY_MAPS_ROW_LIMIT.toLocaleString()} rows per file, so split it.`);
    } else {
        showToast(`Exported ${trees.length} tree${trees.length === 1 ? '' : 's'}`);
    }
}

els.exportSheet.addEventListener('click', () => exportTrees('sheet'));
els.exportMap.addEventListener('click', () => exportTrees('map'));

// -- Sign out (this device only; other devices stay signed in). For a guest the same button is "Sign in".
els.signOut.addEventListener('click', async () => {
    if (state.guest) {
        setGuestFlag(false);
        location.reload();   // back to the sign-in screen
        return;
    }
    if (!confirm('Sign out on this device?')) return;
    try {
        const { error } = await sb.auth.signOut({ scope: 'local' });
        if (error) throw error;
    } catch (err) {
        console.error('Sign out failed:', err);
        showToast("Couldn't sign out");
    }
    // On success the SIGNED_OUT event below reloads the page to the sign-in screen
});

// ---------- Guest mode ----------
function setGuestFlag(on) {
    try {
        if (on) localStorage.setItem(GUEST_KEY, '1'); else localStorage.removeItem(GUEST_KEY);
    } catch (err) { /* not critical */ }
}

function wasGuest() {
    try { return localStorage.getItem(GUEST_KEY) === '1'; } catch (err) { return false; }
}

// View only: no mode button, no adding or editing, and "Sign out" becomes "Sign in"
function enterGuestMode() {
    state.guest = true;
    document.body.classList.add('guest');
    setMode('view');
    els.modePill.textContent = '👁️ Guest · view only';
    els.signOut.textContent = 'Sign in';
    els.signOut.classList.remove('danger');
}

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
    btn: $('loginBtn'),
    guest: $('guestBtn')
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
    setGuestFlag(false);
    await loadTrees();
});

loginEls.guest.addEventListener('click', async () => {
    setGuestFlag(true);
    loginEls.overlay.hidden = true;
    enterGuestMode();
    await loadTrees();
});

// If the session ends (signed out, or it can no longer be refreshed), start over at the sign-in screen
sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') location.reload();
});

// ---------- Start up ----------
async function loadTrees() {
    if (!state.guest) await offerLocalUpload();

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
    applyLabelSetting();

    let session = null;
    try {
        ({ data: { session } } = await sb.auth.getSession());
    } catch (err) {
        console.error('Could not read session:', err);
    }

    if (!session) {
        if (wasGuest()) {
            enterGuestMode();
            await loadTrees();
        } else {
            showLogin();
        }
        return;
    }
    setGuestFlag(false);   // signed in: no longer a guest
    await loadTrees();
}

init();
