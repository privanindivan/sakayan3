export const VEHICLE_TYPES = ['Jeepney', 'Bus', 'UV Express', 'Tricycle', 'MRT/LRT', 'Ferry']

export const TYPE_COLORS = {
  Jeepney:      '#FF6B35',
  Bus:          '#4A90D9',
  'UV Express': '#27AE60',
  Tricycle:     '#F39C12',
  'MRT/LRT':    '#8E44AD',
  Ferry:        '#2980B9',
}

// All sample stops clustered in Metro Manila
export const INITIAL_MARKERS = [
  {
    id: 1,
    lat: 14.5998,
    lng: 120.9843,
    type: 'Jeepney',
    name: 'Quiapo Terminal',
    images: [
      'https://placehold.co/480x240/FF6B35/white?text=Quiapo+Terminal',
      'https://placehold.co/480x240/FF6B35/white?text=Jeepney+Stop',
      'https://placehold.co/480x240/FF6B35/white?text=Quiapo+Route',
    ],
  },
  {
    id: 2,
    lat: 14.6188,
    lng: 121.0509,
    type: 'Bus',
    name: 'Cubao Bus Terminal',
    images: [
      'https://placehold.co/480x240/4A90D9/white?text=Cubao+Bus+Terminal',
      'https://placehold.co/480x240/4A90D9/white?text=Cubao+Stop+1',
      'https://placehold.co/480x240/4A90D9/white?text=Cubao+Stop+2',
    ],
  },
  {
    id: 3,
    lat: 14.5535,
    lng: 121.0197,
    type: 'UV Express',
    name: 'Makati Ayala UV Terminal',
    images: [
      'https://placehold.co/480x240/27AE60/white?text=Ayala+UV+Terminal',
      'https://placehold.co/480x240/27AE60/white?text=Makati+Van+1',
      'https://placehold.co/480x240/27AE60/white?text=Makati+Van+2',
    ],
  },
  {
    id: 4,
    lat: 14.5499,
    lng: 121.0508,
    type: 'UV Express',
    name: 'BGC Stopover Terminal',
    images: [
      'https://placehold.co/480x240/27AE60/white?text=BGC+Stopover',
      'https://placehold.co/480x240/27AE60/white?text=BGC+Van+1',
      'https://placehold.co/480x240/27AE60/white?text=BGC+Van+2',
    ],
  },
  {
    id: 5,
    lat: 14.5860,
    lng: 121.0569,
    type: 'MRT/LRT',
    name: 'MRT-3 Ortigas Station',
    images: [
      'https://placehold.co/480x240/8E44AD/white?text=MRT+Ortigas',
      'https://placehold.co/480x240/8E44AD/white?text=MRT+Platform',
      'https://placehold.co/480x240/8E44AD/white?text=EDSA+Line',
    ],
  },
  {
    id: 6,
    lat: 14.6029,
    lng: 120.9826,
    type: 'MRT/LRT',
    name: 'LRT-1 Doroteo Jose Station',
    images: [
      'https://placehold.co/480x240/8E44AD/white?text=LRT+Doroteo+Jose',
      'https://placehold.co/480x240/8E44AD/white?text=LRT+Platform',
      'https://placehold.co/480x240/8E44AD/white?text=LRT-1+Line',
    ],
  },
  {
    id: 7,
    lat: 14.6024,
    lng: 120.9730,
    type: 'Jeepney',
    name: 'Divisoria Jeepney Stop',
    images: [
      'https://placehold.co/480x240/FF6B35/white?text=Divisoria+Jeepney',
      'https://placehold.co/480x240/FF6B35/white?text=Divisoria+Stop',
      'https://placehold.co/480x240/FF6B35/white?text=Tondo+Route',
    ],
  },
]

// Routes defined as waypoints — RoadRoute fetches real road geometry from OSRM
export const SAMPLE_ROUTES = [
  {
    id: 'r1',
    waypoints: [
      [14.5998, 120.9843], // Quiapo
      [14.6049, 121.0090], // España / Sampaloc
      [14.6188, 121.0509], // Cubao
    ],
    label: 'Jeepney — Quiapo to Cubao',
    color: '#FF6B35',
  },
  {
    id: 'r2',
    waypoints: [
      [14.6024, 120.9730], // Divisoria
      [14.5790, 120.9830], // Ermita
      [14.5535, 121.0197], // Makati Ayala
    ],
    label: 'Bus — Divisoria to Makati',
    color: '#4A90D9',
  },
  {
    id: 'r3',
    waypoints: [
      [14.5535, 121.0197], // Makati Ayala
      [14.5499, 121.0508], // BGC
    ],
    label: 'UV Express — Makati to BGC',
    color: '#27AE60',
  },
]
