import { Route, Routes } from 'react-router-dom';
import Criteria from './pages/Criteria.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Landing from './pages/Landing.tsx';
import Login from './pages/Login.tsx';
import NotFound from './pages/NotFound.tsx';
import Objection from './pages/Objection.tsx';
import PledgeDetail from './pages/PledgeDetail.tsx';
import Review from './pages/Review.tsx';
import Search from './pages/Search.tsx';
import Signup from './pages/Signup.tsx';
import Tour from './pages/Tour.tsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/tour" element={<Tour />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/search" element={<Search />} />
      <Route path="/o/:officialId" element={<Dashboard />} />
      <Route path="/o/:officialId/p/:pledgeId" element={<PledgeDetail />} />
      <Route path="/o/:officialId/objection" element={<Objection />} />
      <Route path="/criteria" element={<Criteria />} />
      <Route path="/review" element={<Review />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
