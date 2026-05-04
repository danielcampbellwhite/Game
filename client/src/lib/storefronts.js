// Per-city storefront branding. Each store type maps city id → local name
// and (optionally) a hero image of the proprietor. Cities without an image
// just render the title; we can add their photos later.
//
// Tex's Gun Shop is shared across the US cities — treat it as a regional
// chain so the cowboy-clerk photo fits all three storefronts.

import gunstoreClerkUS from '../assets/gunstore-clerk.webp';
import gunstoreClerkLondon from '../assets/gunstore-clerk-london.webp';
import gunstoreClerkKingston from '../assets/gunstore-clerk-kingston.webp';

const TEX_US = { name: "Tex's Gun Shop", image: gunstoreClerkUS, clerk: 'Tex',
  quote: "Howdy, partner — walk in armed, walk out armoured." };

export const STOREFRONTS = {
  gun: {
    new_york:    TEX_US,
    los_angeles: TEX_US,
    miami:       TEX_US,
    kingston:    { name: "Yardie Gun Shop", image: gunstoreClerkKingston,
                   clerk: 'Bredren',
                   quote: "Wha gwaan? We don't call 911 — respect the gun, respect life." },
    rio:         { name: "Praça das Armas" },
    london:      { name: "Holland & Holland's Weaponry", image: gunstoreClerkLondon,
                   clerk: 'Mr. Holland',
                   quote: "Good day, sir. The finest English gunmaking, established 1835." },
    paris:       { name: "L'Arsenal de Pigalle" },
    berlin:      { name: "Kreuzberg Waffenhaus" },
    moscow:      { name: "Volkov Oruzheinaya" },
    dubai:       { name: "Al-Faris Trading Co." },
    tokyo:       { name: "Kabukichō Kogu" },
    hong_kong:   { name: "Lam Kee Hardware" },
    sydney:      { name: "Macca's Sporting Goods" },
    cape_town:   { name: "Veld Outfitters" },
  },

  general: {
    new_york:    { name: "Vinny's Bodega" },
    los_angeles: { name: "Sunset Mart" },
    miami:       { name: "El Mercadito" },
    kingston:    { name: "Auntie's Sundries" },
    rio:         { name: "Quitanda da Esquina" },
    london:      { name: "Murphy's Corner Shop" },
    paris:       { name: "Tabac de l'Horloge" },
    berlin:      { name: "Späti am Eck" },
    moscow:      { name: "Produkty 24" },
    dubai:       { name: "Al-Souk Provisions" },
    tokyo:       { name: "Konbini Kabuki" },
    hong_kong:   { name: "Ng's Sundries" },
    sydney:      { name: "Bondi Milk Bar" },
    cape_town:   { name: "Spaza Stop" },
  },

  cars: {
    new_york:    { name: "Five Boroughs Auto" },
    los_angeles: { name: "Sunset Strip Motors" },
    miami:       { name: "Ocean Drive Autos" },
    kingston:    { name: "Halfway Tree Motors" },
    rio:         { name: "Copacabana Carros" },
    london:      { name: "Mayfair Motors" },
    paris:       { name: "Concession des Champs" },
    berlin:      { name: "Mitte Motoren" },
    moscow:      { name: "Tverskaya Avto" },
    dubai:       { name: "Sheikh Zayed Motors" },
    tokyo:       { name: "Akihabara Auto" },
    hong_kong:   { name: "Causeway Bay Cars" },
    sydney:      { name: "Parramatta Motors" },
    cape_town:   { name: "Camps Bay Auto" },
  },

  chop: {
    new_york:    { name: "Hunts Point Chop" },
    los_angeles: { name: "Compton Cuts" },
    miami:       { name: "Overtown Chop" },
    kingston:    { name: "Trench Town Strip" },
    rio:         { name: "Favela Desmanche" },
    london:      { name: "Greasy Dave's Chop Shop" },
    paris:       { name: "Atelier de la Goutte d'Or" },
    berlin:      { name: "Neukölln Werkstatt" },
    moscow:      { name: "Lyubertsy Razborka" },
    dubai:       { name: "Industrial Zone Chop" },
    tokyo:       { name: "Adachi Bara-shi" },
    hong_kong:   { name: "Sham Shui Po Yard" },
    sydney:      { name: "Bankstown Wreckers" },
    cape_town:   { name: "Cape Flats Chop" },
  },
};

const FALLBACKS = {
  gun:     { name: "Gun Shop" },
  general: { name: "General Store" },
  cars:    { name: "Auto Dealer" },
  chop:    { name: "Chop Shop" },
};

export function storefront(kind, cityId) {
  return STOREFRONTS[kind]?.[cityId] || FALLBACKS[kind] || { name: '' };
}
