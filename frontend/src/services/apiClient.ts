import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getAds = (params?: Record<string, unknown>) =>
  apiClient.get('/ads', { params }).then(res => res.data);

export const getAdById = (id: string) =>
  apiClient.get(`/ads/${id}`).then(res => res.data);

export const loginUser = (email: string, password: string) =>
  apiClient.post('/auth/login', { email, password }).then(res => res.data);

export const fetchCurrentUser = () =>
  apiClient.get('/auth/me').then(res => res.data);

export default apiClient;
