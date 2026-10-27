/**
 * hooks/useHealth.js
 * ------------------
 * Custom hook that calls the GET /health endpoint and returns its state.
 *
 * Usage:
 *   const { data, loading, error } = useHealth()
 */
import { useEffect, useState } from 'react'
import { checkHealth } from '../api/healthApi'

export function useHealth() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    checkHealth()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
