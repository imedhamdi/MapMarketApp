import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import AdDetailPage from './pages/AdDetailPage';
import MessagesPage from './pages/MessagesPage';
import LoginPage from './pages/LoginPage';
import Navbar from './components/Layout/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/global.css';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomePage />} />
        <Route element={<ProtectedRoute />}> 
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/messages" element={<MessagesPage />} />
        </Route>
        <Route path="/ad/:id" element={<AdDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}
