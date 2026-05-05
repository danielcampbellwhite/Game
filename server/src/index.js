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
import gymRoutes from './routes/gym.js';
import rangeRoutes from './routes/range.js';
import universityRoutes from './routes/university.js';
import inventoryRoutes from './routes/inventory.js';
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
import specialisationsRoutes from './routes/specialisations.js';
import fenceRoutes from './routes/fence.js';
import casinoRoutes from './routes/casino.js';
import bookmakerRoutes from './routes/bookmaker.js';
import notificationRoutes from './routes/notifications.js';
import missionRoutes from './routes/missions.js';
import generalStoreRoutes from './routes/general-store.js';
import eventsRoutes from './routes/events.js';
import playersRoutes from './routes/players.js';
import messagesRoutes from './routes/messages.js';
import pvpRoutes from './routes/pvp.js';
import gangsRoutes from './routes/gangs.js';
import turfsRoutes from './routes/turfs.js';
import ocRoutes from './routes/oc.js';
import incarcerationRoutes from './routes/incarceration.js';
import adminRoutes from './routes/admin.js';
import territoryRoutes from './routes/territories.js';

const PORT = process.env.PORT || 4000;

initDb();

const app = express();
app.use(cors());
// 256KB cap so player-uploaded profile pictures (data-URL POSTs to
// /api/character/avatar, ~50-100KB after client-side resizing) fit
// without bumping headroom for everything else by much.
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/character', characterRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/crimes', crimeRoutes);
app.use('/api/jail', jailRoutes);
app.use('/api/hospital', hospitalRoutes);
app.use('/api/job-board', jobBoardRoutes);
app.use('/api/player-shops', playerShopsRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/murder', murderRoutes);
app.use('/api/rob', robRoutes);
app.use('/api/customize', customizeRoutes);
app.use('/api/travel', travelRoutes);
app.use('/api/drugs', drugRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/combat', combatRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/gym', gymRoutes);
app.use('/api/range', rangeRoutes);
app.use('/api/university', universityRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/dealership', dealershipRoutes);
app.use('/api/chopshop', chopshopRoutes);
app.use('/api/gunstore', gunstoreRoutes);
app.use('/api/repair', repairRoutes);
app.use('/api/driving-school', drivingSchoolRoutes);
app.use('/api/races', racesRoutes);
app.use('/api/factions', factionsRoutes);
app.use('/api/bounties', bountiesRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/specialisations', specialisationsRoutes);
app.use('/api/fence', fenceRoutes);
app.use('/api/casino', casinoRoutes);
app.use('/api/bookmaker', bookmakerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/general-store', generalStoreRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/pvp', pvpRoutes);
app.use('/api/gangs', gangsRoutes);
app.use('/api/turfs', turfsRoutes);
app.use('/api/oc', ocRoutes);
app.use('/api/incarceration', incarcerationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/territories', territoryRoutes);

//  Static SPA serving (production / deploy) 
//
// In dev the Vite dev server runs separately on :5173 and proxies /api
// calls here. In a deployed build (Railway / Fly / etc.) we want a
// single origin: serve the built client from /, and let any non-/api
// path fall through to index.html so React Router can take over.
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
