import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../api/supabaseClient'

const AuthContext = createContext(null)

const GUEST_DEFAULT_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'guest@wanderai.com',
  user_metadata: {
    full_name: 'Guest Traveler',
  },
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // 1. Check local guest/demo session first
        const storedGuest = localStorage.getItem('wanderai_guest_user')
        const storedToken = localStorage.getItem('access_token')

        if (storedGuest && storedToken) {
          const parsedUser = JSON.parse(storedGuest)
          setUser(parsedUser)
          setSession({ access_token: storedToken, user: parsedUser })
          setLoading(false)
          return
        }

        // 2. If Supabase is configured, check Supabase session
        if (isSupabaseConfigured) {
          const { data } = await supabase.auth.getSession()
          if (data.session) {
            setSession(data.session)
            setUser(data.session.user)
            localStorage.setItem('access_token', data.session.access_token)
          }
        }
      } catch (err) {
        console.warn('Error reading initial session:', err)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // Listen for Supabase auth state changes if configured
    let subscription = null
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange((event, currentSession) => {
        // Only override if not in active guest mode
        if (!localStorage.getItem('wanderai_guest_user')) {
          setSession(currentSession)
          setUser(currentSession?.user ?? null)
          if (currentSession?.access_token) {
            localStorage.setItem('access_token', currentSession.access_token)
          } else {
            localStorage.removeItem('access_token')
          }
        }
        setLoading(false)
      })
      subscription = data.subscription
    }

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  // 1-Click Guest Login
  const continueAsGuest = (customEmail = null, customName = null) => {
    const guestUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: customEmail || 'guest@wanderai.com',
      user_metadata: {
        full_name: customName || (customEmail ? customEmail.split('@')[0] : 'Guest Traveler'),
      },
    }
    const guestSession = {
      access_token: 'demo-guest-token',
      user: guestUser,
    }

    localStorage.setItem('access_token', 'demo-guest-token')
    localStorage.setItem('wanderai_guest_user', JSON.stringify(guestUser))
    setUser(guestUser)
    setSession(guestSession)
    return { user: guestUser, session: guestSession }
  }

  const signup = async (email, password, fullName = '') => {
    // If Supabase is configured, attempt real Supabase sign up
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        })
        if (error) throw error
        return data
      } catch (err) {
        // If it was a network error ("Failed to fetch"), fall back seamlessly to local account
        if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
          console.info('Supabase unreachable, activating local account session.')
          return continueAsGuest(email, fullName)
        }
        throw err
      }
    }

    // Default: local account session
    return continueAsGuest(email, fullName)
  }

  const login = async (email, password) => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        localStorage.removeItem('wanderai_guest_user')
        return data
      } catch (err) {
        if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
          console.info('Supabase unreachable, logging in as local user.')
          return continueAsGuest(email, email.split('@')[0])
        }
        throw err
      }
    }

    return continueAsGuest(email, email.split('@')[0])
  }

  const logout = async () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('wanderai_guest_user')
    setUser(null)
    setSession(null)

    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut()
      } catch (err) {
        console.warn('Supabase signOut error:', err)
      }
    }
  }

  const value = {
    user,
    session,
    loading,
    signup,
    login,
    logout,
    continueAsGuest,
    isGuest: Boolean(localStorage.getItem('wanderai_guest_user')),
    isAuthenticated: Boolean(user),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
