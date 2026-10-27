/**
 * api/healthApi.js
 * ----------------
 * Wrappers around the /health endpoint.
 */
import apiClient from './axiosClient'

/** Check API liveness. Returns { status, app, env } */
export const checkHealth = () => apiClient.get('/health').then((r) => r.data)
