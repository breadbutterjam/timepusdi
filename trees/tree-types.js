// Tree types shown in the picker. Edit this list to add or rename types.
//
//   id             saved with every tree, so don't change it once trees use it
//   commonName     shown as the map label and in the picker
//   scientificName shown in the picker, also searchable
//   image          file name inside the img/ folder (optional; a built-in
//                  placeholder is used if the file is missing)
//   color          dot colour on the map and swatch in the filter list, as
//                  '#rrggbb' (optional; green if left out)
//   icon           what to show on the map instead of the default tree 🌳
//                  (optional). Either an emoji, like '🌴', or an image file
//                  name inside the img/ folder, like 'papaya.png' (a small
//                  transparent PNG or SVG, about 88 x 88 px, works best)
//
// The first type in the list is the default for new trees.
// Colour groups (about five colours stay easy to tell apart on a map):
//   green (default)  Rain Tree
//   magenta          flowering trees: Gulmohar, Bougainvillea, Copperpod
//   purple           sacred figs: Peepal, Banyan
//   orange           fruit trees: Mango, Papaya
//   blue             palms: Coconut
const treeTypes = [
    { id: 'rain-tree', commonName: 'Rain Tree', scientificName: 'Samanea saman', image: 'rain-tree.jpg' },
    { id: 'gulmohar', commonName: 'Gulmohar', scientificName: 'Delonix regia', image: 'gulmohar.jpg', color: '#d81b60' },
    { id: 'bougainvillea', commonName: 'Bougainvillea', scientificName: 'Bougainvillea glabra', image: 'bougainvillea.jpg', color: '#d81b60' },
    { id: 'peepal', commonName: 'Peepal', scientificName: 'Ficus religiosa', image: 'peepal.jpg', color: '#7b1fa2' },
    { id: 'mango', commonName: 'Mango', scientificName: 'Mangifera indica', image: 'mango.jpg', color: '#ef6c00' },
    { id: 'banyan', commonName: 'Banyan', scientificName: 'Ficus benghalensis', image: 'banyan.jpg', color: '#7b1fa2' },
    { id: 'copperpod', commonName: 'Copperpod', scientificName: 'Peltophorum pterocarpum', image: 'copperpod.jpg', color: '#d81b60' },
    { id: 'papaya', commonName: 'Papaya', scientificName: 'Carica papaya', image: 'papaya.jpg', color: '#ef6c00' },
    { id: 'cocos-nucifera', commonName: 'Coconut tree', scientificName: 'Cocos nucifera', image: 'cocos-nucifera.jpg', color: '#00290e', icon: '🌴' },
    { id: 'asopalav', commonName: 'Asopalav', scientificName: 'Monoon longifolium', image: 'asopalav.jpg', color: '#00290e', icon: '🌴' },
    { id: 'badam', commonName: 'Badam', scientificName: 'Prunus dulcis', image: 'badam.jpg' },
    { id: 'laburnum', commonName: 'Laburnum', scientificName: 'Laburnum anagyroides', image: 'laburnum.jpg', color: '#dcfb17'},
    { id: 'boab', commonName: 'Boab', scientificName: 'Adansonia digitata', image: 'boab.jpg', color: '#dcfb17'},
    { id: 'other', commonName: 'Tree', scientificName: 'other-tree', image: 'tree.jpg' }
    // { id: 'pink-trumpet', commonName: 'Pink Trumpet', scientificName: 'Tabebuia rosea', image: 'pink-trumpet.jpg' },
    // { id: 'devil-tree', commonName: 'Devil Tree', scientificName: 'Alstonia scholaris', image: 'devil-tree.jpg' },
    // { id: 'golden-shower', commonName: 'Golden Shower', scientificName: 'Cassia fistula', image: 'golden-shower.jpg' },
    // { id: 'frangipani', commonName: 'Frangipani', scientificName: 'Plumeria', image: 'frangipani.jpg' },
    // { id: 'indian-almond', commonName: 'Indian Almond', scientificName: 'Terminalia catappa', image: 'indian-almond.jpg' },
];
