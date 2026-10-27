/**
 * api/axiosClient.js
 * ------------------
 * Pre-configured Axios instance that points at the FastAPI backend.
 * All API modules should import from here rather than from 'axios' directly.
 *
 * Usage:
 *   import apiClient from './axiosClient'
 *   const { data } = await apiClient.get('/health')
 */
import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
})

// ---------------------------------------------------------------------------
// Request interceptor – attach JWT token if present
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ---------------------------------------------------------------------------
// Response interceptor – global error handling
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Add global error handling / toast notifications here
    return Promise.reject(error)
  },
)

export default apiClient
