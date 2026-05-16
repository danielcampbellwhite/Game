import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import authRoutes from './routes/auth.js';
import characterRoutes from './routes/character.js';
import worldRoutes from './routes/world.js';
import crimeRoutes from './routes/crimes.js';
import jailRoutes from './routes/jail.js';
import jailbreakRoutes from './routes/jailbreak.js';
import hospitalRoutes from './routes/hospital.js';
import jobBoardRoutes from './routes/job-board.js';
import playerShopsRoutes from './routes/player-shops.js';
import tradesRoutes from './routes/trades.js';
import murderRoutes from './routes/murder.js';
import robRoutes from './routes/rob.js';
import customizeRoutes from './routes/customize.js';
import travelRoutes from './routes/travel.js';
import drugRoutes from './routes/drugs.js';
import businessRoutes from './routes/businesses.js';
import combatRoutes from './routes/combat.js';
import bankRoutes from './routes/bank.js';
import stockRoutes from './routes/stocks.js';
import propertyRoutes from './routes/properties.js';
import houseRoutes from './routes/house.js';
import gymRoutes from './routes/gym.js';
import rangeRoutes from './routes/range.js';
import universityRoutes from './routes/university.js';
import inventoryRoutes from './routes/inventory.js';
import vehiclesRoutes from './routes/vehicles.js';
import hangarRoutes from './routes/hangar.js';
import aircraftDealerRoutes from './routes/aircraft-dealer.js';
import dailyRoutes from './routes/daily.js';
import dealershipRoutes from './routes/dealership.js';
import chopshopRoutes from './routes/chopshop.js';
import gunstoreRoutes from './routes/gunstore.js';
import repairRoutes from './routes/repair.js';
import drivingSchoolRoutes from './routes/driving-school.js';
import racesRoutes from './routes/races.js';
import factionsRoutes from './routes/factions.js';
import bountiesRoutes from './routes/bounties.js';
import contractsRoutes from './routes/contracts.js';
import shopsRoutes from './routes/shops.js';
import specialisationsRoutes from './routes/specialisations.js';
import fenceRoutes from './routes/fence.js';
import casinoRoutes from './routes/casino.js';
import bookmakerRoutes from './routes/bookmaker.js';
import notificationRoutes from './routes/notifications.js';
import missionRoutes from './routes/missions.js';
import generalStoreRoutes from './routes/general-store.js';
import electronicsRoutes from './routes/electronics.js';
import onlineRoutes from './routes/online.js';
import eventsRoutes from './routes/events.js';
import playersRoutes from './routes/players.js';
import messagesRoutes from './routes/messages.js';
import pvpRoutes from './routes/pvp.js';
import gangsRoutes from './routes/gangs.js';
import turfsRoutes from './routes/turfs.js';
import ocRoutes from './routes/oc.js';
import incarcerationRoutes from './routes/incarceration.js';
import adminRoutes from './routes/admin.js';
import areaRoutes from './routes/areas.js';
import newspaperRoutes from './routes/newspaper.js';
import chasesRoutes from './routes/chases.js';
import burglaryRoutes from './routes/burglary.js';
import investigationsRoutes from './routes/investigations.js';
import trialsRoutes from './routes/trials.js';
import premiumRoutes from './routes/premium.js';
import friendsRoutes from './routes/friends.js';
import chatRoutes from './routes/chat.js';
import locationsRoutes from './routes/locations.js';
import clothingRoutes from './routes/clothing.js';
import { requireAuth, requireCharacter } from './middleware/auth.js';
import { requireAtLocation } from './middleware/location.js';
import { handleStripeWebhook } from './services/stripe.js';

const PORT = process.env.PORT || 4000;

initDb();

const app = express();
app.use(cors());

// Stripe webhook — MUST mount before express.json() because Stripe's
// signature verification requires the raw request body bytes (any
// reformatting changes the HMAC). The handler returns { status, body }
// from the service so this layer stays a thin adapter.
app.post('/api/premium/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const { status, body } = handleStripeWebhook(req.body, req.headers['stripe-signature']);
    res.status(status).json(body);
  });

app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Physical-location gates. Each of these services now requires the
// player to be standing at the matching building — see services/
// locations.js. Mount-level middleware fires before each route's own
// requireAuth/requireCharacter; the duplicate downstream calls are a
// no-op on a per-tick basis.
const atBrokerage     = [requireAuth, requireCharacter, requireAtLocation('brokerage')];
const atEstateAgent   = [requireAuth, requireCharacter, requireAtLocation('estate_agent')];
const atAirport       = [requireAuth, requireCharacter, requireAtLocation('airport')];
const atDrugMarket    = [requireAuth, requireCharacter, requireAtLocation('drug_market')];
const atHighStreet    = [requireAuth, requireCharacter, requireAtLocation('high_street')];
const atBank          = [requireAuth, requireCharacter, requireAtLocation('bank')];
const atGunStore      = [requireAuth, requireCharacter, requireAtLocation('gun_store')];
const atDealership    = [requireAuth, requireCharacter, requireAtLocation('dealership')];
const atChopShop      = [requireAuth, requireCharacter, requireAtLocation('chop_shop')];
const atRepair        = [requireAuth, requireCharacter, requireAtLocation('repair')];
const atGym           = [requireAuth, requireCharacter, requireAtLocation('gym')];
const atRange         = [requireAuth, requireCharacter, requireAtLocation('range')];
const atUniversity    = [requireAuth, requireCharacter, requireAtLocation('university')];
const atDrivingSchool = [requireAuth, requireCharacter, requireAtLocation('driving_school')];
const atHospital      = [requireAuth, requireCharacter, requireAtLocation('hospital')];
const atCasino        = [requireAuth, requireCharacter, requireAtLocation('casino')];
const atBookmaker     = [requireAuth, requireCharacter, requireAtLocation('bookmaker')];
const atFence         = [requireAuth, requireCharacter, requireAtLocation('fence')];
const atGeneralStore  = [requireAuth, requireCharacter, requireAtLocation('general_store')];
app.use('/api/auth', authRoutes);
app.use('/api/character', characterRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/crimes', crimeRoutes);
app.use('/api/jail', jailRoutes);
app.use('/api/jailbreak', jailbreakRoutes);
app.use('/api/hospital', atHospital, hospitalRoutes);
// Job Board is a regular nav page — no longer a physical city
// location. Accessible from anywhere; per-route auth/character
// middleware lives inside jobBoardRoutes.
app.use('/api/job-board', jobBoardRoutes);
app.use('/api/player-shops', playerShopsRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/murder', murderRoutes);
app.use('/api/rob', robRoutes);
app.use('/api/customize', customizeRoutes);
app.use('/api/travel', atAirport, travelRoutes);
// /api/drugs splits gating internally: market browse/sell are gated
// to The Block, but /use works from your kit bag anywhere.
app.use('/api/drugs', drugRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/combat', combatRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/clothing',  clothingRoutes);
app.use('/api/bank', atBank, bankRoutes);
app.use('/api/stocks', atBrokerage, stockRoutes);
app.use('/api/properties', atEstateAgent, propertyRoutes);
app.use('/api/house', houseRoutes);
app.use('/api/gym', atGym, gymRoutes);
app.use('/api/range', atRange, rangeRoutes);
app.use('/api/university', atUniversity, universityRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/hangar',   hangarRoutes);
app.use('/api/aircraft-dealer', aircraftDealerRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/dealership', atDealership, dealershipRoutes);
app.use('/api/chopshop', atChopShop, chopshopRoutes);
app.use('/api/gunstore', atGunStore, gunstoreRoutes);
app.use('/api/repair', atRepair, repairRoutes);
app.use('/api/driving-school', atDrivingSchool, drivingSchoolRoutes);
app.use('/api/races', racesRoutes);
app.use('/api/factions', factionsRoutes);
app.use('/api/bounties', bountiesRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/shops', atHighStreet, shopsRoutes);
app.use('/api/specialisations', specialisationsRoutes);
app.use('/api/fence', atFence, fenceRoutes);
app.use('/api/casino', atCasino, casinoRoutes);
app.use('/api/bookmaker', atBookmaker, bookmakerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/missions', missionRoutes);
// /api/general-store splits gating internally: browse/buy are gated
// to the General Store, but /use works from your kit bag anywhere
// (espresso shots, scratchcards, mission items from the Inventory
// page).
app.use('/api/general-store', generalStoreRoutes);
app.use('/api/electronics', electronicsRoutes);
app.use('/api/online', onlineRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/pvp', pvpRoutes);
app.use('/api/gangs', gangsRoutes);
app.use('/api/turfs', turfsRoutes);
app.use('/api/oc', ocRoutes);
app.use('/api/incarceration', incarcerationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/areas', areaRoutes);
// Newspaper is read from the Dashboard now — no physical location.
app.use('/api/newspaper', newspaperRoutes);
app.use('/api/chases', chasesRoutes);
app.use('/api/burglary', burglaryRoutes);
app.use('/api/investigations', investigationsRoutes);
app.use('/api/trials', trialsRoutes);
app.use('/api/premium', premiumRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/chat', chatRoutes);

const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`[mafia] server listening on http://localhost:${PORT}`);
});
