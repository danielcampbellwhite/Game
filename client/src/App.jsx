import React, { useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useGame } from './context/GameContext.jsx';
import Nav from './components/Nav.jsx';
import Login from './pages/Login.jsx';
import CharacterCreate from './pages/CharacterCreate.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Crimes from './pages/Crimes.jsx';
import Jail from './pages/Jail.jsx';
import Hospital from './pages/Hospital.jsx';
import JobBoard from './pages/JobBoard.jsx';
import Travel from './pages/Travel.jsx';
import Drugs from './pages/Drugs.jsx';
import Businesses from './pages/Businesses.jsx';
import Combat from './pages/Combat.jsx';
import Bank from './pages/Bank.jsx';
import Stocks from './pages/Stocks.jsx';
import Property from './pages/Property.jsx';
import Gym from './pages/Gym.jsx';
import Range from './pages/Range.jsx';
import University from './pages/University.jsx';
import DrivingSchool from './pages/DrivingSchool.jsx';
import Races from './pages/Races.jsx';
import Bounties from './pages/Bounties.jsx';
import Specialisations from './pages/Specialisations.jsx';
import Shop from './pages/Shop.jsx';
import Patches from './pages/Patches.jsx';
import Fence from './pages/Fence.jsx';
import Inventory from './pages/Inventory.jsx';
import Missions from './pages/Missions.jsx';
import GeneralStore from './pages/GeneralStore.jsx';
import Newspaper from './pages/Newspaper.jsx';
import Burglary from './pages/Burglary.jsx';
import Trial from './pages/Trial.jsx';
import Players from './pages/Players.jsx';
import Player from './pages/Player.jsx';
import Messages from './pages/Messages.jsx';
import PvpFight from './pages/PvpFight.jsx';
import PvpChallengeModal from './components/PvpChallengeModal.jsx';
import RaceChallengeModal from './components/RaceChallengeModal.jsx';
import Gangs from './pages/Gangs.jsx';
import Gang from './pages/Gang.jsx';
import Wars from './pages/Wars.jsx';
import OC from './pages/OC.jsx';
import OCPlan from './pages/OCPlan.jsx';
import OcInviteModal from './components/OcInviteModal.jsx';
import CarDealer from './pages/CarDealer.jsx';
import AircraftDealer from './pages/AircraftDealer.jsx';
import Online from './pages/Online.jsx';
import Car from './pages/Car.jsx';
import House from './pages/House.jsx';
import GunStore from './pages/GunStore.jsx';
import ChopShop from './pages/ChopShop.jsx';
import Repair from './pages/Repair.jsx';
import City from './pages/City.jsx';
import Casino from './pages/Casino.jsx';
import Bookmaker from './pages/Bookmaker.jsx';
import PlayerShops from './pages/PlayerShops.jsx';
import PlayerShop from './pages/PlayerShop.jsx';
import Trades from './pages/Trades.jsx';
import Trade from './pages/Trade.jsx';
import Murder from './pages/Murder.jsx';
import Rob from './pages/Rob.jsx';
import CustomizeWeapons from './pages/CustomizeWeapons.jsx';
import CustomizeVehicles from './pages/CustomizeVehicles.jsx';
import NewCharacter from './pages/NewCharacter.jsx';
import Admin from './pages/Admin.jsx';
import Premium from './pages/Premium.jsx';
import Friends from './pages/Friends.jsx';
import ClothingStore from './pages/ClothingStore.jsx';
import HighStreet from './pages/HighStreet.jsx';
import PhoneFab from './components/PhoneFab.jsx';
import PhoneOverlay from './components/PhoneOverlay.jsx';

function Protected({ children }) {
  const { token, character } = useGame();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!character) return <Navigate to="/create" replace />;

  if (character.status === 'pending_new_character' && location.pathname !== '/new-character') {
    return <Navigate to="/new-character" replace />;
  }

  const now = Date.now();
  const inHospital = character.hospital_until && character.hospital_until > now;
  if (inHospital && location.pathname !== '/hospital') {
    return <Navigate to="/hospital" replace />;
  }

  const inJail = character.jail_until && character.jail_until > now;
  if (inJail && location.pathname !== '/jail') {
    return <Navigate to="/jail" replace />;
  }

  // Trial lockout — if the character has a pending trial, the only
  // page they can navigate to is /trial. Resolving the trial there
  // (plead / court) clears the flag and unblocks the rest of the
  // game. The flag lives on character.pending_trial (server tags it
  // on publicCharacter).
  //
  // Hospital and jail are higher-priority lockouts: while in either,
  // skip the trial redirect so the two guards don't bounce the user
  // between /hospital and /trial in an infinite loop. The trial
  // resumes as soon as hospital_until / jail_until expires.
  if (!inHospital && !inJail && character.pending_trial && location.pathname !== '/trial') {
    return <Navigate to="/trial" replace />;
  }

  return children;
}

function Footer() {
  const { token, character } = useGame();
  if (!token || !character) return null;
  // Sign-out + admin moved into the Account dropdown in the main
  // nav (see components/Nav.jsx). The footer is now a brand strip.
  return (
    <footer className="border-t border-ink-100/10 bg-ink-950/85 backdrop-blur">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-[12px] uppercase tracking-wide text-ink-100/40">
          Mafia Life <span className="font-cursive normal-case tracking-normal text-gold-400/70 text-[14px]">Criminal Empire</span>
        </span>
      </div>
    </footer>
  );
}

function ScrollToTop() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, search]);
  return null;
}

// Bounces the player back to the City map when a gated page hits a
// "you're not at this location" 409. The api wrapper fires the event;
// we own navigation up here so api.js doesn't need router awareness.
function LocationGateRouter() {
  const nav = useNavigate();
  const location = useLocation();
  const pathRef = React.useRef(location.pathname);
  React.useEffect(() => { pathRef.current = location.pathname; }, [location.pathname]);
  useEffect(() => {
    const handler = () => {
      if (pathRef.current !== '/city') nav('/city', { replace: true });
    };
    window.addEventListener('mafia:not-at-location', handler);
    return () => window.removeEventListener('mafia:not-at-location', handler);
  }, [nav]);
  return null;
}

// Phone widget + overlay. The phone is the only chat surface — the
// old floating ChatWidget bubble is retired in favour of opening Live
// Chat as an app inside the phone, so there's only one icon in the
// bottom-right corner.
function Phone() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <PhoneFab onOpen={() => setOpen(true)} />
      <PhoneOverlay open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function BootSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-1000">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-ink-100/15 border-t-blood-400 animate-spin" />
        <div className="text-[13px] uppercase tracking-widest text-ink-100/45">Loading…</div>
      </div>
    </div>
  );
}

export default function App() {
  const { token, character, bootstrapped } = useGame();
  if (token && !bootstrapped) return <BootSpinner />;
  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      {token && character ? <LocationGateRouter /> : null}
      {token && character ? (
        <>
          <div className="sticky top-0 z-30">
            <Nav />
          </div>
          <PvpChallengeModal />
          <RaceChallengeModal />
          <OcInviteModal />
          <Phone />
        </>
      ) : null}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6">
        <Routes>
          <Route path="/login" element={token ? <Navigate to={character ? '/' : '/create'} replace /> : <Login />} />
          <Route path="/patches" element={<Patches />} />
          <Route path="/create" element={token && !character ? <CharacterCreate /> : <Navigate to={token ? '/' : '/login'} replace />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/crimes" element={<Protected><Crimes /></Protected>} />
          <Route path="/jail" element={<Protected><Jail /></Protected>} />
          <Route path="/hospital" element={<Protected><Hospital /></Protected>} />
          <Route path="/jobs" element={<Protected><JobBoard /></Protected>} />
          <Route path="/travel" element={<Protected><Travel /></Protected>} />
          <Route path="/drugs" element={<Protected><Drugs /></Protected>} />
          <Route path="/businesses" element={<Protected><Businesses /></Protected>} />
          <Route path="/combat" element={<Protected><Combat /></Protected>} />
          <Route path="/bank" element={<Protected><Bank /></Protected>} />
          <Route path="/stocks" element={<Protected><Stocks /></Protected>} />
          <Route path="/property" element={<Protected><Property /></Protected>} />
          <Route path="/gym" element={<Protected><Gym /></Protected>} />
          <Route path="/range" element={<Protected><Range /></Protected>} />
          <Route path="/university" element={<Protected><University /></Protected>} />
          <Route path="/driving-school" element={<Protected><DrivingSchool /></Protected>} />
          <Route path="/races" element={<Protected><Races /></Protected>} />
          <Route path="/bounties" element={<Protected><Bounties /></Protected>} />
          <Route path="/specialisations" element={<Protected><Specialisations /></Protected>} />
          <Route path="/shop/:slug" element={<Protected><Shop /></Protected>} />
          <Route path="/fence" element={<Protected><Fence /></Protected>} />
          <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
          <Route path="/missions" element={<Protected><Missions /></Protected>} />
          <Route path="/general-store" element={<Protected><GeneralStore /></Protected>} />
          <Route path="/newspaper" element={<Protected><Newspaper /></Protected>} />
          <Route path="/burglary" element={<Protected><Burglary /></Protected>} />
          <Route path="/trial" element={<Protected><Trial /></Protected>} />
          <Route path="/players" element={<Protected><Players /></Protected>} />
          <Route path="/players/:id" element={<Protected><Player /></Protected>} />
          <Route path="/messages" element={<Protected><Messages /></Protected>} />
          <Route path="/messages/with/:otherId" element={<Protected><Messages /></Protected>} />
          <Route path="/pvp/fight" element={<Protected><PvpFight /></Protected>} />
          <Route path="/gangs" element={<Protected><Gangs /></Protected>} />
          <Route path="/gangs/:id" element={<Protected><Gang /></Protected>} />
          <Route path="/gang" element={<Protected><Gang /></Protected>} />
          <Route path="/wars" element={<Protected><Wars /></Protected>} />
          <Route path="/oc" element={<Protected><OC /></Protected>} />
          <Route path="/oc/plans/:id" element={<Protected><OCPlan /></Protected>} />
          <Route path="/dealership" element={<Protected><CarDealer /></Protected>} />
          <Route path="/aircraft-dealer" element={<Protected><AircraftDealer /></Protected>} />
          <Route path="/online" element={<Protected><Online /></Protected>} />
          <Route path="/car" element={<Protected><Car /></Protected>} />
          <Route path="/house" element={<Protected><House /></Protected>} />
          <Route path="/gun-store" element={<Protected><GunStore /></Protected>} />
          <Route path="/chop-shop" element={<Protected><ChopShop /></Protected>} />
          <Route path="/repair" element={<Protected><Repair /></Protected>} />
          <Route path="/city" element={<Protected><City /></Protected>} />
          <Route path="/casino" element={<Protected><Casino /></Protected>} />
          <Route path="/bookmaker" element={<Protected><Bookmaker /></Protected>} />
          <Route path="/shops" element={<Protected><PlayerShops /></Protected>} />
          <Route path="/shops/:id" element={<Protected><PlayerShop /></Protected>} />
          <Route path="/trades" element={<Protected><Trades /></Protected>} />
          <Route path="/trades/:id" element={<Protected><Trade /></Protected>} />
          <Route path="/murder/:id" element={<Protected><Murder /></Protected>} />
          <Route path="/rob/:id" element={<Protected><Rob /></Protected>} />
          <Route path="/customize/weapons" element={<Protected><CustomizeWeapons /></Protected>} />
          <Route path="/customize/vehicles" element={<Protected><CustomizeVehicles /></Protected>} />
          <Route path="/new-character" element={<Protected><NewCharacter /></Protected>} />
          <Route path="/admin" element={<Protected><Admin /></Protected>} />
          <Route path="/premium" element={<Protected><Premium /></Protected>} />
          <Route path="/friends" element={<Protected><Friends /></Protected>} />
          <Route path="/clothing/:tier" element={<Protected><ClothingStore /></Protected>} />
          <Route path="/high-street" element={<Protected><HighStreet /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
