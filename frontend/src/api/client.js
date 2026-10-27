/**
 * src/api/client.js
 * -----------------
 * Axios instance attaching the Supabase / Guest JWT access token on every request.
 */
import axios from 'axios'
import { supabase } from './supabaseClient'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 60000, // 60s timeout for AI generation
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach token (guest token from localStorage or session token from Supabase)
client.interceptors.request.use(
  async (config) => {
    try {
      // 1. Check localStorage first (used by Guest Mode and cached sessions)
      let token = localStorage.getItem('access_token')

      // 2. If no local token, try Supabase session
      if (!token) {
        const { data } = await supabase.auth.getSession()
        token = data?.session?.access_token
      }

      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch (err) {
      console.warn('Could not retrieve access token:', err)
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for clear error reporting
client.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = 'An unexpected error occurred'
    if (error.response?.data?.detail) {
      message = typeof error.response.data.detail === 'string'
        ? error.response.data.detail
        : JSON.stringify(error.response.data.detail)
    } else if (error.message) {
      message = error.message
    }
    return Promise.reject(new Error(message))
  }
)

export default client

// ---------------------------------------------------------------------------
// Trips API Helpers
// ---------------------------------------------------------------------------
export const tripsApi = {
  list: () => client.get('/trips').then((res) => res.data),
  get: (id) => client.get(`/trips/${id}`).then((res) => res.data),
  generate: (data) => client.post('/trips/generate', data).then((res) => res.data),
  update: (id, data) => client.put(`/trips/${id}`, data).then((res) => res.data),
  regenerateDay: (id, { day_number, instruction }) =>
    client.post(`/trips/${id}/regenerate-day`, { day_number, instruction }).then((res) => res.data),
  delete: (id) => client.delete(`/trips/${id}`).then((res) => res.data),
  share: (id, { email, role }) =>
    client.post(`/trips/${id}/share`, { email, role }).then((res) => res.data),
}
