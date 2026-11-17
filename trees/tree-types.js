// Tree types shown in the picker. Edit this list to add or rename types.
//
//   id             saved with every tree, so don't change it once trees use it
//   commonName     shown as the map label and in the picker
//   scientificName shown in the picker, also searchable
//   image          file name inside the img/ folder (optional; a built-in
//                  placeholder is used if the file is missing)
//
// The first type in the list is the default for new trees.
const treeTypes = [
    { id: 'rain-tree', commonName: 'Rain Tree', scientificName: 'Samanea saman', image: 'rain-tree.jpg' },
    { id: 'gulmohar', commonName: 'Gulmohar', scientificName: 'Delonix regia', image: 'gulmohar.jpg' },
    { id: 'bougainvillea', commonName: 'Bougainvillea', scientificName: 'Bougainvillea glabra', image: 'bougainvillea.jpg' },
    { id: 'peepal', commonName: 'Peepal', scientificName: 'Ficus religiosa', image: 'peepal.jpg' },
    { id: 'mango', commonName: 'Mango', scientificName: 'Mangifera indica', image: 'mango.jpg' },
    { id: 'banyan', commonName: 'Banyan', scientificName: 'Ficus benghalensis', image: 'banyan.jpg' },
    { id: 'copperpod', commonName: 'Copperpod', scientificName: 'Peltophorum pterocarpum', image: 'copperpod.jpg' },
    { id: 'papaya', commonName: 'Papaya', scientificName: 'Carica papaya', image: 'papaya.jpg' },
    { id: 'cocos-nucifera', commonName: 'Coconut tree', scientificName: 'Cocos nucifera', image: 'cocos-nucifera.jpg' },
    { id: 'jamun', commonName: 'Jamun tree', scientificName: 'Syzygium cumini', image: 'jamun.jpg' },
    { id: 'badam', commonName: 'Badam tree', scientificName: 'Terminalia catappa', image: 'badam.jpg' },
    // { id: 'devil-tree', commonName: 'Devil Tree', scientificName: 'Alstonia scholaris', image: 'devil-tree.jpg' },
    // { id: 'golden-shower', commonName: 'Golden Shower', scientificName: 'Cassia fistula', image: 'golden-shower.jpg' },
    // { id: 'frangipani', commonName: 'Frangipani', scientificName: 'Plumeria', image: 'frangipani.jpg' },
    // { id: 'indian-almond', commonName: 'Indian Almond', scientificName: 'Terminalia catappa', image: 'indian-almond.jpg' },
];
