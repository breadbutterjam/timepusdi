        // Placeholder shown when a tree photo is missing. Built in as an inline
        // SVG, so it needs no file and can never fail to load.
        const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">' +
            '<rect width="200" height="150" fill="#e8f3ea"/>' +
            '<text x="100" y="95" font-size="64" text-anchor="middle">🌳</text>' +
            '</svg>'
        );

        // Tree Types Data
        // Photos live in the img/ folder next to index.html (e.g. img/banyan.jpg).
        // If a photo is missing, the built-in placeholder above is used instead.
        const treeTypes = [
            { id: 'rain-tree', commonName: 'Rain Tree', scientificName: 'Samanea saman', image: 'rain-tree.jpg' },
            { id: 'gulmohar', commonName: 'Gulmohar', scientificName: 'Delonix regia', image: 'gulmohar.jpg' },
            { id: 'bougainvillea', commonName: 'Bougainvillea', scientificName: 'Bougainvillea glabra', image: 'bougainvillea.jpg' },
            { id: 'peepal', commonName: 'Peepal', scientificName: 'Ficus religiosa', image: 'peepal.jpg' },
            { id: 'mango', commonName: 'Mango', scientificName: 'Mangifera indica', image: 'mango.jpg' },
            { id: 'banyan', commonName: 'Banyan', scientificName: 'Ficus benghalensis', image: 'banyan.jpg' },
            { id: 'copperpod', commonName: 'Copperpod', scientificName: 'Peltophorum pterocarpum', image: 'copperpod.jpg' },
            { id: 'papaya', commonName: 'Papaya', scientificName: 'Carica papaya', image: 'papaya.jpg' },
            { id: 'cocos-nucifera', commonName: 'Coconut tree', scientificName: 'Cocos nucifera', image: 'cocos-nucifera.jpg' }
            // { id: 'peltophorum', commonName: 'Yellow Gulmohar', scientificName: 'Peltophorum pterocarpum', image: 'peltophorum.jpg' },
            // { id: 'pink-trumpet', commonName: 'Pink Trumpet', scientificName: 'Tabebuia rosea', image: 'pink-trumpet.jpg' },
            // { id: 'devil-tree', commonName: 'Devil Tree', scientificName: 'Alstonia scholaris', image: 'devil-tree.jpg' },
            // { id: 'golden-shower', commonName: 'Golden Shower', scientificName: 'Cassia fistula', image: 'golden-shower.jpg' },
            // { id: 'frangipani', commonName: 'Frangipani', scientificName: 'Plumeria', image: 'frangipani.jpg' },
            // { id: 'indian-almond', commonName: 'Indian Almond', scientificName: 'Terminalia catappa', image: 'indian-almond.jpg' },
            
        ];

        // State Management
        let appState = {
            mode: 'add', // 'add' or 'edit'
            currentLocation: null,
            selectedTreeType: null,
            viewMode: 'dropdown', // 'visual' or 'dropdown'
            optionalExpanded: false,
            currentTreeId: null
        };

        // Storage for saved trees
        let savedTrees = [];
        let treeMarkers = {}; // Map of tree ID to marker object

        // Initialize Map
        const map = L.map('map').setView([19.0755, 72.8316], 19);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        let currentMarker = null;

        // LocalStorage helper functions
        function loadTreesFromStorage() {
            try {
                const stored = localStorage.getItem('savedTrees');
                return stored ? JSON.parse(stored) : [];
            } catch (error) {
                console.error('Error loading trees:', error);
                return [];
            }
        }

        function saveTreesToStorage() {
            try {
                localStorage.setItem('savedTrees', JSON.stringify(savedTrees));
            } catch (error) {
                console.error('Error saving trees:', error);
            }
        }

        // DOM Elements
        const elements = {
            latitudeInput: document.getElementById('latitudeInput'),
            longitudeInput: document.getElementById('longitudeInput'),
            locateBtnSmall: document.getElementById('locateBtnSmall'),
            locateIcon: document.getElementById('locateIcon'),
            locateText: document.getElementById('locateText'),
            viewToggle: document.getElementById('viewToggle'),
            visualGrid: document.getElementById('visualGrid'),
            dropdownView: document.getElementById('dropdownView'),
            treeTypeDropdown: document.getElementById('treeTypeDropdown'),
            treeSearch: document.getElementById('treeSearch'),
            searchInput: document.getElementById('searchInput'),
            optionalToggle: document.getElementById('optionalToggle'),
            optionalContent: document.getElementById('optionalContent'),
            toggleArrow: document.getElementById('toggleArrow'),
            toggleArrowLabel: document.getElementById('optionDetailsLabel'),
            customName: document.getElementById('customName'),
            description: document.getElementById('description'),
            saveBtn: document.getElementById('saveBtn'),
            cancelBtn: document.getElementById('cancelBtn'),
            deleteBtn: document.getElementById('deleteBtn'),
            editActionsContainer: document.getElementById('editActionsContainer'),
            floatingDeleteBtn: document.getElementById('floatingDeleteBtn'),
            floatingCancelBtn: document.getElementById('floatingCancelBtn'),
            floatingUpdateBtn: document.getElementById('floatingUpdateBtn'),
            statusMessage: document.getElementById('statusMessage'),
            loadingOverlay: document.getElementById('loadingOverlay')
        };

        // Initialize UI
        function initializeUI() {
            // Populate visual grid
            treeTypes.forEach(tree => {
                const card = document.createElement('div');
                card.className = 'tree-card';
                card.dataset.treeId = tree.id;
                
                const img = document.createElement('img');
                img.alt = tree.commonName;
                img.loading = 'lazy';
                // One-shot fallback: disarm the handler first so a failing
                // placeholder can never re-trigger it and loop.
                img.onerror = () => {
                    img.onerror = null;
                    img.src = PLACEHOLDER_IMG;
                };
                img.src = tree.image ? `img/${tree.image}` : PLACEHOLDER_IMG;
                
                const name = document.createElement('div');
                name.className = 'tree-card-name';
                name.textContent = tree.commonName;
                
                const scientific = document.createElement('div');
                scientific.className = 'tree-card-scientific';
                scientific.textContent = tree.scientificName;
                
                card.appendChild(img);
                card.appendChild(name);
                card.appendChild(scientific);
                
                card.addEventListener('click', () => selectTreeType(tree.id));
                
                elements.visualGrid.appendChild(card);
            });

            // Populate dropdown
            treeTypes.forEach(tree => {
                const option = document.createElement('option');
                option.value = tree.id;
                option.textContent = `${tree.commonName} (${tree.scientificName})`;
                elements.treeTypeDropdown.appendChild(option);
            });

            // elements.treeTypeDropdown.selectedIndex = 1;
            // elements.treeTypeDropdown.focus();
        }

        // Create tree marker on map
        function createTreeMarker(treeData) {
            const treeIcon = L.divIcon({
                html: '🌳',
                className: 'tree-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            });

            const marker = L.marker([treeData.latitude, treeData.longitude], { 
                icon: treeIcon,
                draggable: false
            }).addTo(map);

            // Click handler to edit tree
            marker.on('click', function() {
                enterEditMode(treeData.id);
            });

            // Store marker reference
            treeMarkers[treeData.id] = marker;

            return marker;
        }

        // Load and display all saved trees
        function loadAllTrees() {
            // Clear existing markers
            Object.values(treeMarkers).forEach(marker => map.removeLayer(marker));
            treeMarkers = {};

            // Load from storage
            savedTrees = loadTreesFromStorage();

            // Create markers for all trees
            savedTrees.forEach(tree => {
                createTreeMarker(tree);
            });

            console.log(`Loaded ${savedTrees.length} trees`);
        }

        // Enter edit mode for a tree
        function enterEditMode(treeId) {
            const tree = savedTrees.find(t => t.id === treeId);
            if (!tree) return;

            appState.mode = 'edit';
            appState.currentTreeId = treeId;
            appState.currentLocation = { lat: tree.latitude, lng: tree.longitude };
            appState.selectedTreeType = tree.treeTypeId;

            // Populate form
            selectTreeType(tree.treeTypeId);
            elements.customName.value = tree.customName || '';
            elements.description.value = tree.description || '';

            // Update coordinates display
            updateCoordinates(tree.latitude, tree.longitude);
            
            // Make coordinate inputs editable in edit mode
            elements.latitudeInput.removeAttribute('readonly');
            elements.longitudeInput.removeAttribute('readonly');

            // Make this marker draggable
            const marker = treeMarkers[treeId];
            if (marker) {
                marker.setOpacity(0.7);
                marker.dragging.enable();
                
                marker.on('dragend', function(e) {
                    const pos = e.target.getLatLng();
                    appState.currentLocation = { lat: pos.lat, lng: pos.lng };
                    updateCoordinates(pos.lat, pos.lng);
                    positionFloatingButtons(marker);
                });
                
                // Show and position floating action buttons
                positionFloatingButtons(marker);
                elements.editActionsContainer.classList.add('show');
            }

            // Update UI
            document.body.classList.add('edit-mode');

            // Scroll form into view
            document.querySelector('.form-section').scrollTop = 0;
        }

        // Position floating buttons near the marker
        function positionFloatingButtons(marker) {
            const markerPos = map.latLngToContainerPoint(marker.getLatLng());
            const container = elements.editActionsContainer;
            
            // Position to the right of the marker
            container.style.left = (markerPos.x + 45) + 'px';
            container.style.top = (markerPos.y - 20) + 'px';
        }

        // Update button position on map move/zoom
        map.on('move zoom', function() {
            if (appState.mode === 'edit' && appState.currentTreeId) {
                const marker = treeMarkers[appState.currentTreeId];
                if (marker) {
                    positionFloatingButtons(marker);
                }
            }
        });

        // Exit edit mode
        function exitEditMode() {
            if (appState.mode === 'edit' && appState.currentTreeId) {
                const marker = treeMarkers[appState.currentTreeId];
                if (marker) {
                    marker.setOpacity(1);
                    marker.dragging.disable();
                }
            }

            resetForm();
        }

        // Select tree type
        function selectTreeType(treeId) {
            appState.selectedTreeType = treeId;
            
            // Update visual selection
            document.querySelectorAll('.tree-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.treeId === treeId);
            });
            
            // Update dropdown
            elements.treeTypeDropdown.value = treeId;
            
            // Show ready-to-place message
            const tree = treeTypes.find(t => t.id === treeId);
            if (tree && appState.mode === 'add') {
                showStatus(`Tap map to add ${tree.commonName}`);
            }
            
            validateForm();
        }

        // Toggle view mode
        elements.viewToggle.addEventListener('click', () => {
            appState.viewMode = appState.viewMode === 'visual' ? 'dropdown' : 'visual';
            
            if (appState.viewMode === 'visual') {
                elements.visualGrid.classList.add('active');
                elements.dropdownView.classList.remove('active');
                elements.treeSearch.classList.add('active');
                elements.viewToggle.textContent = 'switch to dropdown view';
            } else {
                elements.visualGrid.classList.remove('active');
                elements.dropdownView.classList.add('active');
                elements.treeSearch.classList.remove('active');
                elements.viewToggle.textContent = 'select visually';
            }
        });

        // Dropdown change
        elements.treeTypeDropdown.addEventListener('change', (e) => {
            if (e.target.value) {
                selectTreeType(e.target.value);
            }
        });

        // Search functionality
        elements.searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            document.querySelectorAll('.tree-card').forEach(card => {
                const treeId = card.dataset.treeId;
                const tree = treeTypes.find(t => t.id === treeId);
                
                if (!tree) {
                    card.style.display = 'none';
                    return;
                }
                
                const matchesSearch = 
                    tree.commonName.toLowerCase().includes(searchTerm) ||
                    tree.scientificName.toLowerCase().includes(searchTerm);
                
                card.style.display = matchesSearch ? 'block' : 'none';
            });
        });

        // Toggle optional details
        elements.optionalToggle.addEventListener('click', () => {
            appState.optionalExpanded = !appState.optionalExpanded;
            elements.optionalContent.classList.toggle('expanded', appState.optionalExpanded);
            elements.toggleArrow.textContent = appState.optionalExpanded ? '-' : '+';
            elements.toggleArrowLabel.textContent = appState.optionalExpanded ? 'hide optional details' : 'add optional details';
        });

        // Update coordinates display
        function updateCoordinates(lat, lng) {
            elements.latitudeInput.value = lat.toFixed(6);
            elements.longitudeInput.value = lng.toFixed(6);
            appState.currentLocation = { lat, lng };
            validateForm();
        }

        // Coordinate input change handlers (only work in edit mode)
        elements.latitudeInput.addEventListener('change', function() {
            if (appState.mode !== 'edit') return;
            
            const lat = parseFloat(this.value);
            const lng = parseFloat(elements.longitudeInput.value);
            
            if (isNaN(lat) || isNaN(lng)) return;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                showStatus('Invalid coordinates');
                return;
            }
            
            appState.currentLocation = { lat, lng };
            
            // Update marker position
            const marker = treeMarkers[appState.currentTreeId];
            if (marker) {
                marker.setLatLng([lat, lng]);
            }
            
            validateForm();
        });

        elements.longitudeInput.addEventListener('change', function() {
            if (appState.mode !== 'edit') return;
            
            const lat = parseFloat(elements.latitudeInput.value);
            const lng = parseFloat(this.value);
            
            if (isNaN(lat) || isNaN(lng)) return;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                showStatus('Invalid coordinates');
                return;
            }
            
            appState.currentLocation = { lat, lng };
            
            // Update marker position
            const marker = treeMarkers[appState.currentTreeId];
            if (marker) {
                marker.setLatLng([lat, lng]);
            }
            
            validateForm();
        });

        // Add/update marker
        function addMarker(lat, lng) {
            if (currentMarker) {
                map.removeLayer(currentMarker);
            }

            // Tree emoji icon
            const treeIcon = L.divIcon({
                html: '🌳',
                className: 'emoji-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            });



            currentMarker = L.marker([lat, lng], { 
                icon: treeIcon,
                draggable: appState.mode === 'edit'
            }).addTo(map);
            
            if (appState.mode === 'edit') {
                currentMarker.on('dragend', function(e) {
                    const pos = e.target.getLatLng();
                    updateCoordinates(pos.lat, pos.lng);
                });
            }
            
            // console.log('treeIcon:', currentMarker);
            // currentMarker.classList.add('tree-marker');
            currentMarker._icon.classList.add("tree-marker")
            updateCoordinates(lat, lng);
        }

        // Map click
        map.on('click', function(e) {
            // Only allow adding new marker in add mode
            if (appState.mode === 'add' && appState.selectedTreeType) {
                // Directly add tree without needing to click "Add Tree" button
                const treeData = {
                    id: generateId(),
                    latitude: e.latlng.lat,
                    longitude: e.latlng.lng,
                    treeTypeId: appState.selectedTreeType,
                    customName: elements.customName.value.trim(),
                    description: elements.description.value.trim(),
                    timestamp: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    status: 'active'
                };

                // Add to saved trees
                savedTrees.push(treeData);
                
                // Save to localStorage
                saveTreesToStorage();
                
                // Create marker
                createTreeMarker(treeData);
                
                showStatus('Tree added!');
                
                // Clear optional fields but keep tree type selected
                elements.customName.value = '';
                elements.description.value = '';
                
                console.log('Tree added:', treeData);
            }
        });

        // Geolocation
        elements.locateBtnSmall.addEventListener('click', function() {
            if (!navigator.geolocation) {
                showStatus('Geolocation not supported');
                return;
            }

            elements.locateIcon.textContent = '⌛';
            elements.locateText.textContent = 'locating...';

            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    
                    map.setView([lat, lng], 17);
                    addMarker(lat, lng);
                    
                    elements.locateIcon.textContent = '📍';
                    elements.locateText.textContent = 'locate me';
                },
                function(error) {
                    showStatus('Unable to get location: ' + error.message);
                    elements.locateIcon.textContent = '📍';
                    elements.locateText.textContent = 'locate me';
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });

        // Validate form
        function validateForm() {
            const isValid = appState.currentLocation && appState.selectedTreeType;
            elements.saveBtn.disabled = !isValid;
        }

        // Save tree
        elements.saveBtn.addEventListener('click', async () => {
            if (!appState.currentLocation || !appState.selectedTreeType) return;

            const treeData = {
                id: appState.currentTreeId || generateId(),
                latitude: appState.currentLocation.lat,
                longitude: appState.currentLocation.lng,
                treeTypeId: appState.selectedTreeType,
                customName: elements.customName.value.trim(),
                description: elements.description.value.trim(),
                timestamp: appState.currentTreeId 
                    ? (savedTrees.find(t => t.id === appState.currentTreeId)?.timestamp || new Date().toISOString())
                    : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                status: 'active'
            };

            if (appState.mode === 'edit') {
                // Update existing tree
                const index = savedTrees.findIndex(t => t.id === treeData.id);
                if (index !== -1) {
                    savedTrees[index] = treeData;
                    
                    // Remove old marker
                    if (treeMarkers[treeData.id]) {
                        map.removeLayer(treeMarkers[treeData.id]);
                        delete treeMarkers[treeData.id];
                    }
                }
            } else {
                // Add new tree
                savedTrees.push(treeData);
            }

            // Save to localStorage
            saveTreesToStorage();

            // Create/update marker
            createTreeMarker(treeData);
            
            // In edit mode, center map on updated tree location
            if (appState.mode === 'edit') {
                map.setView([treeData.latitude, treeData.longitude], map.getZoom());
            }

            console.log('Tree saved:', treeData);
            
            // TODO: Save to Supabase (Phase 2)
            // TODO: Save to Google Sheets (Phase 4)
            
            showStatus(appState.mode === 'edit' ? 'Tree updated!' : 'Tree added!');
            resetForm();
        });

        // Delete tree
        elements.deleteBtn.addEventListener('click', () => {
            if (!appState.currentTreeId) return;

            const tree = savedTrees.find(t => t.id === appState.currentTreeId);
            if (!tree) return;

            const treeName = tree.customName || treeTypes.find(t => t.id === tree.treeTypeId)?.commonName || 'this tree';
            
            if (confirm(`Delete ${treeName}?`)) {
                // Remove from array
                savedTrees = savedTrees.filter(t => t.id !== appState.currentTreeId);
                
                // Remove marker
                if (treeMarkers[appState.currentTreeId]) {
                    map.removeLayer(treeMarkers[appState.currentTreeId]);
                    delete treeMarkers[appState.currentTreeId];
                }
                
                // Save to storage
                saveTreesToStorage();
                
                showStatus('Tree deleted');
                resetForm();
            }
        });

        // Cancel
        elements.cancelBtn.addEventListener('click', () => {
            exitEditMode();
        });

        // Floating button handlers
        elements.floatingUpdateBtn.addEventListener('click', async () => {
            if (!appState.currentLocation || !appState.selectedTreeType) return;

            const treeData = {
                id: appState.currentTreeId,
                latitude: appState.currentLocation.lat,
                longitude: appState.currentLocation.lng,
                treeTypeId: appState.selectedTreeType,
                customName: elements.customName.value.trim(),
                description: elements.description.value.trim(),
                timestamp: savedTrees.find(t => t.id === appState.currentTreeId)?.timestamp || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                status: 'active'
            };

            // Update existing tree
            const index = savedTrees.findIndex(t => t.id === treeData.id);
            if (index !== -1) {
                savedTrees[index] = treeData;
                
                // Remove old marker
                if (treeMarkers[treeData.id]) {
                    map.removeLayer(treeMarkers[treeData.id]);
                    delete treeMarkers[treeData.id];
                }
            }

            // Save to localStorage
            saveTreesToStorage();

            // Create/update marker
            createTreeMarker(treeData);
            
            // Center map on updated tree location
            map.setView([treeData.latitude, treeData.longitude], map.getZoom());

            showStatus('Tree updated!');
            resetForm();
        });

        elements.floatingDeleteBtn.addEventListener('click', () => {
            if (!appState.currentTreeId) return;

            const tree = savedTrees.find(t => t.id === appState.currentTreeId);
            if (!tree) return;

            const treeName = tree.customName || treeTypes.find(t => t.id === tree.treeTypeId)?.commonName || 'this tree';
            
            if (confirm(`Delete ${treeName}?`)) {
                // Remove from array
                savedTrees = savedTrees.filter(t => t.id !== appState.currentTreeId);
                
                // Remove marker
                if (treeMarkers[appState.currentTreeId]) {
                    map.removeLayer(treeMarkers[appState.currentTreeId]);
                    delete treeMarkers[appState.currentTreeId];
                }
                
                // Save to storage
                saveTreesToStorage();
                
                showStatus('Tree deleted');
                resetForm();
            }
        });

        elements.floatingCancelBtn.addEventListener('click', () => {
            exitEditMode();
        });

        // Reset form
        function resetForm() {
            // Clean up edit mode
            if (appState.mode === 'edit' && appState.currentTreeId) {
                const marker = treeMarkers[appState.currentTreeId];
                if (marker) {
                    marker.setOpacity(1);
                    marker.dragging.disable();
                }
            }

            appState.mode = 'add';
            appState.selectedTreeType = null;
            appState.currentLocation = null;
            appState.currentTreeId = null;
            
            elements.customName.value = '';
            elements.description.value = '';
            
            document.querySelectorAll('.tree-card').forEach(card => {
                card.classList.remove('selected');
            });
            elements.treeTypeDropdown.value = '';
            
            if (currentMarker) {
                map.removeLayer(currentMarker);
                currentMarker = null;
            }
            
            // Reset coordinate inputs
            elements.latitudeInput.value = '';
            elements.longitudeInput.value = '';
            elements.latitudeInput.placeholder = 'Tap map';
            elements.longitudeInput.placeholder = '—';
            elements.latitudeInput.setAttribute('readonly', 'readonly');
            elements.longitudeInput.setAttribute('readonly', 'readonly');
            
            elements.saveBtn.textContent = 'Add Tree';
            elements.cancelBtn.style.display = 'none';
            elements.deleteBtn.style.display = 'none';
            elements.editActionsContainer.classList.remove('show');
            document.body.classList.remove('edit-mode');
            
            validateForm();
        }

        // Show status message
        function showStatus(message) {
            elements.statusMessage.textContent = message;
            elements.statusMessage.classList.add('show');
            setTimeout(() => {
                elements.statusMessage.classList.remove('show');
            }, 2000);
        }

        // Generate ID
        function generateId() {
            return 'tree_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        // Initialize
        initializeUI();
        loadAllTrees();
        validateForm();
