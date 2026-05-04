// 105 real-world vehicles spanning 7 tiers.
// `bookPrice` is the legal-dealer sticker. Chop and black-market dealer prices
// are derived at sell time (15% and 40% of book respectively, modified by city).
//
// IMAGES (optional): add an `image` field to any entry to render a photo
// in the Car Dealer / Chop Shop / Garage cards. Three options:
//   1. Drop a JPG into `client/public/cars/` and set `image: '/cars/yaris.jpg'`.
//   2. Use a hosted URL: `image: 'https://upload.wikimedia.org/.../Yaris.jpg'`.
//   3. Leave it blank — the UI falls back to a styled tier emoji + maker name.
//
// Tiers:
//   1 — beater / subcompact     (~£4k–£11k)
//   2 — compact sedan           (~£20k–£32k)
//   3 — hot hatch / mid SUV     (~£32k–£45k)
//   4 — premium / performance   (~£45k–£80k)
//   5 — luxury / high perf      (~£80k–£150k)
//   6 — exotic / supercar       (~£160k–£300k)
//   7 — hypercar / ultra-lux    (~£320k–£3.6M)

export const VEHICLES = [
  //  Tier 1 
  { id: 'toyota_yaris',       name: 'Yaris',            maker: 'Toyota',      tier: 1, bookPrice: 7500  },
  { id: 'hyundai_accent',     name: 'Accent',           maker: 'Hyundai',     tier: 1, bookPrice: 8000  },
  { id: 'kia_rio',            name: 'Rio',              maker: 'Kia',         tier: 1, bookPrice: 9000  },
  { id: 'nissan_versa',       name: 'Versa',            maker: 'Nissan',      tier: 1, bookPrice: 10000  },
  { id: 'ford_fiesta',        name: 'Fiesta',           maker: 'Ford',        tier: 1, bookPrice: 7000  },
  { id: 'chevy_spark',        name: 'Spark',            maker: 'Chevrolet',   tier: 1, bookPrice: 8000  },
  { id: 'mitsubishi_mirage',  name: 'Mirage',           maker: 'Mitsubishi',  tier: 1, bookPrice: 10500  },
  { id: 'honda_fit',          name: 'Fit',              maker: 'Honda',       tier: 1, bookPrice: 11000  },
  { id: 'suzuki_swift',       name: 'Swift',            maker: 'Suzuki',      tier: 1, bookPrice: 10000  },
  { id: 'renault_clio',       name: 'Clio',             maker: 'Renault',     tier: 1, bookPrice: 12000  },
  { id: 'peugeot_208',        name: '208',              maker: 'Peugeot',     tier: 1, bookPrice: 14000  },
  { id: 'fiat_500',           name: '500',              maker: 'Fiat',        tier: 1, bookPrice: 13000  },
  { id: 'vw_polo',            name: 'Polo',             maker: 'Volkswagen',  tier: 1, bookPrice: 16500 },
  { id: 'skoda_fabia',        name: 'Fabia',            maker: 'Škoda',       tier: 1, bookPrice: 15000 },
  { id: 'dacia_sandero',      name: 'Sandero',          maker: 'Dacia',       tier: 1, bookPrice: 14000  },
  { id: 'old_corolla',        name: 'Corolla (E120)',   maker: 'Toyota',      tier: 1, bookPrice: 6500  },

  //  Tier 2 
  { id: 'honda_civic',        name: 'Civic',            maker: 'Honda',       tier: 2, bookPrice: 36000 },
  { id: 'toyota_camry',       name: 'Camry',            maker: 'Toyota',      tier: 2, bookPrice: 42000 },
  { id: 'toyota_corolla',     name: 'Corolla',          maker: 'Toyota',      tier: 2, bookPrice: 33000 },
  { id: 'mazda_3',            name: 'Mazda3',           maker: 'Mazda',       tier: 2, bookPrice: 34500 },
  { id: 'vw_golf',            name: 'Golf',             maker: 'Volkswagen',  tier: 2, bookPrice: 39000 },
  { id: 'ford_focus',         name: 'Focus',            maker: 'Ford',        tier: 2, bookPrice: 31500 },
  { id: 'nissan_sentra',      name: 'Sentra',           maker: 'Nissan',      tier: 2, bookPrice: 33000 },
  { id: 'hyundai_elantra',    name: 'Elantra',          maker: 'Hyundai',     tier: 2, bookPrice: 34000 },
  { id: 'kia_forte',          name: 'Forte',            maker: 'Kia',         tier: 2, bookPrice: 32000 },
  { id: 'chevy_cruze',        name: 'Cruze',            maker: 'Chevrolet',   tier: 2, bookPrice: 34500 },
  { id: 'subaru_impreza',     name: 'Impreza',          maker: 'Subaru',      tier: 2, bookPrice: 37500 },
  { id: 'mitsubishi_lancer',  name: 'Lancer',           maker: 'Mitsubishi',  tier: 2, bookPrice: 30000 },
  { id: 'honda_accord',       name: 'Accord',           maker: 'Honda',       tier: 2, bookPrice: 45000 },
  { id: 'mazda_6',            name: 'Mazda6',           maker: 'Mazda',       tier: 2, bookPrice: 48000 },
  { id: 'vw_jetta',           name: 'Jetta',            maker: 'Volkswagen',  tier: 2, bookPrice: 37500 },
  { id: 'ford_fusion',        name: 'Fusion',           maker: 'Ford',        tier: 2, bookPrice: 39000 },
  { id: 'hyundai_sonata',     name: 'Sonata',           maker: 'Hyundai',     tier: 2, bookPrice: 42000 },

  //  Tier 3 
  { id: 'vw_gti',             name: 'Golf GTI',         maker: 'Volkswagen',  tier: 3, bookPrice: 54000 },
  { id: 'civic_type_r',       name: 'Civic Type R',     maker: 'Honda',       tier: 3, bookPrice: 68000 },
  { id: 'subaru_wrx',         name: 'WRX',              maker: 'Subaru',      tier: 3, bookPrice: 57000 },
  { id: 'mazda_mx5',          name: 'MX-5 Miata',       maker: 'Mazda',       tier: 3, bookPrice: 49500 },
  { id: 'mustang_ecoboost',   name: 'Mustang EcoBoost', maker: 'Ford',        tier: 3, bookPrice: 52000 },
  { id: 'toyota_gr86',        name: 'GR86',             maker: 'Toyota',      tier: 3, bookPrice: 48000 },
  { id: 'nissan_370z',        name: '370Z',             maker: 'Nissan',      tier: 3, bookPrice: 52000 },
  { id: 'veloster_n',         name: 'Veloster N',       maker: 'Hyundai',     tier: 3, bookPrice: 54000 },
  { id: 'toyota_rav4',        name: 'RAV4',             maker: 'Toyota',      tier: 3, bookPrice: 52000 },
  { id: 'honda_crv',          name: 'CR-V',             maker: 'Honda',       tier: 3, bookPrice: 54000 },
  { id: 'ford_escape',        name: 'Escape',           maker: 'Ford',        tier: 3, bookPrice: 48000 },
  { id: 'mazda_cx5',          name: 'CX-5',             maker: 'Mazda',       tier: 3, bookPrice: 51000 },
  { id: 'subaru_outback',     name: 'Outback',          maker: 'Subaru',      tier: 3, bookPrice: 57000 },
  { id: 'vw_tiguan',          name: 'Tiguan',           maker: 'Volkswagen',  tier: 3, bookPrice: 52000 },

  //  Tier 4 
  { id: 'bmw_3series',        name: '3 Series',         maker: 'BMW',         tier: 4, bookPrice: 78000 },
  { id: 'mercedes_cclass',    name: 'C-Class',          maker: 'Mercedes',    tier: 4, bookPrice: 82000 },
  { id: 'audi_a4',            name: 'A4',               maker: 'Audi',        tier: 4, bookPrice: 75000 },
  { id: 'lexus_is',           name: 'IS',               maker: 'Lexus',       tier: 4, bookPrice: 72000 },
  { id: 'genesis_g70',        name: 'G70',              maker: 'Genesis',     tier: 4, bookPrice: 68000 },
  { id: 'cadillac_ct4',       name: 'CT4',              maker: 'Cadillac',    tier: 4, bookPrice: 75000 },
  { id: 'bmw_m3',             name: 'M3',               maker: 'BMW',         tier: 4, bookPrice: 114000 },
  { id: 'audi_s4',            name: 'S4',               maker: 'Audi',        tier: 4, bookPrice: 90000 },
  { id: 'mercedes_c43',       name: 'C43 AMG',          maker: 'Mercedes',    tier: 4, bookPrice: 105000 },
  { id: 'mustang_gt',         name: 'Mustang GT',       maker: 'Ford',        tier: 4, bookPrice: 68000 },
  { id: 'camaro_ss',          name: 'Camaro SS',        maker: 'Chevrolet',   tier: 4, bookPrice: 72000 },
  { id: 'challenger_rt',      name: 'Challenger R/T',   maker: 'Dodge',       tier: 4, bookPrice: 68000 },
  { id: 'subaru_sti',         name: 'WRX STI',          maker: 'Subaru',      tier: 4, bookPrice: 75000 },
  { id: 'tesla_model3p',      name: 'Model 3 Performance', maker: 'Tesla',    tier: 4, bookPrice: 82000 },

  //  Tier 5 
  { id: 'bmw_5series',        name: '5 Series',         maker: 'BMW',         tier: 5, bookPrice: 128000  },
  { id: 'mercedes_eclass',    name: 'E-Class',          maker: 'Mercedes',    tier: 5, bookPrice: 132000  },
  { id: 'audi_a6',            name: 'A6',               maker: 'Audi',        tier: 5, bookPrice: 123000  },
  { id: 'lexus_ls',           name: 'LS',               maker: 'Lexus',       tier: 5, bookPrice: 150000 },
  { id: 'bmw_m5',             name: 'M5',               maker: 'BMW',         tier: 5, bookPrice: 195000 },
  { id: 'audi_rs6',           name: 'RS6 Avant',        maker: 'Audi',        tier: 5, bookPrice: 195000 },
  { id: 'mercedes_e63',       name: 'E63 AMG',          maker: 'Mercedes',    tier: 5, bookPrice: 200000 },
  { id: 'porsche_911_carrera',name: '911 Carrera',      maker: 'Porsche',     tier: 5, bookPrice: 195000 },
  { id: 'chevy_corvette',     name: 'Corvette Stingray',maker: 'Chevrolet',   tier: 5, bookPrice: 120000  },
  { id: 'challenger_hellcat', name: 'Challenger Hellcat',maker:'Dodge',       tier: 5, bookPrice: 142000  },
  { id: 'mustang_gt500',      name: 'Mustang Shelby GT500', maker: 'Ford',    tier: 5, bookPrice: 135000  },
  { id: 'tesla_models_plaid', name: 'Model S Plaid',    maker: 'Tesla',       tier: 5, bookPrice: 195000 },
  { id: 'bmw_m8',             name: 'M8',               maker: 'BMW',         tier: 5, bookPrice: 225000 },
  { id: 'maserati_ghibli',    name: 'Ghibli Trofeo',    maker: 'Maserati',    tier: 5, bookPrice: 180000 },
  { id: 'lexus_lc500',        name: 'LC 500',           maker: 'Lexus',       tier: 5, bookPrice: 158000 },

  //  Tier 6 
  { id: 'porsche_911_turbo_s',name: '911 Turbo S',      maker: 'Porsche',     tier: 6, bookPrice: 345000 },
  { id: 'audi_r8',            name: 'R8',               maker: 'Audi',        tier: 6, bookPrice: 300000 },
  { id: 'mercedes_amg_gt',    name: 'AMG GT',           maker: 'Mercedes',    tier: 6, bookPrice: 270000 },
  { id: 'bmw_m8_comp',        name: 'M8 Competition',   maker: 'BMW',         tier: 6, bookPrice: 260000 },
  { id: 'aston_vantage',      name: 'Vantage',          maker: 'Aston Martin',tier: 6, bookPrice: 240000 },
  { id: 'aston_db11',         name: 'DB11',             maker: 'Aston Martin',tier: 6, bookPrice: 330000 },
  { id: 'maserati_mc20',      name: 'MC20',             maker: 'Maserati',    tier: 6, bookPrice: 360000 },
  { id: 'lambo_huracan',      name: 'Huracán EVO',      maker: 'Lamborghini', tier: 6, bookPrice: 450000 },
  { id: 'lambo_urus',         name: 'Urus',             maker: 'Lamborghini', tier: 6, bookPrice: 360000 },
  { id: 'ferrari_roma',       name: 'Roma',             maker: 'Ferrari',     tier: 6, bookPrice: 375000 },
  { id: 'mclaren_gt',         name: 'GT',               maker: 'McLaren',     tier: 6, bookPrice: 330000 },
  { id: 'gtr_nismo',          name: 'GT-R Nismo',       maker: 'Nissan',      tier: 6, bookPrice: 320000 },
  { id: 'porsche_taycan_ts',  name: 'Taycan Turbo S',   maker: 'Porsche',     tier: 6, bookPrice: 300000 },
  { id: 'bentley_continental',name: 'Continental GT',   maker: 'Bentley',     tier: 6, bookPrice: 375000 },

  //  Tier 7 
  { id: 'ferrari_488_pista',  name: '488 Pista',        maker: 'Ferrari',     tier: 7, bookPrice: 600000  },
  { id: 'ferrari_sf90',       name: 'SF90 Stradale',    maker: 'Ferrari',     tier: 7, bookPrice: 790000  },
  { id: 'lambo_aventador_svj',name: 'Aventador SVJ',    maker: 'Lamborghini', tier: 7, bookPrice: 870000  },
  { id: 'mclaren_720s',       name: '720S',             maker: 'McLaren',     tier: 7, bookPrice: 480000  },
  { id: 'mclaren_765lt',      name: '765LT',            maker: 'McLaren',     tier: 7, bookPrice: 570000  },
  { id: 'porsche_918',        name: '918 Spyder',       maker: 'Porsche',     tier: 7, bookPrice: 2250000 },
  { id: 'bugatti_chiron',     name: 'Chiron',           maker: 'Bugatti',     tier: 7, bookPrice: 5250000 },
  { id: 'pagani_huayra',      name: 'Huayra',           maker: 'Pagani',      tier: 7, bookPrice: 4200000 },
  { id: 'koenigsegg_jesko',   name: 'Jesko',            maker: 'Koenigsegg',  tier: 7, bookPrice: 4500000 },
  { id: 'rolls_phantom',      name: 'Phantom',          maker: 'Rolls-Royce', tier: 7, bookPrice: 750000  },
  { id: 'bentley_mulsanne',   name: 'Mulsanne',         maker: 'Bentley',     tier: 7, bookPrice: 525000  },
  { id: 'aston_valkyrie',     name: 'Valkyrie',         maker: 'Aston Martin',tier: 7, bookPrice: 4500000 },
  { id: 'lambo_sian',         name: 'Sián FKP 37',      maker: 'Lamborghini', tier: 7, bookPrice: 5400000 },
  { id: 'ferrari_laferrari',  name: 'LaFerrari',        maker: 'Ferrari',     tier: 7, bookPrice: 2250000 },
  { id: 'amg_one',            name: 'AMG One',          maker: 'Mercedes',    tier: 7, bookPrice: 4050000 },

  //  Expansion 
  // Tier 1 — beaters
  { id: 'lada_riva',          name: 'Riva',             maker: 'Lada',        tier: 1, bookPrice: 2000   },
  { id: 'fiat_panda',         name: 'Panda',            maker: 'Fiat',        tier: 1, bookPrice: 2500   },
  { id: 'dacia_logan',        name: 'Logan',            maker: 'Dacia',       tier: 1, bookPrice: 3500   },
  { id: 'kia_picanto',        name: 'Picanto',          maker: 'Kia',         tier: 1, bookPrice: 5000   },

  // Tier 2 — compacts
  { id: 'honda_civic',        name: 'Civic',            maker: 'Honda',       tier: 2, bookPrice: 27000  },
  { id: 'mazda_3',            name: 'Mazda 3',          maker: 'Mazda',       tier: 2, bookPrice: 33000  },
  { id: 'toyota_corolla',     name: 'Corolla',          maker: 'Toyota',      tier: 2, bookPrice: 31500  },
  { id: 'hyundai_i30',        name: 'i30',              maker: 'Hyundai',     tier: 2, bookPrice: 36000  },

  // Tier 3 — hot hatches / SUVs
  { id: 'vw_golf_gti',        name: 'Golf GTI',         maker: 'Volkswagen',  tier: 3, bookPrice: 57000  },
  { id: 'subaru_wrx',         name: 'WRX STI',          maker: 'Subaru',      tier: 3, bookPrice: 66000  },
  { id: 'mini_jcw',           name: 'JCW',              maker: 'Mini',        tier: 3, bookPrice: 62000  },
  { id: 'jeep_wrangler',      name: 'Wrangler',         maker: 'Jeep',        tier: 3, bookPrice: 69000  },

  // Tier 4 — premium
  { id: 'audi_a6',            name: 'A6',               maker: 'Audi',        tier: 4, bookPrice: 112000  },
  { id: 'bmw_5',              name: '5 Series',         maker: 'BMW',         tier: 4, bookPrice: 117000  },
  { id: 'mercedes_e',         name: 'E-Class',          maker: 'Mercedes',    tier: 4, bookPrice: 123000  },
  { id: 'lexus_es',           name: 'ES 350',           maker: 'Lexus',       tier: 4, bookPrice: 102000  },
  { id: 'genesis_g80',        name: 'G80',              maker: 'Genesis',     tier: 4, bookPrice: 108000  },

  // Tier 5 — luxury
  { id: 'porsche_panamera',   name: 'Panamera',         maker: 'Porsche',     tier: 5, bookPrice: 250000 },
  { id: 'maserati_quattro',   name: 'Quattroporte',     maker: 'Maserati',    tier: 5, bookPrice: 220000 },
  { id: 'aston_db11',         name: 'DB11',             maker: 'Aston Martin',tier: 5, bookPrice: 330000 },
  { id: 'audi_rs7',           name: 'RS7',              maker: 'Audi',        tier: 5, bookPrice: 195000 },

  // Tier 6 — exotic
  { id: 'lambo_urus',         name: 'Urus',             maker: 'Lamborghini', tier: 6, bookPrice: 420000 },
  { id: 'ferrari_roma',       name: 'Roma',             maker: 'Ferrari',     tier: 6, bookPrice: 345000 },
  { id: 'mclaren_720s',       name: '720S',             maker: 'McLaren',     tier: 6, bookPrice: 480000 },
  { id: 'porsche_911_turbo',  name: '911 Turbo S',      maker: 'Porsche',     tier: 6, bookPrice: 375000 },

  // Tier 7 — hyper
  { id: 'rimac_nevera',       name: 'Nevera',           maker: 'Rimac',       tier: 7, bookPrice: 3600000 },
  { id: 'lotus_evija',        name: 'Evija',            maker: 'Lotus',       tier: 7, bookPrice: 3300000 },
  { id: 'aston_one_77',       name: 'One-77',           maker: 'Aston Martin',tier: 7, bookPrice: 2700000 },
  { id: 'ferrari_812sf',      name: '812 Superfast',    maker: 'Ferrari',     tier: 7, bookPrice: 540000  },
  { id: 'mclaren_speedtail',  name: 'Speedtail',        maker: 'McLaren',     tier: 7, bookPrice: 3450000 },
];

export const VEHICLE_BY_ID = Object.fromEntries(VEHICLES.map(v => [v.id, v]));
export const VEHICLES_BY_TIER = VEHICLES.reduce((m, v) => ((m[v.tier] = m[v.tier] || []).push(v), m), {});

export const TIER_NAMES = {
  1: 'Beater',
  2: 'Compact',
  3: 'Hot Hatch / SUV',
  4: 'Premium / Performance',
  5: 'Luxury',
  6: 'Exotic',
  7: 'Hypercar',
};

export const tierEmoji = (tier) => (tier >= 6 ? '' : tier >= 4 ? '' : tier === 3 ? '' : '');

// Random vehicle from a given tier — used by GTA crime success.
export function rollVehicleFromTier(tier) {
  const pool = VEHICLES_BY_TIER[tier] || [];
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
