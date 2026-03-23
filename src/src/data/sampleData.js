export const VEHICLE_TYPES = ['Jeep', 'Bus', 'UV Express', 'Tricycle', 'Train']

export const TYPE_COLORS = {
  Jeep:         '#FF6B35',
  Bus:          '#4A90D9',
  'UV Express': '#27AE60',
  Tricycle:     '#F39C12',
  Train:        '#8E44AD',
}

// OSRM returns car-speed durations. PH public transit is slower (traffic, stops, loading).
// These factors adjust raw OSRM seconds to realistic in-vehicle travel time.
// Sources: TomTom 2024 (Manila worst traffic), JICA Metro Manila study, EDSA Busway research.
export const DURATION_FACTORS = {
  Jeep:         1.7,  // ~20–30 km/h urban; frequent stops + heavy traffic
  Bus:          1.4,  // wider roads but still congested; fewer stops than jeep
  'UV Express': 1.2,  // express routes, fewer stops, slightly faster
  Tricycle:     1.9,  // local streets only; slowest mode
  Train:        0.85, // fixed rail, no traffic; often faster than driving
}

// All sample stops clustered in Metro Manila
export const INITIAL_MARKERS = [
  {
    id: 1,
    lat: 14.5998,
    lng: 120.9843,
    type: 'Jeep',
    name: 'Quiapo Terminal',
    details: 'Major jeep hub near Quiapo Church. Routes to Cubao, Divisoria, and Espana. Operates 5am–11pm.',
    images: [
      'https://placehold.co/480x240/FF6B35/white?text=Quiapo+Terminal',
      'https://placehold.co/480x240/FF6B35/white?text=Jeep+Stop',
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
    type: 'Train',
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
    type: 'Train',
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
    type: 'Jeep',
    name: 'Divisoria Jeep Stop',
    images: [
      'https://placehold.co/480x240/FF6B35/white?text=Divisoria+Jeep',
      'https://placehold.co/480x240/FF6B35/white?text=Divisoria+Stop',
      'https://placehold.co/480x240/FF6B35/white?text=Tondo+Route',
    ],
  },
]

