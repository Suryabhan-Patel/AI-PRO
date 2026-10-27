import React, { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { tripsApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function Dashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState('all') // 'all' | 'owner' | 'shared'
  const [deletingId, setDeletingId] = useState(null)

  const fetchTrips = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await tripsApi.list()
      setTrips(data || [])
    } catch (err) {
      console.error('Failed to fetch trips:', err)
      setError(err.message || 'Could not load your trips.')
      toast.error('Could not load trips: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrips()
  }, [])

  const handleDeleteTrip = async (e, tripId, tripTitle) => {
    e.preventDefault()
    e.stopPropagation()

    if (!window.confirm(`Are you sure you want to delete "${tripTitle}"? This cannot be undone.`)) {
      return
    }

    try {
      setDeletingId(tripId)
      await tripsApi.delete(tripId)
      toast.success('Trip deleted successfully.')
      setTrips((prev) => prev.filter((t) => t.id !== tripId))
    } catch (err) {
      toast.error('Failed to delete trip: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const query = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !query ||
        trip.destination?.toLowerCase().includes(query) ||
        trip.title?.toLowerCase().includes(query) ||
        trip.travel_style?.toLowerCase().includes(query)

      const isOwner = trip.role === 'owner' || trip.owner_id === user?.id
      const matchesRole =
        filterRole === 'all' ||
        (filterRole === 'owner' && isOwner) ||
        (filterRole === 'shared' && !isOwner)

      return matchesSearch && matchesRole
    })
  }, [trips, searchQuery, filterRole, user?.id])

  const formatDateRange = (start, end) => {
    if (!start) return 'Flexible dates'
    const s = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    if (!end || end === start) return s
    const e = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${s} – ${e}`
  }

  return (
    <Layout>
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            My Travel Itineraries
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage your AI-crafted adventures and group travel plans
          </p>
        </div>

        <Link
          to="/trips/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-200 transition-all duration-150 shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>Plan New Trip</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by city, title, style..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl self-start sm:self-auto border border-slate-200/60">
          <button
            onClick={() => setFilterRole('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              filterRole === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({trips.length})
          </button>
          <button
            onClick={() => setFilterRole('owner')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              filterRole === 'owner'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Trips
          </button>
          <button
            onClick={() => setFilterRole('shared')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              filterRole === 'shared'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Shared
          </button>
        </div>
      </div>

      {/* Main Grid / Content */}
      <div className="mt-8">
        {loading ? (
          /* Loading Skeletons */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm animate-pulse space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div className="h-6 w-24 bg-slate-200 rounded-full"></div>
                  <div className="h-5 w-16 bg-slate-200 rounded-md"></div>
                </div>
                <div className="h-6 w-3/4 bg-slate-200 rounded"></div>
                <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <div className="h-4 w-full bg-slate-200 rounded"></div>
                  <div className="h-2 w-full bg-slate-200 rounded-full"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          /* Error State */
          <div className="p-8 rounded-3xl bg-rose-50 border border-rose-200 text-center max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl mb-3">
              ✕
            </div>
            <h3 className="font-bold text-slate-900 text-lg">Unable to load trips</h3>
            <p className="text-sm text-slate-600 mt-1 mb-4">{error}</p>
            <button
              onClick={fetchTrips}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition"
            >
              Try Again
            </button>
          </div>
        ) : filteredTrips.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center max-w-xl mx-auto shadow-sm">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              {searchQuery ? 'No matching trips found' : 'No trips planned yet'}
            </h3>
            <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto">
              {searchQuery
                ? 'Try adjusting your search query or role filter.'
                : 'Tell our AI where you want to go and what you love doing, and get a complete day-by-day itinerary in seconds.'}
            </p>
            <div className="mt-6">
              <Link
                to="/trips/new"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-200 transition"
              >
                <span>Plan Your First Trip</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          </div>
        ) : (
          /* Trips Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTrips.map((trip) => {
              const isOwner = trip.role === 'owner' || trip.owner_id === user?.id
              const budget = Number(trip.budget || 0)
              const cost = Number(trip.estimated_cost || 0)
              const percent = budget > 0 ? Math.min(Math.round((cost / budget) * 100), 100) : 0

              return (
                <div
                  key={trip.id}
                  onClick={() => navigate(`/trips/${trip.id}`)}
                  className="group bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 hover:border-indigo-200 transition-all duration-200 cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Top row: Destination badge + Role badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <svg className="w-3.5 h-3.5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        {trip.destination}
                      </span>

                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isOwner
                            ? 'bg-slate-100 text-slate-700'
                            : trip.role === 'editor'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isOwner ? 'Owner' : trip.role}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                      {trip.title}
                    </h3>

                    {/* Dates */}
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {formatDateRange(trip.start_date, trip.end_date)}
                    </p>

                    {/* Meta tags */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
                      {trip.travel_style && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 capitalize">
                          {trip.travel_style}
                        </span>
                      )}
                      {trip.pace && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 capitalize">
                          {trip.pace} pace
                        </span>
                      )}
                      {trip.group_size && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {trip.group_size} {trip.group_size === 1 ? 'person' : 'people'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom section: Cost progress & actions */}
                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-baseline text-xs mb-1.5 font-semibold">
                      <span className="text-slate-500">Estimated Cost</span>
                      <span className="text-slate-900">
                        ${cost.toLocaleString()}
                        {budget > 0 && (
                          <span className="text-slate-400 font-normal"> / ${budget.toLocaleString()}</span>
                        )}
                      </span>
                    </div>

                    {budget > 0 && (
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            cost > budget ? 'bg-rose-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between pt-1">
                      <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                        View Itinerary &rarr;
                      </span>

                      {isOwner && (
                        <button
                          onClick={(e) => handleDeleteTrip(e, trip.id, trip.title)}
                          disabled={deletingId === trip.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Delete trip"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
